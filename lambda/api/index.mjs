import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { createRemoteJWKSigner, verifyToken } from "./auth.mjs";
import { explainRegression } from "./gemini.mjs";
import { computeVisualDiff } from "./visual-diff.mjs";
import { sendRegressionAlert } from "./alerts.mjs";

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const s3 = new S3Client({});
const lambdaClient = new LambdaClient({});

const TABLES = {
  projects: process.env.PROJECTS_TABLE || "SiteGuardian-Projects",
  scanResults: process.env.SCAN_RESULTS_TABLE || "SiteGuardian-ScanResults",
  regressionEvents:
    process.env.REGRESSION_EVENTS_TABLE || "SiteGuardian-RegressionEvents",
};

function getScanEngineUrl() {
  return process.env.SCAN_ENGINE_URL || "";
}
const SCREENSHOT_BUCKET =
  process.env.SCREENSHOT_BUCKET || "siteguardian-screenshots";

const COGNITO_ISSUER = process.env.COGNITO_ISSUER;

const verifier = createRemoteJWKSigner(COGNITO_ISSUER);

function cors(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
    body: JSON.stringify(body),
  };
}

async function authenticate(event) {
  const authHeader =
    event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }
  const token = authHeader.slice(7);
  const payload = await verifyToken(token, verifier, COGNITO_ISSUER);
  return payload.sub;
}

// --- Route handlers ---

async function listProjects(userId) {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLES.projects,
      IndexName: "userId-index",
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
    }),
  );
  return cors(result.Items || []);
}

async function createProject(userId, body) {
  const projectId = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const item = {
    projectId,
    userId,
    url: body.url,
    name: body.name || new URL(body.url).hostname,
    scanFrequency: body.scanFrequency || "daily",
    alertEmail: body.alertEmail || null,
    createdAt: new Date().toISOString(),
  };

  await ddb.send(new PutCommand({ TableName: TABLES.projects, Item: item }));
  return cors(item, 201);
}

async function getProject(userId, projectId) {
  const result = await ddb.send(
    new GetCommand({
      TableName: TABLES.projects,
      Key: { projectId },
    }),
  );

  if (!result.Item || result.Item.userId !== userId) {
    return cors({ error: "Project not found" }, 404);
  }
  return cors(result.Item);
}

async function updateProject(userId, projectId, body) {
  const existing = await ddb.send(
    new GetCommand({ TableName: TABLES.projects, Key: { projectId } }),
  );
  if (!existing.Item || existing.Item.userId !== userId) {
    return cors({ error: "Project not found" }, 404);
  }

  const updates = {};
  const names = {};
  const values = {};
  let expr = "SET";
  const fields = ["name", "scanFrequency", "alertEmail"];
  fields.forEach((f) => {
    if (body[f] !== undefined) {
      updates[f] = body[f];
      const key = `#${f}`;
      const val = `:${f}`;
      names[key] = f;
      values[val] = body[f];
      expr += ` ${key} = ${val},`;
    }
  });

  if (Object.keys(updates).length === 0) {
    return cors({ error: "No fields to update" }, 400);
  }

  expr = expr.slice(0, -1);

  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.projects,
      Key: { projectId },
      UpdateExpression: expr,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );

  return cors({ ...existing.Item, ...updates });
}

async function deleteProject(userId, projectId) {
  const existing = await ddb.send(
    new GetCommand({ TableName: TABLES.projects, Key: { projectId } }),
  );
  if (!existing.Item || existing.Item.userId !== userId) {
    return cors({ error: "Project not found" }, 404);
  }

  await ddb.send(
    new DeleteCommand({ TableName: TABLES.projects, Key: { projectId } }),
  );
  return cors({ deleted: true });
}

async function getScanResults(userId, projectId, limit = 30) {
  const project = await ddb.send(
    new GetCommand({ TableName: TABLES.projects, Key: { projectId } }),
  );
  if (!project.Item || project.Item.userId !== userId) {
    return cors({ error: "Project not found" }, 404);
  }

  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLES.scanResults,
      KeyConditionExpression: "projectId = :pid",
      ExpressionAttributeValues: { ":pid": projectId },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return cors(result.Items || []);
}

