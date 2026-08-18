import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Univers. — Private. Powerful. Yours." },
      {
        name: "description",
        content:
          "Univers. is a premium private messenger. End-to-end encrypted, works offline, instant delivery.",
      },
      { property: "og:title", content: "Univers. — Private messaging" },
      {
        property: "og:description",
        content:
          "End-to-end encrypted messaging that works offline and delivers instantly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SplashPage,
});

function SplashPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading && session) navigate({ to: "/chats", replace: true });
  }, [loading, session, navigate]);

  return (
    <div
      className="relative min-h-dvh w-full overflow-hidden bg-background flex justify-center"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="pointer-events-none absolute inset-0 starfield opacity-60" />
      <div
        className="pointer-events-none absolute inset-x-0 top-1/3 h-[440px] blur-[120px] opacity-60"
        style={{
          background:
            "radial-gradient(ellipse at center, color-mix(in oklab, var(--primary) 60%, transparent), transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-[420px] min-h-dvh flex flex-col items-center px-6">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <h1 className="wordmark text-[56px] text-foreground">
            Univers<span className="text-primary">.</span>
          </h1>
          <p className="mt-4 text-[15px] text-white/55 tracking-tight">
            Private. Powerful. Yours.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {["End-to-end encrypted", "Works offline", "Instant delivery"].map(
              (t) => (
                <span
                  key={t}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/65"
                >
                  {t}
                </span>
              ),
            )}
          </div>
        </div>

        <div className="w-full pb-8 flex flex-col gap-3">
          <Link
            to="/signup"
            className="press flex h-14 w-full items-center justify-center rounded-[22px] bg-primary text-[15px] font-semibold text-primary-foreground glow-primary"
          >
            Get started
          </Link>
          <Link
            to="/signin"
            className="press flex h-14 w-full items-center justify-center rounded-[22px] border border-white/15 bg-transparent text-[15px] font-medium text-foreground"
          >
            I already have an account
          </Link>
          <p className="mt-2 text-center text-[11px] text-white/45">
            By continuing you agree to our Terms & Privacy.
          </p>
        </div>
      </div>
    </div>
  );
}
