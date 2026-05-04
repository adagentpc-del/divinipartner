import type { ResolvedBranding } from "./usePartnerBranding";
import { CARD_STYLE_MAP, BORDER_RADIUS_MAP } from "./templateDefaults";
import type { LucideIcon } from "lucide-react";

interface PortalCardProps {
  branding: ResolvedBranding;
  icon?: LucideIcon;
  title: string;
  description?: string;
  cta?: string;
  onClick?: () => void;
  children?: React.ReactNode;
  className?: string;
}

export function PortalCard({
  branding,
  icon: Icon,
  title,
  description,
  cta,
  onClick,
  children,
  className = "",
}: PortalCardProps) {
  const styles = CARD_STYLE_MAP[branding.cardStyle] || CARD_STYLE_MAP.elevated;
  const radius = BORDER_RADIUS_MAP[branding.borderRadiusStyle] || branding.radius;
  const isDark = branding.isDark;

  const cardBg = isDark ? styles.bg : (branding.cardStyle === "glass" ? "rgba(255,255,255,0.7)" : styles.bg);

  return (
    <div
      className={`group relative transition-all duration-300 hover:-translate-y-1 ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={{
        backgroundColor: cardBg,
        border: isDark ? styles.border : (branding.cardStyle === "outlined" ? `1px solid ${branding.primary}20` : styles.border),
        borderRadius: radius,
        boxShadow: styles.shadow,
        backdropFilter: styles.backdrop,
        overflow: "hidden",
      }}
      onClick={onClick}
    >
      <div className="p-6">
        {Icon && (
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
            style={{
              backgroundColor: isDark ? `${branding.accent}20` : `${branding.accent}10`,
            }}
          >
            <Icon className="h-5 w-5" style={{ color: branding.accent }} />
          </div>
        )}

        <h3
          className="font-semibold text-base mb-1.5"
          style={{ color: isDark ? "#ffffff" : branding.text, fontFamily: branding.headingFont }}
        >
          {title}
        </h3>

        {description && (
          <p className="text-sm leading-relaxed mb-4" style={{ color: branding.muted }}>
            {description}
          </p>
        )}

        {children}

        {cta && (
          <span
            className="inline-flex items-center gap-1.5 text-sm font-medium mt-2 transition-all group-hover:gap-2.5"
            style={{ color: branding.accent }}
          >
            {cta}
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </span>
        )}
      </div>

      {branding.templateKey === "neon_creative" && (
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${branding.accent}08 0%, transparent 70%)`,
          }}
        />
      )}
    </div>
  );
}
