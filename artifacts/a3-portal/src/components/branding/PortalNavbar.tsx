import { PartnerLogo } from "./PartnerLogo";
import type { ResolvedBranding } from "./usePartnerBranding";
import { Menu, X } from "lucide-react";
import { useState } from "react";

interface PortalNavbarProps {
  partnerName: string;
  partnerLogoUrl?: string | null;
  branding: ResolvedBranding;
}

function LogoWithTreatment({ src, name, size, treatment, branding }: {
  src?: string | null;
  name: string;
  size: number;
  treatment: string;
  branding: ResolvedBranding;
}) {
  const pillClasses: Record<string, string> = {
    white_pill: "bg-white/90 px-3 py-1.5 rounded-full",
    dark_pill: "bg-black/60 px-3 py-1.5 rounded-full",
    glass_pill: "bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20",
  };
  const cls = pillClasses[treatment] || "";
  return (
    <div className={cls}>
      <PartnerLogo
        src={src || branding.logoUrl}
        name={name}
        size={size}
        variant={branding.isDark ? "onDark" : "default"}
      />
    </div>
  );
}

export function PortalNavbar({ partnerName, partnerLogoUrl, branding }: PortalNavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const showLogo = branding.logoPlacement === "navbar_left" || branding.logoPlacement === "navbar_and_hero";
  const navBg = branding.isDark
    ? `${branding.primary}f0`
    : `rgba(255,255,255,0.92)`;
  const borderColor = branding.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-lg"
      style={{ backgroundColor: navBg, borderBottom: `1px solid ${borderColor}` }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {showLogo ? (
            <LogoWithTreatment
              src={partnerLogoUrl}
              name={partnerName}
              size={40}
              treatment={branding.logoBackgroundTreatment}
              branding={branding}
            />
          ) : (
            <h1
              className="text-lg sm:text-xl font-bold tracking-tight"
              style={{ color: branding.isDark ? "#fff" : branding.primary, fontFamily: branding.headingFont }}
            >
              {partnerName}
            </h1>
          )}

          {branding.showPoweredByA3 && (
            <>
              <div className="w-px h-6 hidden sm:block" style={{ backgroundColor: branding.isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)" }} />
              <div className="hidden sm:flex items-center gap-1.5 text-xs" style={{ color: branding.muted }}>
                <span>Powered by</span>
                <div
                  className="h-5 w-5 rounded flex items-center justify-center text-[9px] font-bold leading-none"
                  style={{ backgroundColor: branding.accent, color: branding.isDark ? "#fff" : branding.primary }}
                >
                  A3
                </div>
              </div>
            </>
          )}
        </div>

        <button
          className="sm:hidden p-2 rounded-lg transition-colors"
          style={{ color: branding.isDark ? "#fff" : branding.text }}
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
    </header>
  );
}
