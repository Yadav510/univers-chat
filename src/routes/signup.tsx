import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pickAvatarColor } from "@/lib/format";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Create account — Univers." }] }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  const usernameOk = /^[a-zA-Z0-9_]{3,24}$/.test(username);
  const valid =
    displayName.trim().length >= 1 &&
    usernameOk &&
    email.includes("@") &&
    password.length >= 6 &&
    agreed;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            username: username.trim(),
            display_name: displayName.trim(),
            avatar_color: pickAvatarColor(username),
          },
          emailRedirectTo: `${window.location.origin}/chats`,
        },
      });
      if (error) {
        // Username unique violation surfaces here via profile trigger failure
        if (/duplicate key/i.test(error.message) || /username/i.test(error.message)) {
          toast.error("That username is taken.");
        } else {
          toast.error(error.message);
        }
        return;
      }
      toast.success("Account created!");
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
            <ChevronLeft />
          </Link>
          <span className="text-[11px] uppercase tracking-[0.18em] text-white/45">
            Step 1 of 1
          </span>
          <div className="h-9 w-9" />
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col px-6 pt-4 pb-6">
          <h1 className="wordmark text-[32px] text-foreground">Welcome.</h1>
          <p className="mt-2 text-[14px] text-white/55">
            Create your Univers<span className="text-primary">.</span> account.
          </p>

          <div className="mt-7 flex flex-col gap-2">
            <Label>Display name</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value.slice(0, 60))}
              placeholder="e.g. Alex Rivera"
              autoComplete="name"
            />

            <Label className="mt-3">Username</Label>
            <div className="flex h-14 items-center gap-1 rounded-[18px] border border-white/10 bg-white/[0.06] px-4 focus-within:border-primary focus-within:ring-4 focus-within:ring-ring/30 transition">
              <span className="text-[15px] text-white/35">@</span>
              <input
                value={username}
                onChange={(e) =>
                  setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24))
                }
                placeholder="alex"
                autoComplete="username"
                className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-white/35 focus:outline-none"
              />
              {username.length > 0 && (
                <span
                  className="text-[11px] font-medium uppercase tracking-wider"
                  style={{ color: usernameOk ? "var(--success)" : "rgba(255,255,255,0.4)" }}
                >
                  {usernameOk ? "ok" : "3–24, a–z 0–9 _"}
                </span>
              )}
            </div>

            <Label className="mt-3">Email</Label>
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <Label className="mt-3">Password</Label>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <label className="mt-5 flex items-start gap-3 cursor-pointer select-none">
            <span
              onClick={() => setAgreed((v) => !v)}
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                agreed ? "bg-primary border-primary" : "border-white/25 bg-transparent"
              }`}
            >
              {agreed && <Check />}
            </span>
            <span className="text-[12px] leading-relaxed text-white/55">
              I agree to the{" "}
              <span className="text-primary underline-offset-2 underline">Terms</span>{" "}
              and{" "}
              <span className="text-primary underline-offset-2 underline">Privacy Policy</span>.
            </span>
            <input
              type="checkbox"
              className="sr-only"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
          </label>

          <div className="mt-auto pt-6">
            <button
              type="submit"
              disabled={!valid || busy}
              className="press h-14 w-full rounded-[22px] bg-primary text-[15px] font-semibold text-primary-foreground glow-mint disabled:opacity-40 disabled:shadow-none transition"
            >
              {busy ? "Creating…" : "Create account"}
            </button>
            <p className="mt-4 text-center text-[12px] text-white/50">
              Already have an account?{" "}
              <Link to="/signin" className="text-primary font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`text-[11px] font-medium uppercase tracking-[0.14em] text-white/45 ${className}`}>
      {children}
    </span>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-14 w-full rounded-[18px] border border-white/10 bg-white/[0.06] px-4 text-[15px] text-foreground placeholder:text-white/35 focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring/30 transition"
    />
  );
}

function ChevronLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Check() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path d="M5 12l4 4 10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
