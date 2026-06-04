import type { CSSProperties } from "react";
import type { ResolvedBranding } from "./usePartnerBranding";

/**
 * Shared premium surface styling for the customer portal. These helpers keep
 * the live portal and admin preview visually identical and ensure every card,
 * panel, and divider follows the partner theme instead of falling back to
 * generic shadcn defaults (white cards on dark backgrounds, gray borders, etc).
 */

export function hairline(branding: ResolvedBranding): string {
  return branding.isDark ? "rgba(255,255,255,0.10)" : "rgba(15,23,42,0.08)";
}

export function softHairline(branding: ResolvedBranding): string {
  return branding.isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)";
}

/** Primary themed card surface (packages, review blocks, etc). */
export function cardSurface(
  branding: ResolvedBranding,
  opts: { selected?: boolean; interactive?: boolean } = {},
): CSSProperties {
  const isGlass = branding.cardStyle === "glass";
  const base: CSSProperties = {
    borderRadius: branding.radius,
    backdropFilter: isGlass ? "blur(14px)" : undefined,
    transition: "transform .2s ease, box-shadow .2s ease, border-color .2s ease, background-color .2s ease",
  };
  if (opts.selected) {
    return {
      ...base,
      backgroundColor: branding.isDark ? `${branding.accent}1f` : `${branding.accent}10`,
      border: `1px solid ${branding.accent}`,
      boxShadow: `0 0 0 1px ${branding.accent}, 0 16px 40px -18px ${branding.accent}66`,
    };
  }
  return {
    ...base,
    backgroundColor: branding.isDark
      ? (isGlass ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.03)")
      : (isGlass ? "rgba(255,255,255,0.72)" : "#ffffff"),
    border: `1px solid ${hairline(branding)}`,
    boxShadow: branding.isDark
      ? "0 10px 30px -22px rgba(0,0,0,0.7)"
      : "0 6px 20px -12px rgba(15,23,42,0.12)",
  };
}

/** Subtle inset panel (info notes, "your add-ons" tray, step hint). */
export function mutedPanel(branding: ResolvedBranding): CSSProperties {
  return {
    borderRadius: branding.radius,
    backgroundColor: branding.isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.03)",
    border: `1px solid ${softHairline(branding)}`,
  };
}

/** Highlight panel for totals / accent emphasis. */
export function accentPanel(branding: ResolvedBranding): CSSProperties {
  return {
    borderRadius: branding.radius,
    backgroundColor: branding.isDark ? `${branding.accent}1a` : `${branding.accent}0d`,
    border: `1px solid ${branding.accent}40`,
  };
}

export function titleColor(branding: ResolvedBranding): string {
  return branding.isDark ? "#ffffff" : branding.text;
}

/** Decorative radial-glow background layers for the page shell. */
export function shellGlowLayers(branding: ResolvedBranding): CSSProperties {
  if (!branding.isDark) {
    return {
      backgroundImage: `radial-gradient(60% 50% at 80% 0%, ${branding.accent}0f 0%, transparent 60%), radial-gradient(50% 40% at 0% 20%, ${branding.primary}0a 0%, transparent 55%)`,
    };
  }
  return {
    backgroundImage: `radial-gradient(55% 45% at 85% -5%, ${branding.accent}26 0%, transparent 60%), radial-gradient(45% 40% at 5% 15%, ${branding.primary}40 0%, transparent 55%), radial-gradient(40% 35% at 50% 110%, ${branding.accent}1a 0%, transparent 60%)`,
  };
}
