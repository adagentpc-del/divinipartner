import type { ResolvedBranding } from "./usePartnerBranding";
import { PartnerLogo } from "./PartnerLogo";

interface PortalHeroProps {
  partnerName: string;
  partnerLogoUrl?: string | null;
  branding: ResolvedBranding;
  defaultHeadline?: string;
  defaultSubheadline?: string;
  ctaSlot?: React.ReactNode;
}

function getHeroBackground(branding: ResolvedBranding): React.CSSProperties {
  const { templateKey, primary, accent, secondary, heroBackgroundMode } = branding;

  if (heroBackgroundMode === "solid") {
    return { backgroundColor: primary };
  }

  if (templateKey === "luxe_dark") {
    return {
      background: `radial-gradient(ellipse at 50% 0%, ${accent}18 0%, ${primary} 70%)`,
    };
  }

  if (templateKey === "neon_creative") {
    return {
      background: `radial-gradient(ellipse at 30% 20%, ${accent}30 0%, transparent 50%), 
                    radial-gradient(ellipse at 70% 80%, #a855f730 0%, transparent 50%),
                    linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`,
    };
  }

  return {
    background: `linear-gradient(135deg, ${primary} 0%, ${primary}dd 50%, ${secondary} 100%)`,
  };
}

function getGlowOverlay(branding: ResolvedBranding): React.ReactNode {
  if (branding.templateKey === "luxe_dark") {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute w-[600px] h-[600px] -top-48 left-1/2 -translate-x-1/2 rounded-full opacity-20 blur-3xl"
          style={{ backgroundColor: branding.accent }}
        />
      </div>
    );
  }
  if (branding.templateKey === "neon_creative") {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute w-[500px] h-[500px] -top-32 -left-24 rounded-full opacity-25 blur-3xl"
          style={{ backgroundColor: branding.accent }}
        />
        <div
          className="absolute w-[400px] h-[400px] -bottom-24 -right-16 rounded-full opacity-20 blur-3xl"
          style={{ backgroundColor: "#a855f7" }}
        />
      </div>
    );
  }
  return (
    <div
      className="absolute inset-0 opacity-[0.03] pointer-events-none"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }}
    />
  );
}

export function PortalHero({
  partnerName,
  partnerLogoUrl,
  branding,
  defaultHeadline,
  defaultSubheadline,
  ctaSlot,
}: PortalHeroProps) {
  const showLogoInHero = branding.logoPlacement === "hero_center" || branding.logoPlacement === "navbar_and_hero";
  const headline = branding.heroHeadline || defaultHeadline || `Welcome to ${partnerName}`;
  const subheadline = branding.heroSubheadline || defaultSubheadline || "";
  const eyebrow = branding.heroEyebrow;
  const textColor = branding.isDark ? "#ffffff" : "#ffffff";

  return (
    <section className="relative overflow-hidden" style={getHeroBackground(branding)}>
      {getGlowOverlay(branding)}

      {branding.heroBackgroundMode === "image" && branding.heroBackgroundStorageKey && (
        <div className="absolute inset-0">
          <img
            src={branding.heroBackgroundStorageKey.startsWith("/api/") ? branding.heroBackgroundStorageKey : `/api/storage/objects/${branding.heroBackgroundStorageKey.replace(/^\/objects\//, "")}`}
            alt=""
            className="w-full h-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{ backgroundColor: branding.primary, opacity: branding.heroOverlayIntensity }}
          />
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24 relative z-10">
        <div className="text-center space-y-5">
          {showLogoInHero && (
            <div className="flex justify-center mb-6">
              <PartnerLogo
                src={partnerLogoUrl || branding.logoUrl}
                name={partnerName}
                size={72}
                variant="onDark"
              />
            </div>
          )}

          {eyebrow && (
            <p
              className="text-xs sm:text-sm font-semibold uppercase tracking-[0.2em]"
              style={{ color: branding.accent }}
            >
              {eyebrow}
            </p>
          )}

          <h2
            className="text-3xl sm:text-5xl font-bold tracking-tight leading-tight"
            style={{ color: textColor, fontFamily: branding.headingFont }}
          >
            {headline}
          </h2>

          {subheadline && (
            <p className="text-base sm:text-lg max-w-2xl mx-auto leading-relaxed" style={{ color: `${textColor}cc` }}>
              {subheadline}
            </p>
          )}

          {ctaSlot && <div className="flex flex-wrap justify-center gap-3 pt-4">{ctaSlot}</div>}
        </div>
      </div>
    </section>
  );
}