async function getRegressionEvents(userId, projectId) {
  const project = await ddb.send(
    new GetCommand({ TableName: TABLES.projects, Key: { projectId } }),
  );
  if (!project.Item || project.Item.userId !== userId) {
    return cors({ error: "Project not found" }, 404);
  }

  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLES.regressionEvents,
      KeyConditionExpression: "projectId = :pid",
      ExpressionAttributeValues: { ":pid": projectId },
      ScanIndexForward: false,
      Limit: 20,
    }),
  );
  return cors(result.Items || []);
}

// Regression thresholds (same as scheduler)
const THRESHOLDS = {
  performanceScore: { absolute: 5, direction: "decrease" },
  accessibilityScore: { absolute: 5, direction: "decrease" },
  lcp: { absolute: 0.5, direction: "increase" },
  cls: { absolute: 0.05, direction: "increase" },
  inp: { absolute: 50, direction: "increase" },
  violationCount: { absolute: 2, direction: "increase" },
};

function detectRegressions(current, previous) {
  const regressions = [];
  for (const [metric, threshold] of Object.entries(THRESHOLDS)) {
    const curr = current[metric];
    const prev = previous[metric];
    if (curr == null || prev == null) continue;
    const diff =
      threshold.direction === "decrease" ? prev - curr : curr - prev;
    if (diff >= threshold.absolute) {
      regressions.push({
        metricName: metric,
        beforeValue: prev,
        afterValue: curr,
        magnitude: Math.round(diff * 100) / 100,
      });
    }
  }
  return regressions;
}

async function triggerScanNow(userId, projectId, body) {
  const project = await ddb.send(
    new GetCommand({ TableName: TABLES.projects, Key: { projectId } }),
  );
  if (!project.Item || project.Item.userId !== userId) {
    return cors({ error: "Project not found" }, 404);
  }

  const scanData = body?.scanData;
  if (!scanData || scanData.performanceScore === undefined) {
    return cors({ error: "Missing scanData in request body" }, 400);
  }
  const scanTimestamp = scanData.scannedAt || new Date().toISOString();

  let screenshotS3Key = null;
  if (scanData.screenshotBase64) {
    screenshotS3Key = `screenshots/${projectId}/${scanTimestamp}.webp`;
    const buf = Buffer.from(scanData.screenshotBase64, "base64");
    await s3.send(
      new PutObjectCommand({
        Bucket: SCREENSHOT_BUCKET,
        Key: screenshotS3Key,
        Body: buf,
        ContentType: "image/webp",
      }),
    );
  }

  const scanItem = {
    projectId,
    scanTimestamp,
    performanceScore: scanData.performanceScore,
    accessibilityScore: scanData.accessibilityScore,
    lcp: scanData.lcp,
    cls: scanData.cls,
    inp: scanData.inp,
    violationCount: scanData.violationCount,
    screenshotS3Key,
    diffS3Key: null,
    diffPercent: null,
  };

  await ddb.send(
    new PutCommand({ TableName: TABLES.scanResults, Item: scanItem }),
  );

  // Get previous scan for regression + visual diff
  const prevResult = await ddb.send(
    new QueryCommand({
      TableName: TABLES.scanResults,
      KeyConditionExpression: "projectId = :pid",
      ExpressionAttributeValues: { ":pid": projectId },
      ScanIndexForward: false,
      Limit: 2,
    }),
  );
  const prevItems = prevResult.Items || [];
  const previousScan = prevItems.length > 1 ? prevItems[1] : null;

  // Visual diff
  if (previousScan?.screenshotS3Key && scanItem.screenshotS3Key) {
    const diffResult = await computeVisualDiff(
      previousScan.screenshotS3Key,
      scanItem.screenshotS3Key,
      projectId,
      scanTimestamp,
    );
    if (diffResult) {
      scanItem.diffS3Key = diffResult.diffS3Key;
      scanItem.diffPercent = diffResult.diffPercent;
      await ddb.send(
        new UpdateCommand({
          TableName: TABLES.scanResults,
          Key: { projectId, scanTimestamp },
          UpdateExpression: "SET diffS3Key = :dk, diffPercent = :dp",
          ExpressionAttributeValues: {
            ":dk": diffResult.diffS3Key,
            ":dp": diffResult.diffPercent,
          },
        }),
      );
    }
  }

  // Regression detection + AI explanation
  let regressions = [];
  if (previousScan) {
    regressions = detectRegressions(scanItem, previousScan);
    for (const reg of regressions) {
      let explanationText = null;
      let explainedByAI = false;

      const aiResult = await explainRegression(
        reg.metricName,
        reg.beforeValue,
        reg.afterValue,
        project.Item.url,
      );
      if (aiResult.text) {
        explanationText = aiResult.text;
        explainedByAI = aiResult.source === "gemini" || aiResult.source === "cache";
      }

      reg.explanationText = explanationText;
      reg.explainedByAI = explainedByAI;

      await ddb.send(
        new PutCommand({
          TableName: TABLES.regressionEvents,
          Item: {
            projectId,
            eventTimestamp: `${scanTimestamp}#${reg.metricName}`,
            metricName: reg.metricName,
            beforeValue: reg.beforeValue,
            afterValue: reg.afterValue,
            causeCategory: "manual-scan",
            explanationText,
            explainedByAI,
          },
        }),
      );
    }

    // Send email alert
    if (regressions.length > 0) {
      await sendRegressionAlert(
        project.Item,
        regressions,
        scanTimestamp,
      );
    }
  }

  return cors({
    ...scanItem,
    regressionsDetected: regressions.length,
    regressions,
  });
}

