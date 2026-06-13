import type { CSSProperties } from "react";

type Props = {
  name: string;
  color: string;
  size?: number;
  online?: boolean;
  ring?: "mint" | "none";
};

/**
 * Circular avatar with initials, optional mint ring, and online dot.
 */
export function Avatar({ name, color, size = 48, online = false, ring = "none" }: Props) {
  const initials = (() => {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "U";
  })();

  const inner: CSSProperties = {
    width: size,
    height: size,
    background: `linear-gradient(135deg, ${color}, ${color}CC)`,
    fontSize: Math.max(11, size * 0.36),
  };

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className={`flex h-full w-full items-center justify-center rounded-full font-semibold text-white select-none ${
          ring === "mint"
            ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
            : ""
        }`}
        style={inner}
      >
        {initials}
      </div>
      {online && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full border-2"
          style={{
            width: size * 0.28,
            height: size * 0.28,
            background: "var(--success)",
            borderColor: "var(--background)",
          }}
        />
      )}
    </div>
  );
}
