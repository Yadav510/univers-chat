import type { CSSProperties } from "react";

type AvatarProps = {
  initials: string;
  color: string;
  size?: number;
  radius?: number;
  online?: boolean;
  ring?: boolean;
};

/**
 * Univers. avatar — rounded-square (not circle) per design system.
 */
export function Avatar({
  initials,
  color,
  size = 46,
  radius = 16,
  online = false,
  ring = false,
}: AvatarProps) {
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    background: `linear-gradient(135deg, ${color} 0%, ${color}CC 100%)`,
    fontSize: Math.max(11, size * 0.34),
  };

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className={`flex h-full w-full items-center justify-center font-semibold text-white ${
          ring ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
        }`}
        style={style}
      >
        {initials}
      </div>
      {online && (
        <span
          className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-background"
          style={{ width: size * 0.28, height: size * 0.28, background: "var(--success)" }}
        />
      )}
    </div>
  );
}
