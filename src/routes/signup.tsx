import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PhoneFrame } from "@/components/PhoneFrame";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [{ title: "Welcome — Univers." }],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);

  const valid = email.includes("@") && password.length >= 6 && agreed;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    // Mock: skip OTP, go straight to profile setup
    navigate({ to: "/profile-setup" });
  }

  return (
    <PhoneFrame>
      {/* top bar */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <Link
          to="/"
          className="press flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-foreground"
          aria-label="Back"
        >
          <ChevronLeft />
        </Link>
        <span className="text-[11px] uppercase tracking-[0.18em] text-text-tertiary">
          Step 1 of 2
        </span>
        <div className="h-9 w-9" />
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex-1 flex flex-col px-6 pt-6"
      >
        <h1 className="text-[32px] wordmark text-foreground">Welcome.</h1>
        <p className="mt-2 text-[14px] text-muted-foreground">
          Create your Univers<span className="text-primary">.</span> account in seconds.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <FieldLabel>Email</FieldLabel>
          <input
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-14 w-full rounded-[18px] border border-border bg-input px-4 text-[15px] text-foreground placeholder:text-text-tertiary focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring/30 transition"
          />

          <FieldLabel className="mt-2">Password</FieldLabel>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-14 w-full rounded-[18px] border border-border bg-input px-4 text-[15px] text-foreground placeholder:text-text-tertiary focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring/30 transition"
          />
        </div>

        {/* terms */}
        <label className="mt-6 flex items-start gap-3 cursor-pointer select-none">
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
              agreed
                ? "bg-primary border-primary"
                : "border-border-strong bg-transparent"
            }`}
            onClick={() => setAgreed((v) => !v)}
          >
            {agreed && <Check />}
          </span>
          <span className="text-[12px] leading-relaxed text-muted-foreground">
            I agree to the{" "}
            <span className="text-primary-soft underline-offset-2 underline">Terms</span>{" "}
            and{" "}
            <span className="text-primary-soft underline-offset-2 underline">Privacy Policy</span>.
          </span>
          <input
            type="checkbox"
            className="sr-only"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
        </label>

        <div className="mt-auto pb-8 pt-8">
          <button
            type="submit"
            disabled={!valid}
            className="press h-14 w-full rounded-[22px] bg-primary text-[15px] font-semibold text-primary-foreground glow-violet disabled:opacity-40 disabled:shadow-none transition"
          >
            Continue
          </button>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-text-tertiary">
            <ShieldDot />
            Your data is never sold or shared.
          </p>
        </div>
      </form>
    </PhoneFrame>
  );
}

function FieldLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`text-[11px] font-medium uppercase tracking-[0.14em] text-text-tertiary ${className}`}
    >
      {children}
    </span>
  );
}

function ChevronLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M15 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Check() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 12l4 4 10-10"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldDot() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"
        stroke="var(--success)"
        strokeWidth="1.6"
      />
    </svg>
  );
}
