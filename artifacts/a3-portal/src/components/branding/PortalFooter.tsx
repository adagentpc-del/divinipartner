import { useEffect, useState } from "react";
import type { ResolvedBranding } from "./usePartnerBranding";
import { fetchPublicConfig } from "@/lib/publicUrl";

interface PortalFooterProps {
  partnerName: string;
  branding: ResolvedBranding;
}

/**
 * Public partner portal footer. The "A3 Visual partnership" lockup is REQUIRED
 * on every public page (see Branded Portal Header spec) — the previous
 * `showPoweredByA3` toggle is honored only as a label-style hint and the
 * partnership badge always renders.
 */
export function PortalFooter({ partnerName, branding }: PortalFooterProps) {
  const [a3LightUrl, setA3LightUrl] = useState<string | null>(null);
  const [a3DarkUrl, setA3DarkUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchPublicConfig()
      .then((cfg) => {
        setA3LightUrl(cfg.a3LockupLogoLightUrl || null);
        setA3DarkUrl(cfg.a3LockupLogoDarkUrl || null);
      })
      .catch(() => { /* silent — falls back to text lockup */ });
  }, []);

  const borderColor = branding.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const mutedColor = branding.muted;
  const useLight = branding.isDark;
  const logoSrc = useLight ? a3LightUrl : a3DarkUrl;

  return (
    <footer className="py-8 mt-auto" style={{ borderTop: `1px solid ${borderColor}` }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs" style={{ color: mutedColor }}>
          <span>&copy; {new Date().getFullYear()} {partnerName}</span>
          <div className="flex items-center gap-2.5" title="A3 Visual partnership">
            <span className="text-[10px] uppercase tracking-[0.18em]" style={{ color: mutedColor }}>
              In partnership with
            </span>
            {logoSrc ? (
              <img src={logoSrc} alt="A3 Visual" className="h-5 w-auto object-contain" />
            ) : (
              <div className="flex items-center gap-1.5">
                <div
                  className="h-4 w-4 rounded flex items-center justify-center text-[8px] font-bold leading-none"
                  style={{ backgroundColor: branding.accent, color: branding.isDark ? "#fff" : branding.primary }}
                >
                  A3
                </div>
                <span className="font-semibold" style={{ color: branding.isDark ? "#fff" : branding.primary }}>A3 Visual</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
