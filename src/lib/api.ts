import { getIdToken } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001";

async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await getIdToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data;
}

export interface Project {
  projectId: string;
  userId: string;
  url: string;
  name: string;
  scanFrequency: string;
  alertEmail: string | null;
  createdAt: string;
}

export interface ScanResult {
  projectId: string;
  scanTimestamp: string;
  performanceScore: number;
  accessibilityScore: number;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  violationCount: number;
  screenshotS3Key: string | null;
  diffS3Key: string | null;
  diffPercent: number | null;
}

export interface RegressionEvent {
  projectId: string;
  eventTimestamp: string;
  metricName: string;
  beforeValue: number;
  afterValue: number;
  explanationText: string | null;
  causeCategory: string | null;
  explainedByAI: boolean;
}

export function listProjects(): Promise<Project[]> {
  return apiFetch("/projects");
}

export function getProject(id: string): Promise<Project> {
  return apiFetch(`/projects/${id}`);
}

export function createProject(data: {
  url: string;
  name?: string;
  scanFrequency?: string;
  alertEmail?: string;
}): Promise<Project> {
  return apiFetch("/projects", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateProject(
  id: string,
  data: Partial<Pick<Project, "name" | "scanFrequency" | "alertEmail">>,
): Promise<Project> {
  return apiFetch(`/projects/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteProject(id: string): Promise<{ deleted: boolean }> {
  return apiFetch(`/projects/${id}`, { method: "DELETE" });
}

export function getScanResults(projectId: string): Promise<ScanResult[]> {
  return apiFetch(`/projects/${projectId}/scans`);
}

export function getRegressionEvents(
  projectId: string,
): Promise<RegressionEvent[]> {
  return apiFetch(`/projects/${projectId}/regressions`);
}

export interface ScanNowResult extends ScanResult {
  regressionsDetected: number;
  regressions: {
    metricName: string;
    beforeValue: number;
    afterValue: number;
    magnitude: number;
    explanationText: string | null;
    explainedByAI: boolean;
  }[];
}

async function pollForScanResult(scanId: string): Promise<Record<string, unknown>> {
  const maxWait = 120000;
  const interval = 3000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const res = await fetch(`${API_URL}/scan/${scanId}`);
    const data = await res.json();
    if (data.status === "complete") return data.result;
    if (data.status === "failed") throw new Error(data.error || "Scan failed");
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error("Scan timed out");
}

export async function triggerScanNow(
  projectId: string,
): Promise<ScanNowResult> {
  const project = await getProject(projectId);

  const startRes = await fetch(`${API_URL}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: project.url }),
  });
  if (!startRes.ok) {
    const err = await startRes.json().catch(() => ({}));
    throw new Error(err.error || `Scan failed: ${startRes.status}`);
  }
  const { scanId } = await startRes.json();
  const scanData = await pollForScanResult(scanId);

  return apiFetch(`/projects/${projectId}/scan-now`, {
    method: "POST",
    body: JSON.stringify({ scanData }),
  });
}
