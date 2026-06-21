"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { signIn, isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated && typeof window !== "undefined") {
    window.location.href = "/dashboard";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      window.location.href = "/dashboard";
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Login failed",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <a href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-background font-bold text-sm">
              SG
            </div>
            <span className="font-semibold text-lg">SiteGuardian</span>
          </a>
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-foreground/60 mt-1">Log in to your account</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-surface rounded-xl border border-border p-6 space-y-4"
        >
          <div>
            <label className="block text-sm text-foreground/60 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-sm text-foreground/60 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent"
            />
          </div>

          {error && (
            <p className="text-danger text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent text-background py-2.5 rounded-lg font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Log in"}
          </button>

          <p className="text-center text-sm text-foreground/50">
            Don&apos;t have an account?{" "}
            <a href="/signup" className="text-accent hover:underline">
              Sign up
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
