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
  const {
    primary, secondary, accent,
    heroBackgroundMode, heroBackgroundStorageKey, heroOverlayIntensity,
    headerBackgroundVideoUrl, headerTheme, templateKey,
    headerBackgroundColor, headerGlowEnabled, animationLevel,
  } = branding;

  const isDark = headerTheme === "dark";
  const baseColor = headerBackgroundColor || (isDark ? "#0c0e1a" : primary);
  const baseGradient = `linear-gradient(135deg, ${baseColor} 0%, ${secondary} 60%, ${baseColor} 100%)`;

  // Premium animated sweep — subtle moving gradient layer that respects
  // animationLevel + prefers-reduced-motion (handled by CSS).
  const animClass = animationLevel === "premium"
    ? "portal-anim-sweep portal-anim-sweep-fast"
    : animationLevel === "subtle"
      ? "portal-anim-sweep"
      : "";

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
          style={{ backgroundColor: isDark ? "#000" : baseColor, opacity: heroOverlayIntensity }}
        />
      </>
    );
  }

  if (heroBackgroundMode === "image" && heroBackgroundStorageKey) {
    return (
      <>
        <img src={backgroundImageSrc(heroBackgroundStorageKey)} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ backgroundColor: isDark ? "#000" : baseColor, opacity: heroOverlayIntensity }} />
      </>
    );
  }

  // Gradient + animated sweep + template-aware glow
  return (
    <>
      <div className="absolute inset-0" style={{ background: baseGradient }} />
      {animationLevel !== "none" && (
        <div
          className={`absolute inset-0 ${animClass}`}
          style={{
            background: `radial-gradient(60% 80% at 30% 20%, ${accent}26 0%, transparent 60%), radial-gradient(50% 70% at 80% 80%, ${primary}33 0%, transparent 60%)`,
            mixBlendMode: isDark ? "screen" : "multiply",
            opacity: 0.85,
          }}
        />
      )}
      {headerGlowEnabled && (
        <>
          {templateKey === "luxe_dark" && (
            <div className="absolute w-[600px] h-[600px] -top-48 left-1/2 -translate-x-1/2 rounded-full opacity-25 blur-3xl pointer-events-none" style={{ backgroundColor: accent }} />
          )}
          {templateKey === "neon_creative" && (
            <>
              <div className="absolute w-[500px] h-[500px] -top-32 -left-24 rounded-full opacity-30 blur-3xl pointer-events-none" style={{ backgroundColor: accent }} />
              <div className="absolute w-[400px] h-[400px] -bottom-24 -right-16 rounded-full opacity-25 blur-3xl pointer-events-none" style={{ backgroundColor: "#a855f7" }} />
            </>
          )}
          {templateKey === "clean_premium" && (
            <div className="absolute w-[420px] h-[420px] -top-24 -right-24 rounded-full opacity-15 blur-3xl pointer-events-none" style={{ backgroundColor: accent }} />
          )}
        </>
      )}
    </>
  );
}

/**
 * Bottom-right A3 Visual lockup with a "matching background cut out of the
 * header" effect. The lockup sits in a notch carved out of the header by
 * rendering a panel that uses the page background color, with a rounded
 * inner top-left corner to suggest a continuous cut.
 */
function HeaderA3Lockup({ branding, lightUrl, darkUrl }: { branding: ResolvedBranding; lightUrl: string | null; darkUrl: string | null }) {
  const useLight = branding.headerTheme === "dark";
  const logoSrc = useLight ? lightUrl : darkUrl;
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = !!logoSrc && !imgFailed;
  const pageBg = branding.background;
  return (
    <div className="absolute bottom-0 right-0 z-20 pointer-events-none" aria-label="In partnership with A3 Visual">
      <div
        className="relative pl-2.5 pt-2 pr-2.5 pb-2 sm:pl-4 sm:pt-3 sm:pr-4 sm:pb-3 rounded-tl-2xl pointer-events-auto"
        style={{
          backgroundColor: pageBg,
          boxShadow: `inset 0 0 0 1px ${branding.isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)"}`,
        }}
      >
        <a
          href="https://www.a3visual.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 group"
          title="In partnership with A3 Visual"
        >
          <span className="text-[9px] uppercase tracking-[0.18em] font-semibold opacity-70" style={{ color: branding.text }}>
            In partnership with
          </span>
          {showImage ? (
            <img
              src={logoSrc!}
              alt="A3 Visual"
              className="h-6 w-auto object-contain"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <span className="font-bold text-sm" style={{ color: branding.primary }}>A3 Visual</span>
          )}
        </a>
      </div>
    </div>
  );
}

