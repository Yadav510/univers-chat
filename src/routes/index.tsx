import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Univers. — Private. Powerful. Yours." },
      {
        name: "description",
        content:
          "Univers. is a premium private messenger. End-to-end encrypted. Zero data sold.",
      },
    ],
  }),
  component: SplashPage,
});

function SplashPage() {
  return (
    <div
      className="relative min-h-dvh w-full overflow-hidden bg-background flex justify-center"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* ambient starfield */}
      <div className="pointer-events-none absolute inset-0 starfield opacity-70" />
      <div
        className="pointer-events-none absolute inset-x-0 top-1/3 h-[420px] blur-[120px] opacity-60"
        style={{
          background:
            "radial-gradient(ellipse at center, var(--primary-glow), transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-[420px] min-h-dvh flex flex-col items-center px-6">
        {/* Center wordmark */}
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <h1 className="wordmark text-[56px] text-foreground">
            Univers<span className="text-primary">.</span>
          </h1>
          <p className="mt-4 text-[15px] text-muted-foreground tracking-tight">
            Private. Powerful. Yours.
          </p>
        </div>

        {/* CTAs */}
        <div className="w-full pb-8 flex flex-col gap-3">
          <Link
            to="/signup"
            className="press flex h-14 w-full items-center justify-center rounded-[22px] bg-primary text-[15px] font-semibold text-primary-foreground glow-violet"
          >
            Get started
          </Link>
          <Link
            to="/signup"
            className="press flex h-14 w-full items-center justify-center rounded-[22px] border border-border-strong bg-transparent text-[15px] font-medium text-foreground"
          >
            I already have an account
          </Link>
          <p className="mt-2 text-center text-[11px] text-text-tertiary">
            By continuing you agree to our Terms & Privacy.
          </p>
        </div>
      </div>
    </div>
  );
}
