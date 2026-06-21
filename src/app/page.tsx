"use client";

import { useState } from "react";

const SCAN_API_URL =
  process.env.NEXT_PUBLIC_SCAN_API_URL || "http://localhost:4000/scan";

function ScoreCard({
  label,
  score,
  icon,
}: {
  label: string;
  score: number | null;
  icon: string;
}) {
  const color =
    score === null
      ? "text-foreground/50"
      : score >= 90
        ? "text-success"
        : score >= 50
          ? "text-warning"
          : "text-danger";

  return (
    <div className="bg-surface rounded-xl p-6 border border-border">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-sm text-foreground/60 mb-1">{label}</div>
      <div className={`text-3xl font-bold ${color}`}>
        {score !== null ? score : "—"}
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | number | null;
  unit: string;
}) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border last:border-0">
      <span className="text-foreground/70">{label}</span>
      <span className="font-mono font-medium">
        {value !== null ? `${value} ${unit}` : "—"}
      </span>
    </div>
  );
}

interface Violation {
  id: string;
  impact: string;
  description: string;
  helpUrl: string;
  count: number;
}

interface ScanResult {
  url: string;
  scannedAt: string;
  performanceScore: number;
  accessibilityScore: number;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  fcp: number | null;
  tbt: number | null;
  si: number | null;
  violationCount: number;
  violations: Violation[];
  screenshotBase64: string;
}

