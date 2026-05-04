import type { ResolvedBranding } from "./usePartnerBranding";
import { readableOn } from "./usePartnerBranding";
import { BORDER_RADIUS_MAP } from "./templateDefaults";

interface PortalCTAProps {
  branding: ResolvedBranding;
  label?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  children?: React.ReactNode;
}

export function PortalCTA({
  branding,
  label,
  onClick,
  variant = "primary",
  size = "md",
  className = "",
  disabled = false,
  type = "button",
  children,
}: PortalCTAProps) {
  const radius = BORDER_RADIUS_MAP[branding.borderRadiusStyle] || branding.radius;
  const sizeClasses = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-2.5 text-sm",
    lg: "px-8 py-3 text-base",
  };

  const getStyle = (): React.CSSProperties => {
    if (variant === "outline") {
      return {
        backgroundColor: "transparent",
        border: `2px solid ${branding.isDark ? "rgba(255,255,255,0.2)" : branding.primary + "30"}`,
        color: branding.isDark ? "#fff" : branding.primary,
        borderRadius: radius,
      };
    }

    if (variant === "secondary") {
      return {
        backgroundColor: branding.isDark ? "rgba(255,255,255,0.08)" : `${branding.primary}08`,
        border: `1px solid ${branding.isDark ? "rgba(255,255,255,0.1)" : branding.primary + "15"}`,
        color: branding.isDark ? "#fff" : branding.primary,
        borderRadius: radius,
      };
    }

    if (branding.buttonStyle === "gradient") {
      return {
        background: `linear-gradient(135deg, ${branding.button}, ${branding.accent})`,
        color: readableOn(branding.button),
        border: "none",
        borderRadius: radius,
      };
    }

    if (branding.buttonStyle === "glass") {
      return {
        backgroundColor: `${branding.button}33`,
        backdropFilter: "blur(8px)",
        border: `1px solid ${branding.button}55`,
        color: branding.isDark ? "#fff" : branding.button,
        borderRadius: radius,
      };
    }

    return {
      backgroundColor: branding.button,
      color: branding.buttonText,
      border: "none",
      borderRadius: radius,
    };
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`font-semibold transition-all duration-200 hover:opacity-90 hover:shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses[size]} ${className}`}
      style={getStyle()}
    >
      {children || label}
    </button>
  );
}
