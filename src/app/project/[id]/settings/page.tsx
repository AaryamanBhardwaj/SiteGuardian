"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  getProject,
  updateProject,
  deleteProject,
  type Project,
} from "@/lib/api";

export default function ProjectSettingsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { isLoading: authLoading, isAuthenticated, signOut } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [frequency, setFrequency] = useState("daily");
  const [alertEmail, setAlertEmail] = useState("");

  useEffect(() => {
    if (!authLoading && !isAuthenticated && typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !projectId) return;
    getProject(projectId)
      .then((proj) => {
        setProject(proj);
        setFrequency(proj.scanFrequency);
        setAlertEmail(proj.alertEmail || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAuthenticated, projectId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const updated = await updateProject(projectId, {
        scanFrequency: frequency,
        alertEmail: alertEmail || undefined,
      });
      setProject(updated);
      setMessage("Settings saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this project and all its data? This cannot be undone."))
      return;
    setDeleting(true);
    try {
      await deleteProject(projectId);
      window.location.href = "/dashboard";
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center">
        <p className="text-danger">Project not found</p>
        <a href="/dashboard" className="text-accent mt-4 hover:underline">
          Back to dashboard
        </a>
      </div>
    );
  }

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

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-10">
        <div className="mb-8">
          <a
            href={`/project/${projectId}`}
            className="text-accent text-sm hover:underline"
          >
            &larr; Back to {project.name}
          </a>
          <h1 className="text-2xl font-bold mt-2">Project Settings</h1>
        </div>

        {message && (
          <div className="bg-surface border border-border rounded-lg p-3 mb-6">
            <p className="text-sm">{message}</p>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          <div className="bg-surface rounded-xl border border-border p-6">
            <h2 className="font-semibold mb-4">Scan Configuration</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-foreground/60 mb-1">
                  Scan Frequency
                </label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="bg-background border border-border rounded-lg px-3 py-2 w-full text-foreground"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-foreground/60 mb-1">
                  Alert Email
                </label>
                <input
                  type="email"
                  value={alertEmail}
                  onChange={(e) => setAlertEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="bg-background border border-border rounded-lg px-3 py-2 w-full text-foreground focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="bg-accent text-background px-6 py-2.5 rounded-lg font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save settings"}
          </button>
        </form>

        <div className="mt-10 bg-surface rounded-xl border border-danger/30 p-6">
          <h2 className="font-semibold text-danger mb-2">Danger Zone</h2>
          <p className="text-foreground/50 text-sm mb-4">
            Permanently delete this project and all its scan history.
          </p>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="bg-danger/10 text-danger border border-danger/30 px-4 py-2 rounded-lg font-medium hover:bg-danger/20 transition-colors disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete Project"}
          </button>
        </div>
      </main>
    </div>
  );
}
