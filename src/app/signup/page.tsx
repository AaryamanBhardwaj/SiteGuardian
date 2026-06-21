"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

export default function SignupPage() {
  const { signUp, confirmSignUp, signIn, isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"signup" | "confirm">("signup");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated && typeof window !== "undefined") {
    window.location.href = "/dashboard";
    return null;
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signUp(email, password);
      setStep("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await confirmSignUp(email, code);
      await signIn(email, password);
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation failed");
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
          <h1 className="text-2xl font-bold">
            {step === "signup" ? "Create your account" : "Verify your email"}
          </h1>
          <p className="text-foreground/60 mt-1">
            {step === "signup"
              ? "Start monitoring your sites for free"
              : `We sent a code to ${email}`}
          </p>
        </div>

        {step === "signup" ? (
          <form
            onSubmit={handleSignUp}
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
                minLength={8}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent"
              />
              <p className="text-foreground/40 text-xs mt-1">
                Min 8 chars, with uppercase, lowercase, and numbers
              </p>
            </div>

            {error && <p className="text-danger text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-background py-2.5 rounded-lg font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {loading ? "Creating account..." : "Sign up"}
            </button>

            <p className="text-center text-sm text-foreground/50">
              Already have an account?{" "}
              <a href="/login" className="text-accent hover:underline">
                Log in
              </a>
            </p>
          </form>
        ) : (
          <form
            onSubmit={handleConfirm}
            className="bg-surface rounded-xl border border-border p-6 space-y-4"
          >
            <div>
              <label className="block text-sm text-foreground/60 mb-1">
                Verification code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                placeholder="123456"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent text-center text-2xl tracking-widest"
              />
            </div>

            {error && <p className="text-danger text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-background py-2.5 rounded-lg font-medium hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify & log in"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
