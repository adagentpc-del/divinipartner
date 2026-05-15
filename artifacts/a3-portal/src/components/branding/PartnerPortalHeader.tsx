import { useEffect, useState } from "react";
import type { ResolvedBranding } from "./usePartnerBranding";
import { PartnerLogo } from "./PartnerLogo";
import { fetchPublicConfig } from "@/lib/publicUrl";

interface PartnerPortalHeaderProps {
  partnerName: string;
  partnerLogoUrl?: string | null;
  branding: ResolvedBranding;
  defaultHeadline?: string;
  defaultSubheadline?: string;
  ctaSlot?: React.ReactNode;
}

function backgroundImageSrc(storageKey: string): string {
  if (!storageKey) return "";
  if (storageKey.startsWith("/api/")) return storageKey;
  if (storageKey.startsWith("http")) return storageKey;
  return `/api/storage/objects/${storageKey.replace(/^\/objects\//, "")}`;
}

/** Defense-in-depth URL sanitizer for href / src attributes built from
 * partner-supplied theme fields. Server-side validation is the primary
 * defense (see partnerThemes.ts SafeUrl); this blocks anything that slipped
 * through legacy data or a misconfigured upstream. */
function safeUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") return url;
    return "";
  } catch {
    return "";
  }
}

function HeaderBackground({ branding }: { branding: ResolvedBranding }) {
  const { primary, secondary, accent, heroBackgroundMode, heroBackgroundStorageKey, heroOverlayIntensity, headerBackgroundVideoUrl, headerTheme, templateKey } = branding;

  const isDark = headerTheme === "dark";
  const baseGradient = isDark
    ? `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`
    : `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`;

  // Video background takes precedence (autoplay muted loop)
  const safeVideoSrc = safeUrl(headerBackgroundVideoUrl);
  if (safeVideoSrc) {
    return (
      <>
        <video
          src={safeVideoSrc}
          autoPlay
          muted
          loop
          playsInline
          aria-label="Partner header background"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{ backgroundColor: isDark ? "#000" : primary, opacity: heroOverlayIntensity }}
        />
      </>
    );
  }

  if (heroBackgroundMode === "image" && heroBackgroundStorageKey) {
    return (
      <>
        <img src={backgroundImageSrc(heroBackgroundStorageKey)} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ backgroundColor: isDark ? "#000" : primary, opacity: heroOverlayIntensity }} />
      </>
    );
  }

  // Gradient + template-aware glow
  return (
    <>
      <div className="absolute inset-0" style={{ background: baseGradient }} />
      {templateKey === "luxe_dark" && (
        <div className="absolute w-[600px] h-[600px] -top-48 left-1/2 -translate-x-1/2 rounded-full opacity-20 blur-3xl pointer-events-none" style={{ backgroundColor: accent }} />
      )}
      {templateKey === "neon_creative" && (
        <>
          <div className="absolute w-[500px] h-[500px] -top-32 -left-24 rounded-full opacity-25 blur-3xl pointer-events-none" style={{ backgroundColor: accent }} />
          <div className="absolute w-[400px] h-[400px] -bottom-24 -right-16 rounded-full opacity-20 blur-3xl pointer-events-none" style={{ backgroundColor: "#a855f7" }} />
        </>
      )}
    </>
  );
}

/**
 * Bottom-right A3 Visual lockup with a "matching background cut out of the
 * header" effect — the lockup sits in a notch carved out of the header by
 * rendering a panel that uses the page background color, with rounded inner
 * corners to suggest a continuous cut. The A3 logo (light/dark variant
 * resolved against header theme) sits inside the notch.
 */
