import { useMemo } from "react";

export interface PartnerThemeShape {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  backgroundColor?: string | null;
  buttonColor?: string | null;
  textColor?: string | null;
  headingFont?: string | null;
  bodyFont?: string | null;
  borderRadius?: string | null;
}

export interface ResolvedBranding {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  button: string;
  buttonText: string;
  text: string;
  muted: string;
  headingFont: string;
  bodyFont: string;
  radius: string;
  /** Inline style object for the portal shell wrapper. */
  shellStyle: React.CSSProperties;
}

export const FALLBACK_BRANDING: Omit<ResolvedBranding, "shellStyle"> = {
  primary: "#0f1729",
  secondary: "#1e293b",
  accent: "#f59e0b",
  background: "#f8fafc",
  button: "#0f1729",
  buttonText: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  headingFont: "Inter, system-ui, sans-serif",
  bodyFont: "Inter, system-ui, sans-serif",
  radius: "0.75rem",
};

// Pick black or white for legible text against an arbitrary hex background.
function readableOn(hex: string | null | undefined, fallback = "#ffffff"): string {
  if (!hex || !/^#?[0-9a-f]{6}$/i.test(hex.replace("#", ""))) return fallback;
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // YIQ luminance — keeps contrast acceptable across most brand palettes.
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#0f172a" : "#ffffff";
}

export function resolveBranding(theme?: PartnerThemeShape | null): ResolvedBranding {
  const primary = theme?.primaryColor || FALLBACK_BRANDING.primary;
  const button = theme?.buttonColor || primary;
  const resolved = {
    primary,
    secondary: theme?.secondaryColor || FALLBACK_BRANDING.secondary,
    accent: theme?.accentColor || FALLBACK_BRANDING.accent,
    background: theme?.backgroundColor || FALLBACK_BRANDING.background,
    button,
    buttonText: readableOn(button),
    text: theme?.textColor || FALLBACK_BRANDING.text,
    muted: FALLBACK_BRANDING.muted,
    headingFont: theme?.headingFont || FALLBACK_BRANDING.headingFont,
    bodyFont: theme?.bodyFont || FALLBACK_BRANDING.bodyFont,
    radius: theme?.borderRadius || FALLBACK_BRANDING.radius,
  };
  // CSS variables consumed by BrandedShell + downstream components.
  const shellStyle: React.CSSProperties = {
    // @ts-ignore — CSS custom properties.
    "--brand-primary": resolved.primary,
    "--brand-secondary": resolved.secondary,
    "--brand-accent": resolved.accent,
    "--brand-background": resolved.background,
    "--brand-button": resolved.button,
    "--brand-button-text": resolved.buttonText,
    "--brand-text": resolved.text,
    "--brand-radius": resolved.radius,
    backgroundColor: resolved.background,
    color: resolved.text,
    fontFamily: resolved.bodyFont,
  };
  return { ...resolved, shellStyle };
}

export function usePartnerBranding(theme?: PartnerThemeShape | null): ResolvedBranding {
  return useMemo(() => resolveBranding(theme), [theme]);
}
