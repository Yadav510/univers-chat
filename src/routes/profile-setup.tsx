import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PhoneFrame } from "@/components/PhoneFrame";

export const Route = createFileRoute("/profile-setup")({
  head: () => ({ meta: [{ title: "Set up your profile — Univers." }] }),
  component: ProfileSetupPage,
});

function ProfileSetupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");

  const usernameOk = username.length >= 3;
  const valid = name.length >= 2 && usernameOk;

  return (
    <PhoneFrame>
      <div className="px-6 pt-8 pb-4">
        <span className="text-[11px] uppercase tracking-[0.18em] text-text-tertiary">
          Step 2 of 2
        </span>
        <h1 className="mt-2 text-[28px] wordmark text-foreground">
          Set up your profile
        </h1>
        <p className="mt-1 text-[14px] text-muted-foreground">
          You can change all of this later.
        </p>
      </div>

      {/* Avatar picker */}
      <div className="flex justify-center pt-2 pb-6">
        <button
          type="button"
          className="press relative grid h-[104px] w-[104px] place-items-center rounded-[28px] ring-2 ring-primary ring-offset-4 ring-offset-background"
          style={{
            background:
              "linear-gradient(135deg, var(--surface-elevated), var(--surface))",
          }}
          aria-label="Pick avatar"
        >
          <span className="text-[28px] font-semibold text-text-secondary">
            {name ? name.trim()[0]?.toUpperCase() : "+"}
          </span>
          <span className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground glow-violet">
            <CameraIcon />
          </span>
        </button>
      </div>

      <form
        className="flex flex-1 flex-col px-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) navigate({ to: "/chats" });
        }}
      >
        <Field label="Display name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Alex Rivera"
            className="h-14 w-full rounded-[18px] border border-border bg-input px-4 text-[15px] text-foreground placeholder:text-text-tertiary focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring/30 transition"
          />
        </Field>

        <Field label="Username">
          <div className="flex h-14 items-center gap-1 rounded-[18px] border border-border bg-input px-4 focus-within:border-primary focus-within:ring-4 focus-within:ring-ring/30 transition">
            <span className="text-[15px] text-text-tertiary">@</span>
            <input
              value={username}
              onChange={(e) =>
                setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))
              }
              placeholder="alex"
              className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-text-tertiary focus:outline-none"
            />
            {username.length > 0 && (
              <span
                className={`text-[11px] font-medium uppercase tracking-wider ${
                  usernameOk ? "text-success" : "text-text-tertiary"
                }`}
                style={usernameOk ? { color: "var(--success)" } : undefined}
              >
                {usernameOk ? "available" : "too short"}
              </span>
            )}
          </div>
        </Field>

        <Field label={`Bio (${bio.length}/80)`}>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 80))}
            rows={2}
            placeholder="A short line about you (optional)"
            className="w-full resize-none rounded-[18px] border border-border bg-input px-4 py-3 text-[15px] text-foreground placeholder:text-text-tertiary focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring/30 transition"
          />
        </Field>

        <div className="mt-auto pb-8 pt-6">
          <button
            type="submit"
            disabled={!valid}
            className="press h-14 w-full rounded-[22px] bg-primary text-[15px] font-semibold text-primary-foreground glow-violet disabled:opacity-40 disabled:shadow-none transition"
          >
            Start messaging
          </button>
        </div>
      </form>
    </PhoneFrame>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-4 flex flex-col gap-2">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-tertiary">
        {label}
      </span>
      {children}
    </label>
  );
}

function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 8h3l2-2h6l2 2h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
