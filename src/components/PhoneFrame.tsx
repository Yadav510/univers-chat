import type { ReactNode } from "react";

/**
 * Mobile-first container. On desktop, content is centered with a max width
 * of 420px so the app always feels like a phone. On mobile it fills the
 * viewport. Safe-area aware (notch + home indicator).
 */
export function PhoneFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="min-h-dvh w-full bg-background flex justify-center">
      <div
        className={`relative w-full max-w-[420px] min-h-dvh bg-background flex flex-col ${className}`}
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
