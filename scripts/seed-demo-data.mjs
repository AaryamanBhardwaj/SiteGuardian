#!/usr/bin/env node

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" }));

const DEMO_PROJECT_ID = "proj-demo-001";
const DEMO_USER_ID = "demo-user-seed";

const project = {
  projectId: DEMO_PROJECT_ID,
  userId: DEMO_USER_ID,
  url: "https://example.com",
  name: "Example.com (Demo)",
  scanFrequency: "daily",
  alertEmail: null,
  createdAt: "2026-06-14T10:00:00.000Z",
};

// 7 days of scan data with an intentional regression on day 5
const scanHistory = [
  {
    day: 0,
    performanceScore: 95,
    accessibilityScore: 98,
    lcp: 0.8,
    cls: 0.01,
    inp: 40,
    violationCount: 0,
  },
  {
    day: 1,
    performanceScore: 94,
    accessibilityScore: 98,
    lcp: 0.82,
    cls: 0.01,
    inp: 42,
    violationCount: 0,
  },
  {
    day: 2,
    performanceScore: 96,
    accessibilityScore: 97,
    lcp: 0.78,
    cls: 0.01,
    inp: 38,
    violationCount: 1,
  },
  {
    day: 3,
    performanceScore: 95,
    accessibilityScore: 98,
    lcp: 0.8,
    cls: 0.02,
    inp: 41,
    violationCount: 0,
  },
  {
    // Intentional regression — perf drops 12 points, LCP spikes, violations jump
    day: 4,
    performanceScore: 83,
    accessibilityScore: 91,
    lcp: 1.45,
    cls: 0.08,
    inp: 95,
    violationCount: 5,
  },
  {
    day: 5,
    performanceScore: 84,
    accessibilityScore: 92,
    lcp: 1.38,
    cls: 0.07,
    inp: 90,
    violationCount: 4,
  },
  {
    day: 6,
    performanceScore: 93,
    accessibilityScore: 97,
    lcp: 0.85,
    cls: 0.02,
    inp: 45,
    violationCount: 1,
  },
];

const baseDate = new Date("2026-06-14T10:00:00.000Z");

async function seed() {
  console.log("Seeding demo project...");
  await ddb.send(
    new PutCommand({ TableName: "SiteGuardian-Projects", Item: project }),
  );

  console.log("Seeding scan history...");
  for (const scan of scanHistory) {
    const ts = new Date(baseDate.getTime() + scan.day * 86400000).toISOString();
    await ddb.send(
      new PutCommand({
        TableName: "SiteGuardian-ScanResults",
        Item: {
          projectId: DEMO_PROJECT_ID,
          scanTimestamp: ts,
          performanceScore: scan.performanceScore,
          accessibilityScore: scan.accessibilityScore,
          lcp: scan.lcp,
          cls: scan.cls,
          inp: scan.inp,
          violationCount: scan.violationCount,
          screenshotS3Key: null,
          diffS3Key: null,
          diffPercent: null,
        },
      }),
    );
  }

  // Create regression events for day 4 (the spike)
  const regTimestamp = new Date(
    baseDate.getTime() + 4 * 86400000,
  ).toISOString();

  const regressions = [
    {
      metricName: "performanceScore",
      beforeValue: 95,
      afterValue: 83,
      causeCategory: "perf-regression",
      explanationText:
        "The performance score dropped by 12 points, most likely due to an increase in render-blocking resources or a significant growth in JavaScript bundle size. Check for recently added third-party scripts or unoptimized images. Start by running a Lighthouse audit locally and reviewing the Network waterfall for new blocking requests.",
      explainedByAI: true,
    },
    {
      metricName: "lcp",
      beforeValue: 0.8,
      afterValue: 1.45,
      causeCategory: "lcp-regression",
      explanationText:
        "LCP increased from 0.8s to 1.45s, suggesting the largest visible element is now loading significantly slower. This is commonly caused by a new hero image without proper optimization or a slow server response. Verify that your largest above-the-fold image uses modern formats (WebP/AVIF) and is served from a CDN.",
      explainedByAI: true,
    },
    {
      metricName: "violationCount",
      beforeValue: 0,
      afterValue: 5,
      causeCategory: "new-violations",
      explanationText:
        "Five new accessibility violations appeared, likely from a UI component change that introduced elements without proper ARIA labels or missing form associations. Run axe-core locally and check any recently modified components for missing alt text, unlabeled buttons, or insufficient color contrast.",
      explainedByAI: true,
    },
  ];

  console.log("Seeding regression events...");
  for (let i = 0; i < regressions.length; i++) {
    const reg = regressions[i];
    await ddb.send(
      new PutCommand({
        TableName: "SiteGuardian-RegressionEvents",
        Item: {
          projectId: DEMO_PROJECT_ID,
          eventTimestamp: `${regTimestamp}#${reg.metricName}`,
          ...reg,
        },
      }),
    );
  }

  console.log("Done! Demo project seeded with:");
  console.log(`  - Project: ${DEMO_PROJECT_ID}`);
  console.log(`  - ${scanHistory.length} scan records`);
  console.log(`  - ${regressions.length} regression events (day 4 spike)`);
  console.log(
    `\nNote: This demo project uses userId "${DEMO_USER_ID}".`,
  );
  console.log(
    "To view it in the dashboard, you'd need to log in as that user or update the userId.",
  );
}

seed().catch(console.error);