// --- Router ---

export async function handler(event) {
  if (event.requestContext?.http?.method === "OPTIONS") {
    return cors({});
  }

  const method = event.requestContext?.http?.method || event.httpMethod || "GET";
  const path = event.rawPath || event.path || "/";

  // Public endpoint: instant scan (no auth)
  if (path === "/scan" && method === "POST") {
    // Proxy to scan engine — in production this would invoke the scan Lambda directly
    // For now, this endpoint is handled by the scan-engine Lambda separately
    return cors({ error: "Use the scan engine endpoint directly" }, 400);
  }

  // All other routes require auth
  let userId;
  try {
    userId = await authenticate(event);
  } catch (err) {
    return cors({ error: "Unauthorized", message: err.message }, 401);
  }

  const body =
    typeof event.body === "string" ? JSON.parse(event.body || "{}") : event.body || {};

  // /projects
  if (path === "/projects" && method === "GET") {
    return listProjects(userId);
  }
  if (path === "/projects" && method === "POST") {
    if (!body.url) return cors({ error: "url is required" }, 400);
    try {
      new URL(body.url);
    } catch {
      return cors({ error: "Invalid URL" }, 400);
    }
    return createProject(userId, body);
  }

  // /projects/:id
  const projectMatch = path.match(/^\/projects\/([^/]+)$/);
  if (projectMatch) {
    const projectId = projectMatch[1];
    if (method === "GET") return getProject(userId, projectId);
    if (method === "PUT") return updateProject(userId, projectId, body);
    if (method === "DELETE") return deleteProject(userId, projectId);
  }

  // /projects/:id/scan-now (trigger manual scan)
  const scanNowMatch = path.match(/^\/projects\/([^/]+)\/scan-now$/);
  if (scanNowMatch && method === "POST") {
    return triggerScanNow(userId, scanNowMatch[1], body);
  }

  // /projects/:id/scans
  const scansMatch = path.match(/^\/projects\/([^/]+)\/scans$/);
  if (scansMatch && method === "GET") {
    return getScanResults(userId, scansMatch[1]);
  }

  // /projects/:id/regressions
  const regressionsMatch = path.match(/^\/projects\/([^/]+)\/regressions$/);
  if (regressionsMatch && method === "GET") {
    return getRegressionEvents(userId, regressionsMatch[1]);
  }

  return cors({ error: "Not found" }, 404);
}
