"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  getProject,
  getScanResults,
  getRegressionEvents,
  triggerScanNow,
  type Project,
  type ScanResult,
  type RegressionEvent,
} from "@/lib/api";

function scoreColor(score: number) {
  return score >= 90
    ? "text-success"
    : score >= 50
      ? "text-warning"
      : "text-danger";
}

function lcpColor(lcp: number) {
  return lcp <= 2.5 ? "text-success" : lcp <= 4 ? "text-warning" : "text-danger";
}

function parseEventDate(eventTimestamp: string): string {
  const iso = eventTimestamp.split("#")[0];
  const d = new Date(iso);
  return isNaN(d.getTime()) ? eventTimestamp : d.toLocaleString();
}

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { isLoading: authLoading, isAuthenticated, email, signOut } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [regressions, setRegressions] = useState<RegressionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<{
    message: string;
    type: "success" | "warning" | "error";
  } | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated && typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !projectId) return;
    loadData();
  }, [isAuthenticated, projectId]);

  function loadData() {
    Promise.all([
      getProject(projectId),
      getScanResults(projectId),
      getRegressionEvents(projectId),
    ])
      .then(([proj, scanData, regData]) => {
        setProject(proj);
        setScans(scanData);
        setRegressions(regData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  async function handleScanNow() {
    setScanning(true);
    setScanStatus(null);
    try {
      const result = await triggerScanNow(projectId);
      setScanStatus(
        result.regressionsDetected > 0
          ? {
              message: `Scan complete — ${result.regressionsDetected} regression(s) detected!`,
              type: "warning",
            }
          : { message: "Scan complete — no regressions.", type: "success" },
      );
      const [scanData, regData] = await Promise.all([
        getScanResults(projectId),
        getRegressionEvents(projectId),
      ]);
      setScans(scanData);
      setRegressions(regData);
    } catch (err) {
      setScanStatus({
        message: err instanceof Error ? err.message : "Scan failed",
        type: "error",
      });
    } finally {
      setScanning(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center">
        <p className="text-danger">{error || "Project not found"}</p>
        <a href="/dashboard" className="text-accent mt-4 hover:underline">
          Back to dashboard
        </a>
      </div>
    );
  }

  const latestScan = scans[0] ?? null;

  const statusColors = {
    success: "bg-success/10 border-success/30 text-success",
    warning: "bg-warning/10 border-warning/30 text-warning",
    error: "bg-danger/10 border-danger/30 text-danger",
  };

  return (
    <div className="flex flex-col min-h-screen">
      <nav className="border-b border-border px-6 py-4 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-background font-bold text-sm">
            SG
          </div>
          <span className="font-semibold text-lg">SiteGuardian</span>
        </a>
        <div className="flex items-center gap-4">
          <span className="text-foreground/50 text-sm hidden sm:inline">
            {email}
          </span>
          <a
            href="/dashboard"
            className="text-foreground/60 hover:text-foreground transition-colors"
          >
            Dashboard
          </a>
          <button
            onClick={() => {
              signOut();
              window.location.href = "/";
            }}
            className="text-foreground/60 hover:text-foreground transition-colors"
          >
            Log out
          </button>
        </div>
      </nav>

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <p className="text-foreground/50 font-mono text-sm">
              {project.url}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleScanNow}
              disabled={scanning}
              className="bg-accent text-background px-4 py-2 rounded-lg font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {scanning ? "Scanning..." : "Run scan now"}
            </button>
            <a
              href={`/project/${projectId}/settings`}
              className="bg-surface border border-border px-4 py-2 rounded-lg hover:bg-surface-hover transition-colors"
            >
              Settings
            </a>
          </div>
        </div>

        {scanStatus && (
          <div
            className={`mb-6 p-3 rounded-lg border ${statusColors[scanStatus.type]}`}
          >
            {scanStatus.message}
          </div>
        )}

        {/* Latest scan summary */}
        {latestScan ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <div className="bg-surface rounded-xl border border-border p-4 group relative">
              <div className="text-xs text-foreground/50 uppercase">Performance</div>
              <div className={`text-2xl font-bold ${scoreColor(latestScan.performanceScore)}`}>
                {latestScan.performanceScore}
              </div>
              <div className="text-[10px] text-foreground/30 mt-1">out of 100</div>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-64 z-10 shadow-lg">
                <div className="font-semibold mb-1.5">Page Speed Score</div>
                <div className="text-[11px] leading-relaxed mb-2 text-gray-300">How fast your page loads and becomes interactive, measured by Google Lighthouse.</div>
                <div className="space-y-0.5 text-[11px]">
                  <div className="flex justify-between"><span className="text-green-400">90 – 100</span><span className="text-gray-400">Fast</span></div>
                  <div className="flex justify-between"><span className="text-yellow-400">50 – 89</span><span className="text-gray-400">Needs improvement</span></div>
                  <div className="flex justify-between"><span className="text-red-400">0 – 49</span><span className="text-gray-400">Slow</span></div>
                </div>
              </div>
            </div>
            <div className="bg-surface rounded-xl border border-border p-4 group relative">
              <div className="text-xs text-foreground/50 uppercase">Accessibility</div>
              <div className={`text-2xl font-bold ${scoreColor(latestScan.accessibilityScore)}`}>
                {latestScan.accessibilityScore}
              </div>
              <div className="text-[10px] text-foreground/30 mt-1">out of 100</div>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-64 z-10 shadow-lg">
                <div className="font-semibold mb-1.5">Accessibility Score</div>
                <div className="text-[11px] leading-relaxed mb-2 text-gray-300">How usable your site is for people with disabilities (screen readers, keyboard navigation, color contrast).</div>
                <div className="space-y-0.5 text-[11px]">
                  <div className="flex justify-between"><span className="text-green-400">90 – 100</span><span className="text-gray-400">Excellent</span></div>
                  <div className="flex justify-between"><span className="text-yellow-400">50 – 89</span><span className="text-gray-400">Some issues</span></div>
                  <div className="flex justify-between"><span className="text-red-400">0 – 49</span><span className="text-gray-400">Major issues</span></div>
                </div>
              </div>
            </div>
            <div className="bg-surface rounded-xl border border-border p-4 group relative">
              <div className="text-xs text-foreground/50 uppercase">Load Time</div>
              <div
                className={`text-2xl font-bold font-mono ${latestScan.lcp !== null ? lcpColor(latestScan.lcp) : ""}`}
              >
                {latestScan.lcp !== null ? `${latestScan.lcp}s` : "—"}
              </div>
              <div className="text-[10px] text-foreground/30 mt-1">LCP (largest element)</div>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-64 z-10 shadow-lg">
                <div className="font-semibold mb-1.5">Largest Contentful Paint</div>
                <div className="text-[11px] leading-relaxed mb-2 text-gray-300">Time until the biggest visible element (hero image, heading) finishes loading.</div>
                <div className="space-y-0.5 text-[11px]">
                  <div className="flex justify-between"><span className="text-green-400">&lt; 2.5s</span><span className="text-gray-400">Fast</span></div>
                  <div className="flex justify-between"><span className="text-yellow-400">2.5s – 4s</span><span className="text-gray-400">Moderate</span></div>
                  <div className="flex justify-between"><span className="text-red-400">&gt; 4s</span><span className="text-gray-400">Slow</span></div>
                </div>
              </div>
            </div>
            <div className="bg-surface rounded-xl border border-border p-4 group relative">
              <div className="text-xs text-foreground/50 uppercase">
                Violations
              </div>
              <div
                className={`text-2xl font-bold ${latestScan.violationCount === 0 ? "text-success" : "text-danger"}`}
              >
                {latestScan.violationCount}
              </div>
              <div className="text-[10px] text-foreground/30 mt-1">accessibility issues</div>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-64 z-10 shadow-lg">
                <div className="font-semibold mb-1.5">Accessibility Violations</div>
                <div className="text-[11px] leading-relaxed mb-2 text-gray-300">Issues like missing alt text, poor contrast, or broken ARIA attributes that make your site harder to use.</div>
                <div className="space-y-0.5 text-[11px]">
                  <div className="flex justify-between"><span className="text-green-400">0</span><span className="text-gray-400">No issues found</span></div>
                  <div className="flex justify-between"><span className="text-yellow-400">1 – 5</span><span className="text-gray-400">Minor issues</span></div>
                  <div className="flex justify-between"><span className="text-red-400">6+</span><span className="text-gray-400">Needs attention</span></div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-border p-8 mb-8 text-center">
            <p className="text-foreground/50">
              No scans yet. Click &quot;Run scan now&quot; to see results.
            </p>
          </div>
        )}

        {/* Scan history */}
        <div className="bg-surface rounded-xl border border-border p-6 mb-8">
          <h2 className="text-sm font-medium text-foreground/60 uppercase tracking-wide mb-4">
            Scan History ({scans.length})
          </h2>
          {scans.length > 0 ? (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {scans.map((scan) => (
                <div
                  key={scan.scanTimestamp}
                  className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border"
                >
                  <span className="text-sm text-foreground/60">
                    {new Date(scan.scanTimestamp).toLocaleString()}
                  </span>
                  <div className="flex gap-4 text-sm">
                    <span className={`font-mono font-medium ${scoreColor(scan.performanceScore)}`}>
                      Perf {scan.performanceScore}/100
                    </span>
                    <span className={`font-mono font-medium ${scoreColor(scan.accessibilityScore)}`}>
                      Access {scan.accessibilityScore}/100
                    </span>
                    <span className={`font-mono ${scan.lcp !== null ? lcpColor(scan.lcp) : "text-foreground/40"}`}>
                      Load {scan.lcp !== null ? `${scan.lcp}s` : "—"}
                    </span>
                    <span className="font-mono text-foreground/40">
                      CLS {scan.cls !== null ? scan.cls : "—"}
                    </span>
                    {scan.diffPercent !== null && scan.diffPercent !== undefined && (
                      <span
                        className={`font-mono ${scan.diffPercent > 5 ? "text-warning" : "text-foreground/40"}`}
                      >
                        {scan.diffPercent}% diff
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-foreground/30 text-center py-8">
              No scan history yet
            </p>
          )}
        </div>

        {/* Regression timeline */}
        <div className="bg-surface rounded-xl border border-border p-6 mb-8">
          <h2 className="text-sm font-medium text-foreground/60 uppercase tracking-wide mb-4">
            Regression Timeline ({regressions.length})
          </h2>
          {regressions.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {regressions.map((reg, i) => (
                <div
                  key={`${reg.eventTimestamp}-${i}`}
                  className="p-4 rounded-lg bg-background/50 border border-danger/20"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-danger text-lg">&#x25cf;</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {parseEventDate(reg.eventTimestamp)}
                        </span>
                        <span className="font-mono text-sm bg-danger/10 text-danger px-2 py-0.5 rounded">
                          {reg.metricName}
                        </span>
                        <span className="font-mono text-sm text-foreground/60">
                          {reg.beforeValue} &rarr; {reg.afterValue}
                        </span>
                      </div>
                    </div>
                    {reg.causeCategory && (
                      <span className="text-xs text-foreground/40 bg-surface border border-border px-2 py-1 rounded whitespace-nowrap">
                        {reg.causeCategory}
                      </span>
                    )}
                    {reg.explainedByAI && (
                      <span className="text-xs text-accent bg-accent/10 px-2 py-1 rounded">
                        AI
                      </span>
                    )}
                  </div>
                  {reg.explanationText ? (
                    <p className="text-sm text-foreground/60 mt-2 ml-7 leading-relaxed">
                      {reg.explanationText}
                    </p>
                  ) : (
                    <p className="text-sm text-foreground/30 mt-2 ml-7 italic">
                      AI explanation not available for this regression.
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-foreground/30 text-center py-4">
              No regressions detected yet
            </p>
          )}
        </div>

        {/* Visual diff */}
        <div className="bg-surface rounded-xl border border-border p-6">
          <h2 className="text-sm font-medium text-foreground/60 uppercase tracking-wide mb-4">
            Visual Diff
          </h2>
          {latestScan?.diffPercent !== null && latestScan?.diffPercent !== undefined ? (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <span className="text-sm text-foreground/60">
                  Latest scan vs previous:
                </span>
                <span
                  className={`font-mono font-medium ${latestScan.diffPercent > 5 ? "text-warning" : latestScan.diffPercent > 0 ? "text-foreground" : "text-success"}`}
                >
                  {latestScan.diffPercent}% pixels changed
                </span>
              </div>
              {latestScan.diffPercent === 0 && (
                <p className="text-sm text-success/70">
                  No visual changes detected between scans.
                </p>
              )}
              {latestScan.diffPercent > 0 && latestScan.diffPercent <= 5 && (
                <p className="text-sm text-foreground/50">
                  Minor visual changes detected. Likely insignificant.
                </p>
              )}
              {latestScan.diffPercent > 5 && (
                <p className="text-sm text-warning">
                  Significant visual changes detected. Review the diff to ensure nothing broke.
                </p>
              )}
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-foreground/30 border border-dashed border-border rounded-lg">
              {scans.length < 2
                ? "Need at least 2 scans to generate visual diffs"
                : "No visual diff data available"}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