function HeaderHeading({
  branding, headline, subheadline, eyebrow, textColor, mutedColor, align,
}: {
  branding: ResolvedBranding;
  headline: string;
  subheadline: string;
  eyebrow: string;
  textColor: string;
  mutedColor: string;
  align: "left" | "center" | "right";
}) {
  const alignClass = align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center";
  return (
    <div className={`${alignClass} space-y-3 portal-anim-fade-up`}>
      {eyebrow && (
        <div
          className="inline-block text-[11px] uppercase tracking-[0.22em] font-bold px-3 py-1.5 rounded-full"
          style={{
            color: branding.accent,
            backgroundColor: branding.headerTheme === "dark" ? "rgba(255,255,255,0.08)" : `${branding.accent}14`,
            border: `1px solid ${branding.accent}33`,
          }}
        >
          {eyebrow}
        </div>
      )}
      <h1
        className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]"
        style={{ color: textColor, fontFamily: branding.headingFont, textShadow: branding.headerTheme === "dark" ? "0 2px 24px rgba(0,0,0,0.35)" : "none" }}
      >
        {headline}
      </h1>
      {subheadline && (
        <p className="text-base sm:text-lg max-w-2xl leading-relaxed" style={{ color: mutedColor }}>
          {subheadline}
        </p>
      )}
    </div>
  );
}

