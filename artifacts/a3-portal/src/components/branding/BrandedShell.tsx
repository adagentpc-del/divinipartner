import React from "react";
import { resolveBranding, type PartnerThemeShape, type ResolvedBranding } from "./usePartnerBranding";

interface BrandedShellProps {
  theme?: PartnerThemeShape | null;
  className?: string;
  children: React.ReactNode | ((branding: ResolvedBranding) => React.ReactNode);
}

/**
 * Wraps a portal page with the partner's branding context. Sets CSS variables
 * (--brand-primary, --brand-button, etc.) on the wrapper so downstream
 * components can opt into branded styling without prop-drilling.
 *
 * Use the render-prop form when a child needs the resolved color tokens
 * directly (e.g. inline `style` on a Button).
 */
export function BrandedShell({ theme, className, children }: BrandedShellProps) {
  const branding = resolveBranding(theme);
  return (
    <div className={className ?? "min-h-screen"} style={branding.shellStyle}>
      {typeof children === "function" ? children(branding) : children}
    </div>
  );
}