function HeaderA3Lockup({ branding, lightUrl, darkUrl }: { branding: ResolvedBranding; lightUrl: string | null; darkUrl: string | null }) {
  // Logo is rendered ON the page background (in the notch). On the page,
  // background lives behind the header; we want a logo legible on that
  // background — same dark/light pairing as the header but inverted because
  // it sits on the page, not on the header.
  const headerIsDark = branding.headerTheme === "dark";
  // Page background usually matches branding.background (page area below the
  // header). If page bg is dark we use light logo; if light, dark logo.
  const pageIsDark = branding.isDark; // background-derived
  const useLight = pageIsDark;
  const logoSrc = useLight ? lightUrl : darkUrl;
  const fallbackText = "A3 VISUAL";
  const pageBg = branding.background;

  return (
    <div className="pointer-events-none absolute right-0 bottom-0 z-20 flex items-end" aria-hidden={false}>
      {/* Top-left corner curve to suggest a notch */}
      <div
        className="self-stretch w-6"
        style={{
          background: `radial-gradient(circle at 0% 100%, transparent 0, transparent 22px, ${pageBg} 22px)`,
        }}
      />
      <div
        className="pointer-events-auto flex items-center gap-2 rounded-tl-2xl px-4 py-2.5 sm:px-5 sm:py-3 shadow-lg"
        style={{ backgroundColor: pageBg }}
        title="A3 Visual partnership"
      >
        <span className="text-[9px] uppercase tracking-[0.18em]" style={{ color: useLight ? "rgba(255,255,255,0.55)" : "rgba(15,23,42,0.55)" }}>
          A3 partnership
        </span>
        <span className="block w-px h-5" style={{ backgroundColor: useLight ? "rgba(255,255,255,0.18)" : "rgba(15,23,42,0.12)" }} />
        {logoSrc ? (
          <img src={logoSrc} alt="A3 Visual" className="h-6 sm:h-7 w-auto object-contain" />
        ) : (
          <span className="text-xs font-extrabold tracking-wider" style={{ color: useLight ? "#ffffff" : "#0f172a" }}>
            {fallbackText}
          </span>
        )}
      </div>
    </div>
  );
}

function HeaderHeading({ branding, headline, subheadline, eyebrow, textColor, mutedColor, align }: {
  branding: ResolvedBranding;
  headline: string;
  subheadline: string;
  eyebrow: string;
  textColor: string;
  mutedColor: string;
  align: "left" | "center";
}) {
  const alignClass = align === "center" ? "text-center" : "text-left";
  return (
    <div className={`space-y-4 sm:space-y-5 ${alignClass}`}>
      {eyebrow && (
        <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: branding.accent }}>
          {eyebrow}
        </p>
      )}
      <h1
        className="text-3xl sm:text-5xl font-bold tracking-tight leading-tight"
        style={{ color: textColor, fontFamily: branding.headingFont }}
      >
        {headline}
      </h1>
      {subheadline && (
        <p className={`text-base sm:text-lg leading-relaxed max-w-2xl ${align === "center" ? "mx-auto" : ""}`} style={{ color: mutedColor }}>
          {subheadline}
        </p>
      )}
    </div>
  );
}

function HeaderCtas({ branding, ctaSlot }: { branding: ResolvedBranding; ctaSlot?: React.ReactNode }) {
  if (ctaSlot) return <>{ctaSlot}</>;

  const { ctaLabel, ctaUrl, secondaryCtaLabel, secondaryCtaUrl, button, buttonText, accent } = branding;
  if (!ctaLabel && !secondaryCtaLabel) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {ctaLabel && (
        <a
          href={safeUrl(ctaUrl) || "#"}
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg font-semibold text-sm shadow-md transition-transform hover:scale-[1.02]"
          style={{ backgroundColor: button, color: buttonText }}
        >
          {ctaLabel}
        </a>
      )}
      {secondaryCtaLabel && (
        <a
          href={safeUrl(secondaryCtaUrl) || "#"}
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg font-semibold text-sm border-2 transition-colors"
          style={{ borderColor: accent, color: accent, backgroundColor: "transparent" }}
        >
          {secondaryCtaLabel}
        </a>
      )}
    </div>
  );
}