function HeaderCtas({ branding, ctaSlot }: { branding: ResolvedBranding; ctaSlot?: React.ReactNode }) {
  if (ctaSlot) return <div className="flex flex-wrap gap-3">{ctaSlot}</div>;
  const { ctaLabel, ctaUrl, secondaryCtaLabel, secondaryCtaUrl, button, buttonText, accent, buttonStyle } = branding;
  if (!ctaLabel && !secondaryCtaLabel) return null;

  const primaryStyle: React.CSSProperties = (() => {
    if (buttonStyle === "festival") {
      return {
        background: `linear-gradient(135deg, ${accent} 0%, ${button} 100%)`,
        color: buttonText,
        border: "none",
        boxShadow: `0 8px 24px ${accent}55, inset 0 1px 0 rgba(255,255,255,0.2)`,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      };
    }
    if (buttonStyle === "glow") {
      return {
        background: `linear-gradient(135deg, ${button}, ${accent})`,
        color: buttonText,
        border: "none",
        boxShadow: `0 0 24px ${accent}66, 0 6px 20px ${accent}44`,
      };
    }
    return { backgroundColor: button, color: buttonText, border: "none" };
  })();

  return (
    <div className="flex flex-wrap gap-3">
      {ctaLabel && (
        <a
          href={safeUrl(ctaUrl) || "#"}
          className="inline-flex items-center justify-center px-6 py-3 rounded-lg font-semibold text-sm shadow-md transition-transform hover:scale-[1.03] active:scale-[0.98]"
          style={primaryStyle}
        >
          {ctaLabel}
        </a>
      )}
      {secondaryCtaLabel && (
        <a
          href={safeUrl(secondaryCtaUrl) || "#"}
          className="inline-flex items-center justify-center px-6 py-3 rounded-lg font-semibold text-sm border-2 transition-colors backdrop-blur-sm"
          style={{
            borderColor: accent,
            color: accent,
            backgroundColor: branding.headerTheme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.6)",
          }}
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
  const align = branding.headerAlignment;
  const mainLogo = branding.mainLogoUrl || partnerLogoUrl || branding.logoUrl;
  const showLogo = !!mainLogo;
  const displayMode = branding.mainLogoDisplayMode;

  const padTop = `${branding.headerPaddingTop}px`;
  const padBottom = `${branding.headerPaddingBottom}px`;

  // FULL HEADER BANNER MODE — large branded logo banner sits as the dominant
  // header treatment. Best for events, festivals, hospitality, venues.
  if (displayMode === "full_header_banner" && showLogo) {
    const justify = align === "left" ? "justify-start" : align === "right" ? "justify-end" : "justify-center";
    return (
      <header className="relative overflow-hidden" data-header-theme={branding.headerTheme}>
        <HeaderBackground branding={branding} />
        <div className="relative pr-0 sm:pr-[200px]" style={{ paddingTop: padTop, paddingBottom: padBottom }}>
          <div className="max-w-6xl mx-auto px-4 sm:px-8 relative z-10">
            <div className={`flex ${justify} portal-anim-fade-up`}>
              <img
                src={mainLogo}
                alt={branding.logoAltText || `${partnerName} logo`}
                style={{
                  maxHeight: `${branding.headerLogoMaxHeight * 1.6}px`,
                  width: `${branding.headerLogoWidthPercent}%`,
                  maxWidth: "100%",
                  objectFit: branding.headerObjectFit,
                  filter: headerIsDark ? "drop-shadow(0 6px 24px rgba(0,0,0,0.4))" : "drop-shadow(0 4px 16px rgba(0,0,0,0.12))",
                }}
              />
            </div>
            {(headline || eyebrow || subheadline) && (
              <div className={`mt-8 max-w-3xl ${align === "center" ? "mx-auto" : align === "right" ? "ml-auto" : ""}`}>
                <HeaderHeading branding={branding} headline={headline} subheadline={subheadline} eyebrow={eyebrow} textColor={textColor} mutedColor={mutedColor} align={align} />
                <div className={`flex ${align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start"} pt-6`}>
                  <HeaderCtas branding={branding} ctaSlot={ctaSlot} />
                </div>
              </div>
            )}
          </div>
        </div>
        <HeaderA3Lockup branding={branding} lightUrl={a3LightUrl} darkUrl={a3DarkUrl} />
      </header>
    );
  }

  // HERO OVERLAY LOGO MODE — logo sits over the hero image with text below.
  if (displayMode === "hero_overlay_logo" && showLogo) {
    return (
      <header className="relative overflow-hidden" data-header-theme={branding.headerTheme}>
        <HeaderBackground branding={branding} />
        <div className="relative pr-0 sm:pr-[200px]" style={{ paddingTop: padTop, paddingBottom: padBottom }}>
          <div className="max-w-4xl mx-auto px-4 sm:px-8 text-center space-y-6 relative z-10 portal-anim-fade-up">
            <div className="inline-block p-6 rounded-2xl backdrop-blur-md" style={{ backgroundColor: headerIsDark ? "rgba(0,0,0,0.32)" : "rgba(255,255,255,0.5)", border: `1px solid ${headerIsDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.08)"}` }}>
              <img
                src={mainLogo}
                alt={branding.logoAltText || `${partnerName} logo`}
                style={{ maxHeight: `${branding.headerLogoMaxHeight}px`, objectFit: branding.headerObjectFit }}
              />
            </div>
            <HeaderHeading branding={branding} headline={headline} subheadline={subheadline} eyebrow={eyebrow} textColor={textColor} mutedColor={mutedColor} align="center" />
            <div className="flex justify-center pt-2"><HeaderCtas branding={branding} ctaSlot={ctaSlot} /></div>
          </div>
        </div>
        <HeaderA3Lockup branding={branding} lightUrl={a3LightUrl} darkUrl={a3DarkUrl} />
      </header>
    );
  }

  // CONTAINED LOGO MODE — original 5 layouts (preserves prior behavior).
  let body: React.ReactNode;
  if (layout === "centered_logo_hero") {
    body = (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 relative z-10" style={{ paddingTop: padTop, paddingBottom: padBottom }}>
        <div className="flex flex-col items-center gap-6 portal-anim-fade-up">
          {showLogo && (
            <PartnerLogo src={mainLogo} name={partnerName} size={branding.headerLogoMaxHeight} variant={headerIsDark ? "onDark" : "default"} />
          )}
          <HeaderHeading branding={branding} headline={headline} subheadline={subheadline} eyebrow={eyebrow} textColor={textColor} mutedColor={mutedColor} align="center" />
          <div className="pt-2"><HeaderCtas branding={branding} ctaSlot={ctaSlot} /></div>
        </div>
      </div>
    );
  } else if (layout === "event_microsite") {
    body = (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 relative z-10" style={{ paddingTop: padTop, paddingBottom: padBottom }}>
        <div className="grid sm:grid-cols-12 gap-8 items-end portal-anim-fade-up">
          <div className="sm:col-span-7 space-y-5">
            <HeaderHeading branding={branding} headline={headline} subheadline={subheadline} eyebrow={eyebrow} textColor={textColor} mutedColor={mutedColor} align="left" />
            <HeaderCtas branding={branding} ctaSlot={ctaSlot} />
          </div>
          {showLogo && (
            <div className="sm:col-span-5 flex justify-end">
              <PartnerLogo src={mainLogo} name={partnerName} size={Math.max(96, branding.headerLogoMaxHeight)} variant={headerIsDark ? "onDark" : "default"} />
            </div>
          )}
        </div>
      </div>
    );
  } else if (layout === "minimal") {
    body = (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 relative z-10">
        <div className="flex flex-wrap items-center justify-between gap-4 portal-anim-fade-up">
          <div className="flex items-center gap-4">
            {showLogo && <PartnerLogo src={mainLogo} name={partnerName} size={48} variant={headerIsDark ? "onDark" : "default"} />}
            <div>
              <h1 className="text-xl sm:text-2xl font-bold leading-tight" style={{ color: textColor, fontFamily: branding.headingFont }}>{headline}</h1>
              {subheadline && <p className="text-xs sm:text-sm" style={{ color: mutedColor }}>{subheadline}</p>}
            </div>
          </div>
          <HeaderCtas branding={branding} ctaSlot={ctaSlot} />
        </div>
      </div>
    );
  } else if (layout === "split_image") {
    body = (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 relative z-10" style={{ paddingTop: padTop, paddingBottom: padBottom }}>
        <div className="grid sm:grid-cols-2 gap-8 sm:gap-12 items-center portal-anim-fade-up">
          <div>
            <HeaderHeading branding={branding} headline={headline} subheadline={subheadline} eyebrow={eyebrow} textColor={textColor} mutedColor={mutedColor} align="left" />
            <div className="pt-6"><HeaderCtas branding={branding} ctaSlot={ctaSlot} /></div>
          </div>
          <div className="hidden sm:flex items-center justify-center">
            {showLogo && (
              <div className="rounded-2xl p-8 backdrop-blur-md" style={{ backgroundColor: headerIsDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.04)", border: `1px solid ${headerIsDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.08)"}` }}>
                <PartnerLogo src={mainLogo} name={partnerName} size={Math.max(120, branding.headerLogoMaxHeight)} variant={headerIsDark ? "onDark" : "default"} />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  } else {
    // full_width_hero (default)
    body = (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 relative z-10" style={{ paddingTop: padTop, paddingBottom: padBottom }}>
        <div className="text-center space-y-5 portal-anim-fade-up">
          {showLogo && (branding.logoPlacement === "hero_center" || branding.logoPlacement === "navbar_and_hero") && (
            <div className="flex justify-center mb-4">
              <PartnerLogo src={mainLogo} name={partnerName} size={branding.headerLogoMaxHeight} variant={headerIsDark ? "onDark" : "default"} />
            </div>
          )}
          <HeaderHeading branding={branding} headline={headline} subheadline={subheadline} eyebrow={eyebrow} textColor={textColor} mutedColor={mutedColor} align="center" />
          <div className="flex justify-center pt-2"><HeaderCtas branding={branding} ctaSlot={ctaSlot} /></div>
        </div>
      </div>
    );
  }

  return (
    <header className="relative overflow-hidden" data-header-theme={branding.headerTheme}>
      <HeaderBackground branding={branding} />
      <div className="relative pr-0 sm:pr-[200px]">{body}</div>
      <HeaderA3Lockup branding={branding} lightUrl={a3LightUrl} darkUrl={a3DarkUrl} />
    </header>
  );
}
