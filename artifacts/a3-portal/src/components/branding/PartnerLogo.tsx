import React from "react";

interface PartnerLogoProps {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
  variant?: "default" | "onDark";
}

/**
 * Renders the partner's logo with a clean text-mark fallback derived from
 * company initials. Preserves aspect ratio via object-contain and never
 * distorts the source image.
 */
export function PartnerLogo({ src, name, size = 40, className = "", variant = "default" }: PartnerLogoProps) {
  const [errored, setErrored] = React.useState(false);
  if (src && !errored) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setErrored(true)}
        className={`object-contain ${className}`}
        style={{ height: size, maxWidth: size * 4, width: "auto" }}
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "•";
  const bg = variant === "onDark" ? "rgba(255,255,255,0.12)" : "var(--brand-primary, #0f1729)";
  const fg = variant === "onDark" ? "#fff" : "#fff";
  return (
    <div
      className={`flex items-center justify-center font-bold rounded-lg ${className}`}
      style={{
        height: size,
        width: size,
        backgroundColor: bg,
        color: fg,
        fontSize: Math.max(11, size * 0.38),
        letterSpacing: "0.02em",
      }}
      aria-label={name}
    >
      {initials}
    </div>
  );
}
