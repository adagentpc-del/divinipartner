import { Package } from "lucide-react";
import type { ResolvedBranding } from "./usePartnerBranding";

interface BrandedPlaceholderImageProps {
  branding: ResolvedBranding;
  label?: string;
  className?: string;
}

/**
 * Premium branded fallback used wherever a package/product image is missing.
 * Renders a theme-gradient panel with the partner mark instead of an empty
 * gray box, so the portal never shows broken or generic placeholders.
 */
export function BrandedPlaceholderImage({
  branding,
  label = "Vendor package",
  className = "",
}: BrandedPlaceholderImageProps) {
  const logo = branding.mainLogoUrl || branding.logoUrl || branding.secondaryLogoUrl || "";
  return (
    <div
      className={`relative aspect-video w-full overflow-hidden flex flex-col items-center justify-center gap-2 ${className}`}
      style={{
        borderRadius: branding.radius,
        backgroundImage: `linear-gradient(135deg, ${branding.primary} 0%, ${branding.accent}cc 100%)`,
      }}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `radial-gradient(60% 60% at 30% 20%, ${branding.accent}88 0%, transparent 60%)`,
        }}
      />
      {logo ? (
        <img
          src={logo}
          alt=""
          className="relative max-h-[46%] max-w-[62%] object-contain drop-shadow-lg"
        />
      ) : (
        <Package className="relative h-9 w-9 text-white/85" />
      )}
      <span className="relative text-[11px] font-semibold uppercase tracking-[0.16em] text-white/85">
        {label}
      </span>
    </div>
  );
}
