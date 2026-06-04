import { useMemo, useState } from "react";
import { PlayCircle } from "lucide-react";
import { PartnerWalkthrough } from "./PartnerWalkthrough";
import { generatePortalWalkthroughScript, type WalkthroughInput } from "@/lib/walkthrough";
import type { ResolvedBranding } from "./usePartnerBranding";

interface WalkthroughLauncherProps {
  /** Partner public projection (carries walkthrough override fields). */
  partner: {
    companyName: string;
    introHeadline?: string | null;
    introText?: string | null;
    thankYouText?: string | null;
    partnerType?: string | null;
    pricingDisplayEnabled?: boolean | null;
    walkthroughEnabled?: boolean | null;
    walkthroughVideoUrl?: string | null;
    walkthroughVideoPosterUrl?: string | null;
    walkthroughVideoStatus?: string | null;
  } | null | undefined;
  branding: ResolvedBranding;
  /** "ordering" | "intake"/"branding" — drives the script branches. */
  portalMode?: string;
  /** Extra live data for richer slides (optional). */
  productCategories?: string[];
  productCount?: number;
  packageNames?: string[];
  cityNames?: string[];
  brandingLocationNames?: string[];
  /** Render style: prominent hero button vs. subtle inline link. */
  variant?: "button" | "link";
  label?: string;
  className?: string;
}

/**
 * Self-contained "Watch Walkthrough" entry point. Builds the deterministic
 * script from live portal data, then opens a full-screen branded modal. When
 * a custom walkthrough video is marked ready, the modal plays it instead of
 * the interactive slides. Renders nothing when the partner has disabled the
 * walkthrough.
 */
export function WalkthroughLauncher({
  partner,
  branding,
  portalMode,
  productCategories,
  productCount,
  packageNames,
  cityNames,
  brandingLocationNames,
  variant = "button",
  label = "Watch Walkthrough",
  className = "",
}: WalkthroughLauncherProps) {
  const [open, setOpen] = useState(false);

  const script = useMemo(() => {
    if (!partner) return null;
    const input: WalkthroughInput = {
      companyName: partner.companyName,
      introHeadline: partner.introHeadline,
      introText: partner.introText,
      thankYouText: partner.thankYouText,
      portalMode,
      partnerType: partner.partnerType,
      pricingDisplayEnabled: partner.pricingDisplayEnabled,
      productCategories,
      productCount,
      packageNames,
      cityNames,
      brandingLocationNames,
    };
    return generatePortalWalkthroughScript(input);
  }, [
    partner,
    portalMode,
    productCategories,
    productCount,
    packageNames,
    cityNames,
    brandingLocationNames,
  ]);

  // Hidden when explicitly disabled. Defaults to shown when the flag is unset.
  if (!partner || partner.walkthroughEnabled === false || !script) return null;

  const accent = branding.button;
  const accentText = branding.buttonText;

  return (
    <>
      {variant === "button" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="button-watch-walkthrough"
          className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold uppercase tracking-[0.06em] shadow-lg transition-transform hover:scale-[1.03] ${className}`}
          style={{ backgroundColor: accent, color: accentText }}
        >
          <PlayCircle className="h-4.5 w-4.5" /> {label}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="link-watch-walkthrough"
          className={`inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-2 hover:underline ${className}`}
          style={{ color: branding.isDark ? branding.accent : branding.primary }}
        >
          <PlayCircle className="h-4 w-4" /> {label}
        </button>
      )}

      <PartnerWalkthrough
        open={open}
        onClose={() => setOpen(false)}
        script={script}
        branding={branding}
        videoUrl={partner.walkthroughVideoUrl}
        videoPosterUrl={partner.walkthroughVideoPosterUrl}
        videoStatus={partner.walkthroughVideoStatus}
      />
    </>
  );
}
