import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { explainRegression } from "./gemini.mjs";
import { computeVisualDiff } from "./visual-diff.mjs";
import { sendRegressionAlert } from "./alerts.mjs";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

const TABLES = {
  projects: process.env.PROJECTS_TABLE || "SiteGuardian-Projects",
  scanResults: process.env.SCAN_RESULTS_TABLE || "SiteGuardian-ScanResults",
  regressionEvents:
    process.env.REGRESSION_EVENTS_TABLE || "SiteGuardian-RegressionEvents",
};

const SCREENSHOT_BUCKET =
  process.env.SCREENSHOT_BUCKET || "siteguardian-screenshots";
const SCAN_ENGINE_URL = process.env.SCAN_ENGINE_URL || "";

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
        causeCategory: inferCauseCategory(metric, diff),
      });
    }
  }
  return regressions;
}

function inferCauseCategory(metric, magnitude) {
  switch (metric) {
    case "performanceScore":
      return magnitude > 20 ? "major-perf-drop" : "perf-regression";
    case "accessibilityScore":
      return "a11y-regression";
    case "lcp":
      return "lcp-regression";
    case "cls":
      return "cls-regression";
    case "inp":
      return "inp-regression";
    case "violationCount":
      return "new-violations";
    default:
      return "unknown";
  }
}

async function runScan(url) {
  if (!SCAN_ENGINE_URL) {
    throw new Error("SCAN_ENGINE_URL not configured");
  }
  const res = await fetch(SCAN_ENGINE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Scan failed: ${err.error || res.status}`);
  }
  return res.json();
}

async function getPreviousScan(projectId) {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLES.scanResults,
      KeyConditionExpression: "projectId = :pid",
      ExpressionAttributeValues: { ":pid": projectId },
      ScanIndexForward: false,
      Limit: 1,
    }),
  );
  return result.Items?.[0] ?? null;
}

async function storeScanResult(projectId, scanData) {
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

  const item = {
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
    new PutCommand({ TableName: TABLES.scanResults, Item: item }),
  );

  return item;
}

async function storeRegressionEvents(projectId, regressions, scanTimestamp, url) {
  const stored = [];
  for (const reg of regressions) {
    let explanationText = null;
    let explainedByAI = false;

    const result = await explainRegression(
      reg.metricName,
      reg.beforeValue,
      reg.afterValue,
      url,
    );

    if (result.text) {
      explanationText = result.text;
      explainedByAI = result.source === "gemini" || result.source === "cache";
      console.log(`AI explanation (${result.source}): ${result.text.slice(0, 80)}...`);
    } else {
      console.log(`No AI explanation: ${result.source}`);
    }

    const item = {
      projectId,
      eventTimestamp: `${scanTimestamp}#${reg.metricName}`,
      metricName: reg.metricName,
      beforeValue: reg.beforeValue,
      afterValue: reg.afterValue,
      causeCategory: reg.causeCategory,
      explanationText,
      explainedByAI,
    };

    await ddb.send(
      new PutCommand({ TableName: TABLES.regressionEvents, Item: item }),
    );

    stored.push(item);
  }
  return stored;
}

export async function handler(event) {
  const projectId = event.projectId || event.detail?.projectId;

  if (!projectId) {
    console.error("No projectId in event");
    return { statusCode: 400, error: "Missing projectId" };
  }

  const project = await ddb.send(
    new GetCommand({
      TableName: TABLES.projects,
      Key: { projectId },
    }),
  );

  if (!project.Item) {
    console.error(`Project ${projectId} not found`);
    return { statusCode: 404, error: "Project not found" };
  }

  console.log(`Scanning ${project.Item.url} for project ${projectId}`);

  const previousScan = await getPreviousScan(projectId);
  const scanData = await runScan(project.Item.url);
  const storedScan = await storeScanResult(projectId, scanData);

  // Visual diff against previous screenshot
  if (previousScan?.screenshotS3Key && storedScan.screenshotS3Key) {
    const diffResult = await computeVisualDiff(
      previousScan.screenshotS3Key,
      storedScan.screenshotS3Key,
      projectId,
      storedScan.scanTimestamp,
    );
    if (diffResult) {
      storedScan.diffS3Key = diffResult.diffS3Key;
      storedScan.diffPercent = diffResult.diffPercent;
      await ddb.send(
        new UpdateCommand({
          TableName: TABLES.scanResults,
          Key: { projectId, scanTimestamp: storedScan.scanTimestamp },
          UpdateExpression: "SET diffS3Key = :dk, diffPercent = :dp",
          ExpressionAttributeValues: {
            ":dk": diffResult.diffS3Key,
            ":dp": diffResult.diffPercent,
          },
        }),
      );
      console.log(`Visual diff: ${diffResult.diffPercent}% changed`);
    }
  }

  // Detect regressions
  let regressions = [];
  let storedRegressions = [];
  if (previousScan) {
    regressions = detectRegressions(storedScan, previousScan);
    if (regressions.length > 0) {
      console.log(`Detected ${regressions.length} regressions for ${projectId}`);
      storedRegressions = await storeRegressionEvents(
        projectId,
        regressions,
        storedScan.scanTimestamp,
        project.Item.url,
      );

      // Send email alert
      await sendRegressionAlert(
        project.Item,
        storedRegressions,
        storedScan.scanTimestamp,
      );
    }
  }

  return {
    statusCode: 200,
    projectId,
    scanTimestamp: storedScan.scanTimestamp,
    performanceScore: storedScan.performanceScore,
    accessibilityScore: storedScan.accessibilityScore,
    regressionsDetected: regressions.length,
    diffPercent: storedScan.diffPercent,
  };
}

export { detectRegressions, THRESHOLDS };
