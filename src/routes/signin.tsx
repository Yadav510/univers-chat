import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/signin")({
  head: () => ({ meta: [{ title: "Sign in — Univers." }] }),
  component: SigninPage,
});

function SigninPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const valid = email.includes("@") && password.length >= 6;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      navigate({ to: "/chats", replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh w-full bg-background flex justify-center">
      <div
        className="relative w-full max-w-[420px] min-h-dvh flex flex-col"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <Link
            to="/"
            className="press flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-foreground"
            aria-label="Back"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <div className="h-9 w-9" />
          <div className="h-9 w-9" />
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col px-6 pt-4 pb-8">
          <h1 className="wordmark text-[32px] text-foreground">Welcome back.</h1>
          <p className="mt-2 text-[14px] text-white/55">
            Sign in to your Univers<span className="text-primary">.</span> account.
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-14 w-full rounded-[18px] border border-white/10 bg-white/[0.06] px-4 text-[15px] text-foreground placeholder:text-white/35 focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring/30 transition"
            />
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-14 w-full rounded-[18px] border border-white/10 bg-white/[0.06] px-4 text-[15px] text-foreground placeholder:text-white/35 focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring/30 transition"
            />
          </div>

          <div className="mt-auto pt-8">
            <button
              type="submit"
              disabled={!valid || busy}
              className="press h-14 w-full rounded-[22px] bg-primary text-[15px] font-semibold text-primary-foreground glow-mint disabled:opacity-40 disabled:shadow-none transition"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <p className="mt-4 text-center text-[12px] text-white/50">
              New here?{" "}
              <Link to="/signup" className="text-primary font-medium">
                Create an account
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
