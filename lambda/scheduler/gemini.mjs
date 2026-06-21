import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { createHash } from "node:crypto";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssm = new SSMClient({});

const CACHE_TABLE =
  process.env.EXPLANATION_CACHE_TABLE || "SiteGuardian-ExplanationCache";
const RATE_LIMIT_TABLE =
  process.env.RATE_LIMIT_TABLE || "SiteGuardian-RateLimitCounters";
const SSM_KEY_NAME =
  process.env.GEMINI_SSM_KEY || "/siteguardian/gemini-api-key";
const DAILY_LIMIT = parseInt(process.env.GEMINI_DAILY_LIMIT || "50", 10);
const GEMINI_MODEL = "gemini-2.0-flash-lite";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

let cachedApiKey = null;

async function getApiKey() {
  if (cachedApiKey) return cachedApiKey;
  try {
    const result = await ssm.send(
      new GetParameterCommand({
        Name: SSM_KEY_NAME,
        WithDecryption: true,
      }),
    );
    cachedApiKey = result.Parameter.Value;
    return cachedApiKey;
  } catch {
    return null;
  }
}

function buildSignatureHash(metricName, beforeValue, afterValue) {
  const bucket = (v) => Math.round(v * 10) / 10;
  const sig = `${metricName}:${bucket(beforeValue)}:${bucket(afterValue)}`;
  return createHash("sha256").update(sig).digest("hex").slice(0, 16);
}

async function checkCache(signatureHash) {
  try {
    const result = await ddb.send(
      new GetCommand({
        TableName: CACHE_TABLE,
        Key: { signatureHash },
      }),
    );
    return result.Item?.explanationText ?? null;
  } catch {
    return null;
  }
}

async function writeCache(signatureHash, explanationText, metricName) {
  try {
    await ddb.send(
      new PutCommand({
        TableName: CACHE_TABLE,
        Item: {
          signatureHash,
          explanationText,
          metricName,
          createdAt: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + 30 * 86400,
        },
      }),
    );
  } catch {}
}

async function checkAndIncrementRateLimit() {
  const dateKey = new Date().toISOString().slice(0, 10);
  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: RATE_LIMIT_TABLE,
        Key: { dateKey },
        UpdateExpression:
          "SET callCount = if_not_exists(callCount, :zero) + :one, #ttl = :ttl",
        ExpressionAttributeNames: { "#ttl": "ttl" },
        ExpressionAttributeValues: {
          ":zero": 0,
          ":one": 1,
          ":ttl": Math.floor(Date.now() / 1000) + 2 * 86400,
          ":limit": DAILY_LIMIT,
        },
        ConditionExpression:
          "attribute_not_exists(callCount) OR callCount < :limit",
        ReturnValues: "ALL_NEW",
      }),
    );
    return { allowed: true, count: result.Attributes.callCount };
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return { allowed: false, count: DAILY_LIMIT };
    }
    return { allowed: false, count: -1 };
  }
}

function buildPrompt(metricName, beforeValue, afterValue, url) {
  const metricLabels = {
    performanceScore: "Lighthouse Performance Score",
    accessibilityScore: "Accessibility Score",
    lcp: "Largest Contentful Paint (seconds)",
    cls: "Cumulative Layout Shift",
    inp: "Interaction to Next Paint (ms)",
    violationCount: "Accessibility Violation Count",
  };

  const label = metricLabels[metricName] || metricName;
  const direction =
    metricName === "performanceScore" || metricName === "accessibilityScore"
      ? "dropped"
      : "increased";

  return `You are a web performance expert. A website monitoring tool detected a regression on ${url}.

The metric "${label}" ${direction} from ${beforeValue} to ${afterValue}.

In 2-3 sentences, explain the most likely causes of this regression and one actionable fix the developer should try first. Be specific and practical. Do not use markdown formatting.`;
}

async function callGemini(prompt, apiKey) {
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 200,
        temperature: 0.3,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Gemini API ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return (
    data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
    "No explanation generated."
  );
}

export async function explainRegression(
  metricName,
  beforeValue,
  afterValue,
  url,
) {
  const signatureHash = buildSignatureHash(metricName, beforeValue, afterValue);

  // 1. Check cache
  const cached = await checkCache(signatureHash);
  if (cached) {
    return { text: cached, source: "cache", signatureHash };
  }

  // 2. Check rate limit
  const rateCheck = await checkAndIncrementRateLimit();
  if (!rateCheck.allowed) {
    return {
      text: null,
      source: "rate-limited",
      signatureHash,
    };
  }

  // 3. Get API key
  const apiKey = await getApiKey();
  if (!apiKey) {
    return {
      text: null,
      source: "no-api-key",
      signatureHash,
    };
  }

  // 4. Call Gemini
  try {
    const prompt = buildPrompt(metricName, beforeValue, afterValue, url);
    const explanation = await callGemini(prompt, apiKey);
    await writeCache(signatureHash, explanation, metricName);
    return { text: explanation, source: "gemini", signatureHash };
  } catch (err) {
    console.error("Gemini call failed:", err.message);
    return {
      text: null,
      source: "error",
      error: err.message,
      signatureHash,
    };
  }
}