export function PartnerPortalHeader({
  partnerName,
  partnerLogoUrl,
  branding,
  defaultHeadline,
  defaultSubheadline,
  ctaSlot,
}: PartnerPortalHeaderProps) {
  // Bundled A3 lockup defaults — env vars (A3_LOCKUP_LOGO_*_URL) override.
  const defaultLight = `${import.meta.env.BASE_URL}brand/a3-lockup-on-dark.jpeg`;
  const defaultDark = `${import.meta.env.BASE_URL}brand/a3-lockup-on-light.jpeg`;
  const [a3LightUrl, setA3LightUrl] = useState<string | null>(defaultLight);
  const [a3DarkUrl, setA3DarkUrl] = useState<string | null>(defaultDark);

  useEffect(() => {
    fetchPublicConfig()
      .then((cfg) => {
        setA3LightUrl(cfg.a3LockupLogoLightUrl || defaultLight);
        setA3DarkUrl(cfg.a3LockupLogoDarkUrl || defaultDark);
      })
      .catch(() => { /* silent — bundled defaults already set */ });
  }, [defaultLight, defaultDark]);

  const headerIsDark = branding.headerTheme === "dark";
  const textColor = headerIsDark ? "#ffffff" : "#0f172a";
  const mutedColor = headerIsDark ? "rgba(255,255,255,0.78)" : "rgba(15,23,42,0.72)";
  const headline = branding.heroHeadline || defaultHeadline || `Welcome to ${partnerName}`;
  const subheadline = branding.heroSubheadline || defaultSubheadline || "";
  const eyebrow = branding.heroEyebrow;
  const layout = branding.headerLayoutStyle;
  const showLogo = !!(partnerLogoUrl || branding.logoUrl);

  // Layout-specific rendering
  let body: React.ReactNode;
  if (layout === "centered_logo_hero") {
    body = (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24 relative z-10">
        <div className="flex flex-col items-center gap-6">
          {showLogo && (
            <PartnerLogo src={partnerLogoUrl || branding.logoUrl} name={partnerName} size={88} variant={headerIsDark ? "onDark" : "default"} />
          )}
          <HeaderHeading branding={branding} headline={headline} subheadline={subheadline} eyebrow={eyebrow} textColor={textColor} mutedColor={mutedColor} align="center" />
          <div className="pt-2 flex justify-center"><HeaderCtas branding={branding} ctaSlot={ctaSlot} /></div>
        </div>
      </div>
    );
  } else if (layout === "event_microsite") {
    body = (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 relative z-10">
        <div className="max-w-3xl">
          <HeaderHeading branding={branding} headline={headline} subheadline={subheadline} eyebrow={eyebrow} textColor={textColor} mutedColor={mutedColor} align="left" />
          <div className="pt-6"><HeaderCtas branding={branding} ctaSlot={ctaSlot} /></div>
        </div>
      </div>
    );
  } else if (layout === "minimal") {
    body = (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 relative z-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            {showLogo && (
              <PartnerLogo src={partnerLogoUrl || branding.logoUrl} name={partnerName} size={44} variant={headerIsDark ? "onDark" : "default"} />
            )}
            <div>
              {eyebrow && <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: branding.accent }}>{eyebrow}</p>}
              <h1 className="text-xl sm:text-2xl font-bold" style={{ color: textColor, fontFamily: branding.headingFont }}>{headline}</h1>
            </div>
          </div>
          <HeaderCtas branding={branding} ctaSlot={ctaSlot} />
        </div>
      </div>
    );
  } else if (layout === "split_image") {
    body = (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 relative z-10">
        <div className="grid sm:grid-cols-2 gap-8 sm:gap-12 items-center">
          <div>
            <HeaderHeading branding={branding} headline={headline} subheadline={subheadline} eyebrow={eyebrow} textColor={textColor} mutedColor={mutedColor} align="left" />
            <div className="pt-6"><HeaderCtas branding={branding} ctaSlot={ctaSlot} /></div>
          </div>
          <div className="hidden sm:flex items-center justify-center">
            {showLogo && (
              <div className="rounded-2xl p-8 backdrop-blur-md" style={{ backgroundColor: headerIsDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.04)", border: `1px solid ${headerIsDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.08)"}` }}>
                <PartnerLogo src={partnerLogoUrl || branding.logoUrl} name={partnerName} size={120} variant={headerIsDark ? "onDark" : "default"} />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  } else {
    // full_width_hero (default)
    body = (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24 relative z-10">
        <div className="text-center space-y-5">
          {showLogo && (branding.logoPlacement === "hero_center" || branding.logoPlacement === "navbar_and_hero") && (
            <div className="flex justify-center mb-4">
              <PartnerLogo src={partnerLogoUrl || branding.logoUrl} name={partnerName} size={72} variant={headerIsDark ? "onDark" : "default"} />
            </div>
          )}
          <HeaderHeading branding={branding} headline={headline} subheadline={subheadline} eyebrow={eyebrow} textColor={textColor} mutedColor={mutedColor} align="center" />
          <div className="flex justify-center pt-2"><HeaderCtas branding={branding} ctaSlot={ctaSlot} /></div>
        </div>
      </div>
    );
  }

  // Reserve right padding so layout content doesn't collide with the lockup notch
  return (
    <header className="relative overflow-hidden" data-header-theme={branding.headerTheme}>
      <HeaderBackground branding={branding} />
      <div className="relative pr-0 sm:pr-[200px]">{body}</div>
      <HeaderA3Lockup branding={branding} lightUrl={a3LightUrl} darkUrl={a3DarkUrl} />
    </header>
  );
}
