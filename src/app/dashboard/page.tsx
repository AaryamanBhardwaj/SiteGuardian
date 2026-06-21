"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { listProjects, createProject, type Project } from "@/lib/api";

function scoreColor(score: number) {
  return score >= 90
    ? "text-success"
    : score >= 50
      ? "text-warning"
      : "text-danger";
}

export default function DashboardPage() {
  const { isLoading, isAuthenticated, email, signOut } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      listProjects()
        .then(setProjects)
        .catch((err) => setError(err.message))
        .finally(() => setLoadingProjects(false));
    }
  }, [isAuthenticated]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      const project = await createProject({
        url: newUrl,
        name: newName || undefined,
      });
      setProjects((prev) => [project, ...prev]);
      setShowAdd(false);
      setNewUrl("");
      setNewName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add project");
    } finally {
      setAdding(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

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
          <span className="text-foreground/50 text-sm">{email}</span>
          <a
            href="/settings"
            className="text-foreground/60 hover:text-foreground transition-colors"
          >
            Settings
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
          <h1 className="text-2xl font-bold">Your Projects</h1>
          <button
            onClick={() => setShowAdd(true)}
            className="bg-accent text-background px-4 py-2 rounded-lg font-medium hover:bg-accent-hover transition-colors"
          >
            + Add project
          </button>
        </div>

        {error && (
          <div className="bg-surface border border-danger/30 rounded-lg p-4 mb-6">
            <p className="text-danger text-sm">{error}</p>
          </div>
        )}

        {/* Add project modal */}
        {showAdd && (
          <div className="bg-surface rounded-xl border border-border p-6 mb-6">
            <h2 className="font-semibold mb-4">Add a new project</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm text-foreground/60 mb-1">
                  Website URL
                </label>
                <input
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  required
                  placeholder="https://your-website.com"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-sm text-foreground/60 mb-1">
                  Project name (optional)
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="My Website"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={adding}
                  className="bg-accent text-background px-4 py-2 rounded-lg font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
                >
                  {adding ? "Adding..." : "Add project"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="text-foreground/60 hover:text-foreground px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {loadingProjects ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-surface rounded-xl border border-border p-12 text-center">
            <p className="text-foreground/50 mb-4">
              No projects yet. Add your first website to start monitoring.
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="bg-accent text-background px-6 py-2.5 rounded-lg font-medium hover:bg-accent-hover transition-colors"
            >
              + Add your first project
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {projects.map((project) => (
              <a
                key={project.projectId}
                href={`/project/${project.projectId}`}
                className="bg-surface rounded-xl border border-border p-6 hover:border-accent/40 transition-colors block"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-lg">{project.name}</h2>
                    <p className="text-foreground/50 text-sm font-mono">
                      {project.url}
                    </p>
                  </div>
                  <div className="flex gap-6 text-right">
                    <div className="text-foreground/40 text-sm">
                      {project.scanFrequency}
                    </div>
                    <div className="text-foreground/40 text-xs">
                      {new Date(project.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
