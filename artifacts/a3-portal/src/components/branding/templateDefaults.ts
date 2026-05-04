export type TemplateKey = "luxe_dark" | "neon_creative" | "clean_premium";

export interface TemplateDefaults {
  key: TemplateKey;
  label: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  buttonColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  buttonStyle: string;
  borderRadiusStyle: string;
  cardStyle: string;
  heroBackgroundMode: string;
  heroOverlayIntensity: number;
}

export const TEMPLATE_DEFAULTS: Record<TemplateKey, TemplateDefaults> = {
  luxe_dark: {
    key: "luxe_dark",
    label: "Luxe Dark",
    description: "Premium dark theme with glass cards, subtle glow accents, and elegant typography. Perfect for luxury events, VIP services, and hospitality.",
    primaryColor: "#0c0e1a",
    secondaryColor: "#1a1d2e",
    accentColor: "#c9a96e",
    backgroundColor: "#0c0e1a",
    buttonColor: "#c9a96e",
    textColor: "#f0ece4",
    headingFont: "Playfair Display",
    bodyFont: "Inter",
    buttonStyle: "solid",
    borderRadiusStyle: "soft",
    cardStyle: "glass",
    heroBackgroundMode: "gradient",
    heroOverlayIntensity: 0.6,
  },
  neon_creative: {
    key: "neon_creative",
    label: "Neon Creative",
    description: "Bold dark theme with vibrant neon gradients, energetic accents, and creative agency feel. Great for experiential agencies and media brands.",
    primaryColor: "#0a0a14",
    secondaryColor: "#12121f",
    accentColor: "#00d4ff",
    backgroundColor: "#0a0a14",
    buttonColor: "#a855f7",
    textColor: "#e8e8f0",
    headingFont: "Space Grotesk",
    bodyFont: "Inter",
    buttonStyle: "gradient",
    borderRadiusStyle: "rounded",
    cardStyle: "glass",
    heroBackgroundMode: "gradient",
    heroOverlayIntensity: 0.5,
  },
  clean_premium: {
    key: "clean_premium",
    label: "Clean Premium",
    description: "Light, polished theme with refined shadows, clean cards, and maximum readability. Ideal for corporate clients and professional services.",
    primaryColor: "#111827",
    secondaryColor: "#1e293b",
    accentColor: "#2563eb",
    backgroundColor: "#f8fafc",
    buttonColor: "#111827",
    textColor: "#111827",
    headingFont: "Inter",
    bodyFont: "Inter",
    buttonStyle: "solid",
    borderRadiusStyle: "soft",
    cardStyle: "elevated",
    heroBackgroundMode: "gradient",
    heroOverlayIntensity: 0.45,
  },
};

export const TEMPLATE_KEYS = Object.keys(TEMPLATE_DEFAULTS) as TemplateKey[];

export function getTemplateDefaults(key: string): TemplateDefaults {
  return TEMPLATE_DEFAULTS[key as TemplateKey] || TEMPLATE_DEFAULTS.clean_premium;
}

export const BORDER_RADIUS_MAP: Record<string, string> = {
  sharp: "0",
  soft: "0.5rem",
  rounded: "0.75rem",
  pill: "9999px",
};

export const CARD_STYLE_MAP: Record<string, { bg: string; border: string; shadow: string; backdrop: string }> = {
  glass: {
    bg: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    shadow: "0 8px 32px rgba(0,0,0,0.12)",
    backdrop: "blur(12px)",
  },
  solid: {
    bg: "var(--brand-secondary, #1e293b)",
    border: "1px solid rgba(255,255,255,0.05)",
    shadow: "0 4px 16px rgba(0,0,0,0.1)",
    backdrop: "none",
  },
  outlined: {
    bg: "transparent",
    border: "1px solid rgba(255,255,255,0.15)",
    shadow: "none",
    backdrop: "none",
  },
  elevated: {
    bg: "#ffffff",
    border: "1px solid rgba(0,0,0,0.06)",
    shadow: "0 4px 24px rgba(0,0,0,0.08)",
    backdrop: "none",
  },
};

export const BUTTON_STYLE_MAP: Record<string, (color: string, accent?: string) => React.CSSProperties> = {
  solid: (color) => ({
    backgroundColor: color,
    border: "none",
  }),
  gradient: (color, accent) => ({
    background: `linear-gradient(135deg, ${color}, ${accent || color})`,
    border: "none",
  }),
  outline: (color) => ({
    backgroundColor: "transparent",
    border: `2px solid ${color}`,
    color: color,
  }),
  glass: (color) => ({
    backgroundColor: `${color}22`,
    border: `1px solid ${color}44`,
    backdropFilter: "blur(8px)",
  }),
};

export function isDarkTemplate(templateKey: string): boolean {
  return templateKey === "luxe_dark" || templateKey === "neon_creative";
}
