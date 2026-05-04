import type { ResolvedBranding } from "./usePartnerBranding";

interface PortalFooterProps {
  partnerName: string;
  branding: ResolvedBranding;
}

export function PortalFooter({ partnerName, branding }: PortalFooterProps) {
  const borderColor = branding.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const mutedColor = branding.muted;

  return (
    <footer
      className="py-8 mt-auto"
      style={{ borderTop: `1px solid ${borderColor}` }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs" style={{ color: mutedColor }}>
          <span>&copy; {new Date().getFullYear()} {partnerName}</span>
          {branding.showPoweredByA3 && (
            <div className="flex items-center gap-1.5">
              <span>Powered by</span>
              <div
                className="h-4 w-4 rounded flex items-center justify-center text-[8px] font-bold leading-none"
                style={{ backgroundColor: branding.accent, color: branding.isDark ? "#fff" : branding.primary }}
              >
                A3
              </div>
              <span className="font-medium">A3 Visual</span>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