export default function LandingPage() {
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setScanning(true);
    setResult(null);
    setError(null);
    setElapsed(0);

    const timer = setInterval(() => setElapsed((t) => t + 1), 1000);

    try {
      const res = await fetch(SCAN_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Scan failed (${res.status})`);
      }

      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Scan failed. Please check the URL and try again.",
      );
    } finally {
      clearInterval(timer);
      setScanning(false);
    }
  }

  const impactColor = (impact: string) =>
    impact === "critical"
      ? "text-danger"
      : impact === "serious"
        ? "text-warning"
        : "text-foreground/60";

  return (
    <div className="flex flex-col min-h-screen">
      {/* Nav */}
      <nav className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-background font-bold text-sm">
            SG
          </div>
          <span className="font-semibold text-lg">SiteGuardian</span>
        </div>
        <div className="flex gap-4">
          <a
            href="/login"
            className="text-foreground/70 hover:text-foreground transition-colors"
          >
            Log in
          </a>
          <a
            href="/signup"
            className="bg-accent text-background px-4 py-1.5 rounded-lg font-medium hover:bg-accent-hover transition-colors"
          >
            Sign up
          </a>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1">
        <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Know when your site breaks
            <br />
            <span className="text-accent">before your users do</span>
          </h1>
          <p className="text-foreground/60 text-lg max-w-2xl mx-auto mb-10">
            Automated performance, accessibility, and visual regression
            monitoring. Track scores over time, detect regressions instantly,
            and get AI-powered explanations of what went wrong.
          </p>

          {/* Scan input */}
          <form
            onSubmit={handleScan}
            className="max-w-xl mx-auto flex gap-3 mb-4"
          >
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-website.com"
              required
              className="flex-1 bg-surface border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-accent transition-colors"
            />
            <button
              type="submit"
              disabled={scanning}
              className="bg-accent text-background px-6 py-3 rounded-lg font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {scanning ? "Scanning..." : "Run free scan"}
            </button>
          </form>
          <p className="text-foreground/40 text-sm">
            No signup required. Get performance + accessibility scores in
            seconds.
          </p>
        </section>

        {/* Scanning animation */}
        {scanning && (
          <section className="max-w-2xl mx-auto px-6 pb-12">
            <div className="bg-surface rounded-xl border border-border p-8 text-center">
              <div className="inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-foreground/70">
                Auditing <span className="font-mono text-accent">{url}</span>
                ...
              </p>
              <p className="text-foreground/40 text-sm mt-2">
                Running Lighthouse performance audit and accessibility checks
                &middot; {elapsed}s
              </p>
            </div>
          </section>
        )}

        {/* Error */}
        {error && (
          <section className="max-w-2xl mx-auto px-6 pb-12">
            <div className="bg-surface rounded-xl border border-danger/30 p-6 text-center">
              <p className="text-danger">{error}</p>
            </div>
          </section>
        )}

        {/* Results */}
        {result && !scanning && (
          <section className="max-w-3xl mx-auto px-6 pb-16">
            <div className="bg-surface/50 rounded-2xl border border-border p-8">
              <h2 className="text-xl font-semibold mb-6">
                Scan results for{" "}
                <span className="font-mono text-accent">{result.url}</span>
              </h2>

              {/* Score cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                <ScoreCard
                  label="Performance"
                  score={result.performanceScore}
                  icon="⚡"
                />
                <ScoreCard
                  label="Accessibility"
                  score={result.accessibilityScore}
                  icon="♿"
                />
              </div>

              {/* Core Web Vitals */}
              <div className="mb-8">
                <h3 className="text-sm font-medium text-foreground/60 uppercase tracking-wide mb-3">
                  Core Web Vitals
                </h3>
                <div className="bg-surface rounded-lg border border-border p-4">
                  <MetricRow
                    label="Largest Contentful Paint (LCP)"
                    value={result.lcp}
                    unit="s"
                  />
                  <MetricRow
                    label="Cumulative Layout Shift (CLS)"
                    value={result.cls}
                    unit=""
                  />
                  <MetricRow
                    label="Interaction to Next Paint (INP)"
                    value={result.inp}
                    unit="ms"
                  />
                </div>
              </div>

              {/* Additional metrics */}
              <div className="mb-8">
                <h3 className="text-sm font-medium text-foreground/60 uppercase tracking-wide mb-3">
                  Additional Metrics
                </h3>
                <div className="bg-surface rounded-lg border border-border p-4">
                  <MetricRow
                    label="First Contentful Paint (FCP)"
                    value={result.fcp}
                    unit="s"
                  />
                  <MetricRow
                    label="Total Blocking Time (TBT)"
                    value={result.tbt}
                    unit="ms"
                  />
                  <MetricRow
                    label="Speed Index (SI)"
                    value={result.si}
                    unit="s"
                  />
                </div>
              </div>

              {/* Accessibility violations */}
              {result.violations.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-sm font-medium text-foreground/60 uppercase tracking-wide mb-3">
                    Accessibility Issues ({result.violationCount})
                  </h3>
                  <ul className="space-y-3">
                    {result.violations.map((v) => (
                      <li
                        key={v.id}
                        className="bg-surface rounded-lg border border-border p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span
                              className={`text-xs font-medium uppercase ${impactColor(v.impact)}`}
                            >
                              {v.impact}
                            </span>
                            <span className="text-foreground/30 mx-2">
                              &middot;
                            </span>
                            <span className="text-sm text-foreground/50">
                              {v.count} instance{v.count !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>
                        <p className="text-foreground/80 text-sm mt-1">
                          {v.description}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.violations.length === 0 && (
                <div className="mb-8">
                  <h3 className="text-sm font-medium text-foreground/60 uppercase tracking-wide mb-3">
                    Accessibility Issues
                  </h3>
                  <div className="bg-surface rounded-lg border border-success/20 p-4 text-center">
                    <p className="text-success">
                      No accessibility violations detected
                    </p>
                  </div>
                </div>
              )}

              {/* Screenshot */}
              {result.screenshotBase64 && (
                <div className="mb-8">
                  <h3 className="text-sm font-medium text-foreground/60 uppercase tracking-wide mb-3">
                    Page Screenshot
                  </h3>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <img
                      src={`data:image/webp;base64,${result.screenshotBase64}`}
                      alt={`Screenshot of ${result.url}`}
                      className="w-full"
                    />
                  </div>
                </div>
              )}

              {/* CTA */}
              <div className="bg-surface rounded-lg border border-accent/20 p-6 text-center">
                <p className="text-foreground/70 mb-3">
                  Want to track this site over time and get alerted on
                  regressions?
                </p>
                <a
                  href="/signup"
                  className="inline-block bg-accent text-background px-6 py-2.5 rounded-lg font-medium hover:bg-accent-hover transition-colors"
                >
                  Sign up free — monitor continuously
                </a>
              </div>
            </div>
          </section>
        )}

        {/* Features section */}
        {!result && !scanning && (
          <section className="max-w-4xl mx-auto px-6 pb-20">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-surface rounded-xl border border-border p-6">
                <div className="text-2xl mb-3">📈</div>
                <h3 className="font-semibold mb-2">Historical Tracking</h3>
                <p className="text-foreground/60 text-sm">
                  See how your scores change over time. Spot trends before they
                  become problems.
                </p>
              </div>
              <div className="bg-surface rounded-xl border border-border p-6">
                <div className="text-2xl mb-3">🔔</div>
                <h3 className="font-semibold mb-2">Regression Alerts</h3>
                <p className="text-foreground/60 text-sm">
                  Get notified the moment a deploy causes performance or
                  accessibility to drop.
                </p>
              </div>
              <div className="bg-surface rounded-xl border border-border p-6">
                <div className="text-2xl mb-3">🤖</div>
                <h3 className="font-semibold mb-2">AI Explanations</h3>
                <p className="text-foreground/60 text-sm">
                  Understand why a regression happened with plain-English
                  explanations powered by AI.
                </p>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-6 text-center text-foreground/40 text-sm">
        SiteGuardian — Website health monitoring
      </footer>
    </div>
  );
}
