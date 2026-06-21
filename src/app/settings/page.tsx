"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

export default function AccountSettingsPage() {
  const { isLoading, isAuthenticated, email, signOut } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated && typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
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
        <h1 className="text-2xl font-bold mb-8">Account Settings</h1>

        <div className="bg-surface rounded-xl border border-border p-6 space-y-4">
          <div>
            <label className="block text-sm text-foreground/60 mb-1">
              Email
            </label>
            <p className="text-foreground">{email}</p>
          </div>
          <div className="pt-4 border-t border-border">
            <button
              onClick={() => {
                signOut();
                window.location.href = "/";
              }}
              className="bg-danger/10 text-danger border border-danger/30 px-4 py-2 rounded-lg font-medium hover:bg-danger/20 transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
