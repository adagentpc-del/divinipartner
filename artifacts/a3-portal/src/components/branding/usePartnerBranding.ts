import { useMemo } from "react";
import { TEMPLATE_DEFAULTS, BORDER_RADIUS_MAP, isDarkTemplate, type TemplateKey } from "./templateDefaults";

export interface PartnerThemeShape {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  backgroundColor?: string | null;
  buttonColor?: string | null;
  textColor?: string | null;
  headingFont?: string | null;
  bodyFont?: string | null;
  borderRadius?: string | null;
  templateKey?: string | null;
  borderRadiusStyle?: string | null;
  buttonStyle?: string | null;
  cardStyle?: string | null;
  heroBackgroundMode?: string | null;
  heroOverlayIntensity?: number | null;
  heroEyebrow?: string | null;
  heroHeadline?: string | null;
  heroSubheadline?: string | null;
  heroBackgroundStorageKey?: string | null;
  logoPlacement?: string | null;
  logoBackgroundTreatment?: string | null;
  logoUrl?: string | null;
  logoAltText?: string | null;
  ctaLabel?: string | null;
  secondaryCtaLabel?: string | null;
  showPoweredByA3?: boolean | null;
  customWelcomeMessage?: string | null;
  isPublished?: boolean | null;
}

export interface ResolvedBranding {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  button: string;
  buttonText: string;
  text: string;
  muted: string;
  headingFont: string;
  bodyFont: string;
  radius: string;
  templateKey: TemplateKey;
  buttonStyle: string;
  cardStyle: string;
  borderRadiusStyle: string;
  heroBackgroundMode: string;
  heroOverlayIntensity: number;
  heroEyebrow: string;
  heroHeadline: string;
  heroSubheadline: string;
  heroBackgroundStorageKey: string;
  logoPlacement: string;
  logoBackgroundTreatment: string;
  logoUrl: string;
  logoAltText: string;
  ctaLabel: string;
  secondaryCtaLabel: string;
  showPoweredByA3: boolean;
  customWelcomeMessage: string;
  isDark: boolean;
  shellStyle: React.CSSProperties;
}

export const FALLBACK_BRANDING: Omit<ResolvedBranding, "shellStyle"> = {
  primary: "#111827",
  secondary: "#1e293b",
  accent: "#2563eb",
  background: "#f8fafc",
  button: "#111827",
  buttonText: "#ffffff",
  text: "#111827",
  muted: "#64748b",
  headingFont: "Inter, system-ui, sans-serif",
  bodyFont: "Inter, system-ui, sans-serif",
  radius: "0.5rem",
  templateKey: "clean_premium",
  buttonStyle: "solid",
  cardStyle: "elevated",
  borderRadiusStyle: "soft",
  heroBackgroundMode: "gradient",
  heroOverlayIntensity: 0.45,
  heroEyebrow: "",
  heroHeadline: "",
  heroSubheadline: "",
  heroBackgroundStorageKey: "",
  logoPlacement: "navbar_left",
  logoBackgroundTreatment: "none",
  logoUrl: "",
  logoAltText: "",
  ctaLabel: "",
  secondaryCtaLabel: "",
  showPoweredByA3: true,
  customWelcomeMessage: "",
  isDark: false,
};

export function readableOn(hex: string | null | undefined, fallback = "#ffffff"): string {
  if (!hex || !/^#?[0-9a-f]{6}$/i.test(hex.replace("#", ""))) return fallback;
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#0f172a" : "#ffffff";
}

export function resolveBranding(theme?: PartnerThemeShape | null): ResolvedBranding {
  const templateKey = (theme?.templateKey as TemplateKey) || "clean_premium";
  const tpl = TEMPLATE_DEFAULTS[templateKey] || TEMPLATE_DEFAULTS.clean_premium;

  const primary = theme?.primaryColor || tpl.primaryColor;
  const button = theme?.buttonColor || tpl.buttonColor;
  const borderRadiusStyle = theme?.borderRadiusStyle || tpl.borderRadiusStyle;
  const radius = BORDER_RADIUS_MAP[borderRadiusStyle] || theme?.borderRadius || "0.5rem";

  const resolved: Omit<ResolvedBranding, "shellStyle"> = {
    primary,
    secondary: theme?.secondaryColor || tpl.secondaryColor,
    accent: theme?.accentColor || tpl.accentColor,
    background: theme?.backgroundColor || tpl.backgroundColor,
    button,
    buttonText: readableOn(button),
    text: theme?.textColor || tpl.textColor,
    muted: isDarkTemplate(templateKey) ? "rgba(255,255,255,0.5)" : "#64748b",
    headingFont: theme?.headingFont || tpl.headingFont,
    bodyFont: theme?.bodyFont || tpl.bodyFont,
    radius,
    templateKey,
    buttonStyle: theme?.buttonStyle || tpl.buttonStyle,
    cardStyle: theme?.cardStyle || tpl.cardStyle,
    borderRadiusStyle,
    heroBackgroundMode: theme?.heroBackgroundMode || tpl.heroBackgroundMode,
    heroOverlayIntensity: theme?.heroOverlayIntensity ?? tpl.heroOverlayIntensity,
    heroEyebrow: theme?.heroEyebrow || "",
    heroHeadline: theme?.heroHeadline || "",
    heroSubheadline: theme?.heroSubheadline || "",
    heroBackgroundStorageKey: theme?.heroBackgroundStorageKey || "",
    logoPlacement: theme?.logoPlacement || "navbar_left",
    logoBackgroundTreatment: theme?.logoBackgroundTreatment || "none",
    logoUrl: theme?.logoUrl || "",
    logoAltText: theme?.logoAltText || "",
    ctaLabel: theme?.ctaLabel || "",
    secondaryCtaLabel: theme?.secondaryCtaLabel || "",
    showPoweredByA3: theme?.showPoweredByA3 ?? true,
    customWelcomeMessage: theme?.customWelcomeMessage || "",
    isDark: isDarkTemplate(templateKey),
  };

  const shellStyle: React.CSSProperties = {
    // @ts-ignore — CSS custom properties.
    "--brand-primary": resolved.primary,
    "--brand-secondary": resolved.secondary,
    "--brand-accent": resolved.accent,
    "--brand-background": resolved.background,
    "--brand-button": resolved.button,
    "--brand-button-text": resolved.buttonText,
    "--brand-text": resolved.text,
    "--brand-muted": resolved.muted,
    "--brand-radius": resolved.radius,
    backgroundColor: resolved.background,
    color: resolved.text,
    fontFamily: resolved.bodyFont,
  };
  return { ...resolved, shellStyle };
}

export function usePartnerBranding(theme?: PartnerThemeShape | null): ResolvedBranding {
  return useMemo(() => resolveBranding(theme), [theme]);
}
