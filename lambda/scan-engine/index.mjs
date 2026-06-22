import { spawn } from "node:child_process";
import net from "node:net";
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
import lighthouse from "lighthouse";
import sharp from "sharp";

const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH || "/usr/bin/chromium-browser";

const IS_LAMBDA = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const CHROME_FLAGS = [
  ...(IS_LAMBDA ? [] : ["--headless=new"]),
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  ...(IS_LAMBDA ? ["--no-zygote"] : []),
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-default-apps",
  "--disable-sync",
  "--disable-translate",
  "--hide-scrollbars",
  "--metrics-recording-only",
  "--mute-audio",
  "--safebrowsing-disable-auto-update",
];

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function launchChrome(port) {
  const args = [...CHROME_FLAGS, `--remote-debugging-port=${port}`];
  const proc = spawn(CHROMIUM_PATH, args, { stdio: "pipe" });
  return proc;
}

async function waitForCDP(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Chrome CDP not ready after ${timeoutMs}ms`);
}

async function runLighthouse(url, port) {
  const result = await lighthouse(url, {
    port,
    output: "json",
    logLevel: "error",
    onlyCategories: ["performance"],
    formFactor: "desktop",
    screenEmulation: { disabled: true },
    throttling: {
      cpuSlowdownMultiplier: 1,
      requestLatencyMs: 0,
      downloadThroughputKbps: 0,
      uploadThroughputKbps: 0,
    },
  });

  const perf = result.lhr.categories.performance;
  const audits = result.lhr.audits;

  return {
    performanceScore: Math.round((perf?.score ?? 0) * 100),
    lcp: audits["largest-contentful-paint"]?.numericValue ?? null,
    cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
    inp: audits["interaction-to-next-paint"]?.numericValue ?? null,
    fcp: audits["first-contentful-paint"]?.numericValue ?? null,
    tbt: audits["total-blocking-time"]?.numericValue ?? null,
    si: audits["speed-index"]?.numericValue ?? null,
  };
}

async function runAccessibility(page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const violations = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    description: v.description,
    helpUrl: v.helpUrl,
    count: v.nodes.length,
  }));

  const violationCount = violations.reduce((sum, v) => sum + v.count, 0);

  const penalty = violations.reduce((sum, v) => {
    const weight =
      v.impact === "critical"
        ? 3
        : v.impact === "serious"
          ? 2
          : v.impact === "moderate"
            ? 1
            : 0.5;
    return sum + weight;
  }, 0);
  const accessibilityScore = Math.max(0, Math.round(100 - penalty));

  return { accessibilityScore, violationCount, violations };
}

async function captureScreenshot(page) {
  const buf = await page.screenshot({ fullPage: false, type: "png" });
  const compressed = await sharp(buf)
    .resize(1280, null, { withoutEnlargement: true })
    .webp({ quality: 70 })
    .toBuffer();
  return compressed;
}

export async function handler(event) {
  let url;
  try {
    const body =
      typeof event.body === "string" ? JSON.parse(event.body) : event;
    url = body.url;
  } catch {
    return response(400, { error: "Invalid JSON body" });
  }

  if (!url || typeof url !== "string") {
    return response(400, { error: "Missing required field: url" });
  }

  try {
    new URL(url);
  } catch {
    return response(400, { error: "Invalid URL format" });
  }

  let chromeProc;
  let browser;
  try {
    const port = await findFreePort();
    chromeProc = launchChrome(port);
    await waitForCDP(port);

    // 1. Run Lighthouse for performance metrics
    const lighthouseResults = await runLighthouse(url, port);

    // 2. Connect Playwright via CDP for accessibility + screenshot
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    const [a11yResults, screenshot] = await Promise.all([
      runAccessibility(page),
      captureScreenshot(page),
    ]);

    await context.close();

    const screenshotBase64 = screenshot.toString("base64");

    return response(200, {
      url,
      scannedAt: new Date().toISOString(),
      performanceScore: lighthouseResults.performanceScore,
      lcp: round(lighthouseResults.lcp / 1000, 2),
      cls: round(lighthouseResults.cls, 3),
      inp:
        lighthouseResults.inp !== null
          ? Math.round(lighthouseResults.inp)
          : null,
      fcp: round(lighthouseResults.fcp / 1000, 2),
      tbt: Math.round(lighthouseResults.tbt ?? 0),
      si: round(lighthouseResults.si / 1000, 2),
      accessibilityScore: a11yResults.accessibilityScore,
      violationCount: a11yResults.violationCount,
      violations: a11yResults.violations.slice(0, 10),
      screenshotBase64,
    });
  } catch (err) {
    console.error("Scan failed:", err);
    return response(500, {
      error: "Scan failed",
      message: err.message,
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (chromeProc) {
      chromeProc.kill("SIGKILL");
      chromeProc = null;
    }
  }
}

function round(value, decimals) {
  if (value === null || value === undefined) return null;
  return Math.round(value * 10 ** decimals) / 10 ** decimals;
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
    body: JSON.stringify(body),
  };
}
