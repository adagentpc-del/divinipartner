import { useParams, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Palette, Check, Eye, Save, Globe, Image, Type, Layout, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { LogoUploader } from "@/components/admin/LogoUploader";
import { TEMPLATE_DEFAULTS, TEMPLATE_KEYS, getTemplateDefaults, BORDER_RADIUS_MAP, type TemplateKey } from "@/components/branding/templateDefaults";
import { resolveBranding } from "@/components/branding/usePartnerBranding";
import { PartnerPortalHeader } from "@/components/branding/PartnerPortalHeader";
import { PortalCard } from "@/components/branding/PortalCard";
import { PortalNavbar } from "@/components/branding/PortalNavbar";
import { PortalFooter } from "@/components/branding/PortalFooter";
import { PortalCTA } from "@/components/branding/PortalCTA";
import { FileText, ShoppingBag, Upload, MessageSquare, Star, Shield } from "lucide-react";

interface ThemeData {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  buttonColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  buttonStyle: string;
  borderRadius: string;
  tonePreset: string;
  themeNotes: string;
  isApproved: string;
  templateKey: string;
  logoUrl: string;
  logoAltText: string;
  logoPlacement: string;
  logoBackgroundTreatment: string;
  heroEyebrow: string;
  heroHeadline: string;
  heroSubheadline: string;
  heroBackgroundMode: string;
  heroBackgroundStorageKey: string;
  heroOverlayIntensity: number;
  cardStyle: string;
  borderRadiusStyle: string;
  ctaLabel: string;
  ctaUrl: string;
  secondaryCtaLabel: string;
  secondaryCtaUrl: string;
  headerTheme: "dark" | "light";
  headerLayoutStyle: "full_width_hero" | "centered_logo_hero" | "event_microsite" | "minimal" | "split_image";
  headerBackgroundVideoUrl: string;
  showPoweredByA3: boolean;
  customWelcomeMessage: string;
  isPublished: boolean;
}

const HEADER_LAYOUT_OPTIONS: { value: ThemeData["headerLayoutStyle"]; label: string; description: string }[] = [
  { value: "full_width_hero", label: "Full-width hero", description: "Centered headline, subheadline, and CTAs over a full-bleed background." },
  { value: "centered_logo_hero", label: "Centered logo hero", description: "Partner logo centered above headline, classic launch page feel." },
  { value: "event_microsite", label: "Event microsite", description: "Left-aligned headline + CTA, designed for single-event landing pages." },
  { value: "minimal", label: "Minimal", description: "Compact bar with logo, title, and CTAs — leaves more room for page content." },
  { value: "split_image", label: "Split image", description: "Headline on the left, partner logo card on the right." },
];

const FONT_OPTIONS = ["Inter", "Poppins", "Playfair Display", "Montserrat", "DM Sans", "Space Grotesk", "Outfit"];

const TEMPLATE_PREVIEWS: Record<string, { gradient: string; accent: string; textColor: string }> = {
  luxe_dark: { gradient: "linear-gradient(135deg, #0c0e1a 0%, #1a1d2e 100%)", accent: "#c9a96e", textColor: "#f0ece4" },
  neon_creative: { gradient: "linear-gradient(135deg, #0a0a14 0%, #12121f 50%, #1a0a2e 100%)", accent: "#00d4ff", textColor: "#e8e8f0" },
  clean_premium: { gradient: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)", accent: "#2563eb", textColor: "#111827" },
};

export default function PartnerThemeEditor() {
  const params = useParams();
  const id = parseInt(params.id || "0");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [partnerName, setPartnerName] = useState("Partner");
  const [partnerLogo, setPartnerLogo] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const [theme, setTheme] = useState<ThemeData>({
    primaryColor: "#111827",
    secondaryColor: "#1e293b",
    accentColor: "#2563eb",
    backgroundColor: "#f8fafc",
    buttonColor: "#111827",
    textColor: "#111827",
    headingFont: "Inter",
    bodyFont: "Inter",
    buttonStyle: "solid",
    borderRadius: "0.5rem",
    tonePreset: "luxury",
    themeNotes: "",
    isApproved: "pending",
    templateKey: "clean_premium",
    logoUrl: "",
    logoAltText: "",
    logoPlacement: "navbar_left",
    logoBackgroundTreatment: "none",
    heroEyebrow: "",
    heroHeadline: "",
    heroSubheadline: "",
    heroBackgroundMode: "gradient",
    heroBackgroundStorageKey: "",
    heroOverlayIntensity: 0.45,
    cardStyle: "elevated",
    borderRadiusStyle: "soft",
    ctaLabel: "",
    ctaUrl: "",
    secondaryCtaLabel: "",
    secondaryCtaUrl: "",
    headerTheme: "dark",
    headerLayoutStyle: "full_width_hero",
    headerBackgroundVideoUrl: "",
    showPoweredByA3: true,
    customWelcomeMessage: "",
    isPublished: false,
  });

  useEffect(() => {
    Promise.all([
      fetch(`/api/partners/${id}/theme`).then(r => r.json()),
      fetch(`/api/partners/${id}`).then(r => r.json()),
    ]).then(([themeData, partnerData]) => {
      if (partnerData) {
        setPartnerName(partnerData.companyName || "Partner");
        setPartnerLogo(partnerData.logoUrl || "");
      }
      if (themeData) {
        setTheme(prev => ({
          ...prev,
          ...Object.fromEntries(Object.entries(themeData).filter(([, v]) => v != null)),
        }));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  const applyTemplate = (key: string) => {
    const tpl = getTemplateDefaults(key);
    setTheme(prev => ({
      ...prev,
      templateKey: key,
      primaryColor: tpl.primaryColor,
      secondaryColor: tpl.secondaryColor,
      accentColor: tpl.accentColor,
      backgroundColor: tpl.backgroundColor,
      buttonColor: tpl.buttonColor,
      textColor: tpl.textColor,
      headingFont: tpl.headingFont,
      bodyFont: tpl.bodyFont,
      buttonStyle: tpl.buttonStyle,
      borderRadiusStyle: tpl.borderRadiusStyle,
      cardStyle: tpl.cardStyle,
      heroBackgroundMode: tpl.heroBackgroundMode,
      heroOverlayIntensity: tpl.heroOverlayIntensity,
    }));
  };

  const handleSave = async (publish = false) => {
    setSaving(true);
    try {
      const body = { ...theme };
      if (publish) body.isPublished = true;
      const res = await fetch(`/api/partners/${id}/theme`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        if (publish) setTheme(prev => ({ ...prev, isPublished: true }));
        toast({ title: publish ? "Theme published" : "Theme saved" });
      } else {
        toast({ title: "Failed to save theme", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to save theme", variant: "destructive" });
    }
    setSaving(false);
  };

  const branding = resolveBranding(theme);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/partners">
          <span className="hover:text-primary transition-colors cursor-pointer flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Partners
          </span>
        </Link>
        <span>/</span>
        <Link href={`/admin/partners/${id}/edit`}>
          <span className="hover:text-primary transition-colors cursor-pointer">Edit</span>
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Portal Design</span>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Palette className="h-6 w-6" /> Portal Design</h1>
        <div className="flex items-center gap-2">
          {theme.isPublished && (
            <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded-lg font-medium flex items-center gap-1">
              <Check className="h-3 w-3" /> Published
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)} className="gap-1.5">
            <Eye className="h-3.5 w-3.5" /> {showPreview ? "Hide Preview" : "Live Preview"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2"><Layout className="h-4 w-4" /> Template</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {TEMPLATE_KEYS.map(key => {
              const tpl = TEMPLATE_DEFAULTS[key];
              const preview = TEMPLATE_PREVIEWS[key];
              const isActive = theme.templateKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyTemplate(key)}
                  className={`relative rounded-xl overflow-hidden text-left transition-all duration-200 ${
                    isActive ? "ring-2 ring-primary ring-offset-2 shadow-lg scale-[1.02]" : "hover:shadow-md hover:scale-[1.01]"
                  }`}
                >
                  <div className="p-5 min-h-[180px] flex flex-col justify-between" style={{ background: preview.gradient }}>
                    <div>
                      <div className="w-8 h-1.5 rounded-full mb-4" style={{ backgroundColor: preview.accent }} />
                      <p className="font-bold text-sm mb-1" style={{ color: preview.textColor }}>{tpl.label}</p>
                      <p className="text-[10px] leading-relaxed opacity-70" style={{ color: preview.textColor }}>{tpl.description.split('.')[0]}.</p>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <div className="h-6 px-3 rounded-md text-[10px] font-semibold flex items-center" style={{ backgroundColor: preview.accent, color: key === "clean_premium" ? "#fff" : "#000" }}>
                        CTA
                      </div>
                      <div className="h-6 px-3 rounded-md text-[10px] font-semibold flex items-center border" style={{ borderColor: `${preview.textColor}30`, color: preview.textColor }}>
                        Card
                      </div>
                    </div>
                  </div>
                  {isActive && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-3.5 w-3.5 text-primary-foreground" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2"><Palette className="h-4 w-4" /> Colors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: "primaryColor", label: "Primary" },
                { key: "secondaryColor", label: "Secondary" },
                { key: "accentColor", label: "Accent" },
                { key: "backgroundColor", label: "Background" },
                { key: "buttonColor", label: "Button" },
                { key: "textColor", label: "Text" },
              ].map(({ key, label }) => (
                <div key={key} className="space-y-1.5">
                  <Label className="text-xs">{label}</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={(theme as any)[key]}
                      onChange={e => setTheme(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-9 h-9 rounded-lg border cursor-pointer shrink-0"
                    />
                    <Input
                      value={(theme as any)[key]}
                      onChange={e => setTheme(prev => ({ ...prev, [key]: e.target.value }))}
                      className="text-xs font-mono h-9"
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2"><Type className="h-4 w-4" /> Typography & Style</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Heading Font</Label>
                <Select value={theme.headingFont} onValueChange={v => setTheme(prev => ({ ...prev, headingFont: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Body Font</Label>
                <Select value={theme.bodyFont} onValueChange={v => setTheme(prev => ({ ...prev, bodyFont: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Button Style</Label>
                <Select value={theme.buttonStyle} onValueChange={v => setTheme(prev => ({ ...prev, buttonStyle: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["solid", "gradient", "outline", "glass"].map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Corner Radius</Label>
                <Select value={theme.borderRadiusStyle} onValueChange={v => setTheme(prev => ({ ...prev, borderRadiusStyle: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["sharp", "soft", "rounded", "pill"].map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Card Style</Label>
                <Select value={theme.cardStyle} onValueChange={v => setTheme(prev => ({ ...prev, cardStyle: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["glass", "solid", "outlined", "elevated"].map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2"><Image className="h-4 w-4" /> Logo & Branding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-6">
            <LogoUploader
              value={theme.logoUrl}
              onChange={v => setTheme(prev => ({ ...prev, logoUrl: v }))}
              label="Theme Logo (overrides partner logo)"
            />
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Logo Placement</Label>
                <Select value={theme.logoPlacement} onValueChange={v => setTheme(prev => ({ ...prev, logoPlacement: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="navbar_left">Navbar Left</SelectItem>
                    <SelectItem value="hero_center">Hero Center</SelectItem>
                    <SelectItem value="navbar_and_hero">Navbar + Hero</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Logo Background</Label>
                <Select value={theme.logoBackgroundTreatment} onValueChange={v => setTheme(prev => ({ ...prev, logoBackgroundTreatment: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="white_pill">White Pill</SelectItem>
                    <SelectItem value="dark_pill">Dark Pill</SelectItem>
                    <SelectItem value="glass_pill">Glass Pill</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Logo Alt Text</Label>
                <Input
                  value={theme.logoAltText}
                  onChange={e => setTheme(prev => ({ ...prev, logoAltText: e.target.value }))}
                  placeholder="Partner company name"
                  className="h-9"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="showPoweredBy"
              checked={theme.showPoweredByA3}
              onChange={e => setTheme(prev => ({ ...prev, showPoweredByA3: e.target.checked }))}
              className="rounded"
            />
            <Label htmlFor="showPoweredBy" className="text-xs cursor-pointer">Show "Powered by A3 Visual" badge</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2"><Layout className="h-4 w-4" /> Partner Portal Branding</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            The branded partner portal header that appears at the top of every public partner page.
            The required A3 Visual partnership lockup is anchored to the lower-right of the header
            (with a matching cut-out) and to every footer.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Header Theme</Label>
              <Select value={theme.headerTheme} onValueChange={v => setTheme(prev => ({ ...prev, headerTheme: v as ThemeData["headerTheme"] }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dark">Dark — light text on a dark/gradient background</SelectItem>
                  <SelectItem value="light">Light — dark text on a light/branded background</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Header Layout Style</Label>
              <Select value={theme.headerLayoutStyle} onValueChange={v => setTheme(prev => ({ ...prev, headerLayoutStyle: v as ThemeData["headerLayoutStyle"] }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HEADER_LAYOUT_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {HEADER_LAYOUT_OPTIONS.find(o => o.value === theme.headerLayoutStyle)?.description}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Header Background Video URL (autoplay, muted, looped)</Label>
            <Input
              value={theme.headerBackgroundVideoUrl}
              onChange={e => setTheme(prev => ({ ...prev, headerBackgroundVideoUrl: e.target.value }))}
              placeholder="https://… .mp4 / .webm — leave blank to use the image or gradient background"
              className="h-9"
            />
            <p className="text-[11px] text-muted-foreground">
              When set, the video plays as the header background and overrides the image / gradient background.
              Use a short, light, looping clip — videos always render muted with no controls.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Primary CTA URL</Label>
              <Input
                value={theme.ctaUrl}
                onChange={e => setTheme(prev => ({ ...prev, ctaUrl: e.target.value }))}
                placeholder="https://… or /portal/start"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Secondary CTA URL</Label>
              <Input
                value={theme.secondaryCtaUrl}
                onChange={e => setTheme(prev => ({ ...prev, secondaryCtaUrl: e.target.value }))}
                placeholder="https://… or anchor"
                className="h-9"
              />
            </div>
          </div>

          <div className="rounded-md border border-dashed p-3 text-[11px] text-muted-foreground bg-muted/30">
            <strong className="text-foreground">A3 Visual lockup is required.</strong>{" "}
            It always appears in the lower-right of the header (with a matching cut-out so it sits
            on the page background) and on every footer. The light and dark logo variants are
            provided by A3 — bundled defaults ship with the portal. To override, set
            <code>A3_LOCKUP_LOGO_LIGHT_URL</code> / <code>A3_LOCKUP_LOGO_DARK_URL</code> env vars.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" /> Header Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Eyebrow Text</Label>
              <Input
                value={theme.heroEyebrow}
                onChange={e => setTheme(prev => ({ ...prev, heroEyebrow: e.target.value }))}
                placeholder="e.g. PREMIUM PARTNER"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Background Mode</Label>
              <Select value={theme.heroBackgroundMode} onValueChange={v => setTheme(prev => ({ ...prev, heroBackgroundMode: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gradient">Gradient</SelectItem>
                  <SelectItem value="solid">Solid</SelectItem>
                  <SelectItem value="image">Image</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Headline</Label>
            <Input
              value={theme.heroHeadline}
              onChange={e => setTheme(prev => ({ ...prev, heroHeadline: e.target.value }))}
              placeholder={`Welcome to ${partnerName}`}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Subheadline</Label>
            <Input
              value={theme.heroSubheadline}
              onChange={e => setTheme(prev => ({ ...prev, heroSubheadline: e.target.value }))}
              placeholder="Your premium event production partner"
              className="h-9"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Primary CTA Label</Label>
              <Input
                value={theme.ctaLabel}
                onChange={e => setTheme(prev => ({ ...prev, ctaLabel: e.target.value }))}
                placeholder="Start a Project"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Secondary CTA Label</Label>
              <Input
                value={theme.secondaryCtaLabel}
                onChange={e => setTheme(prev => ({ ...prev, secondaryCtaLabel: e.target.value }))}
                placeholder="View Capabilities"
                className="h-9"
              />
            </div>
          </div>
          {theme.heroBackgroundMode === "image" && (
            <LogoUploader
              value={theme.heroBackgroundStorageKey}
              onChange={v => setTheme(prev => ({ ...prev, heroBackgroundStorageKey: v }))}
              label="Hero Background Image"
            />
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Overlay Intensity: {theme.heroOverlayIntensity.toFixed(2)}</Label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={theme.heroOverlayIntensity}
              onChange={e => setTheme(prev => ({ ...prev, heroOverlayIntensity: parseFloat(e.target.value) }))}
              className="w-full"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Custom Messages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Welcome Message</Label>
            <Textarea
              value={theme.customWelcomeMessage}
              onChange={e => setTheme(prev => ({ ...prev, customWelcomeMessage: e.target.value }))}
              placeholder="Custom welcome message for the portal..."
              className="min-h-[60px] resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Theme Notes (internal)</Label>
            <Textarea
              value={theme.themeNotes}
              onChange={e => setTheme(prev => ({ ...prev, themeNotes: e.target.value }))}
              placeholder="Internal notes about the design direction..."
              className="min-h-[60px] resize-none"
            />
          </div>
        </CardContent>
      </Card>

      {showPreview && (
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Eye className="h-4 w-4" /> Live Preview</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="border-t overflow-hidden rounded-b-lg" style={{ backgroundColor: branding.background }}>
              <PortalNavbar
                partnerName={partnerName}
                partnerLogoUrl={partnerLogo || theme.logoUrl}
                branding={branding}
              />
              <PartnerPortalHeader
                partnerName={partnerName}
                partnerLogoUrl={partnerLogo || theme.logoUrl}
                branding={branding}
                defaultHeadline={`Welcome to ${partnerName}`}
                defaultSubheadline="Your premium event production partner"
              />
              <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <PortalCard branding={branding} icon={FileText} title="Start a Quote" description="Request a custom quote for your event production needs." cta="Get Started" />
                  <PortalCard branding={branding} icon={Upload} title="Upload Files" description="Submit artwork, specifications, and project files." cta="Upload" />
                  <PortalCard branding={branding} icon={Shield} title="Documents" description="Access shared documents, W-9s, and certificates." cta="View Documents" />
                  <PortalCard branding={branding} icon={ShoppingBag} title="Browse Products" description="Explore our full catalog of signage and branding solutions." cta="Browse" />
                  <PortalCard branding={branding} icon={Star} title="Quote Status" description="Check the status of your existing quotes and orders." cta="Check Status" />
                  <PortalCard branding={branding} icon={MessageSquare} title="Contact A3" description="Get in touch with your dedicated A3 account team." cta="Contact" />
                </div>
              </div>
              <PortalFooter partnerName={partnerName} branding={branding} />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-3 pt-2 pb-8">
        <Button type="button" variant="outline" onClick={() => setLocation(`/admin/partners/${id}/edit`)}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
        </Button>
        <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
          Save Draft
        </Button>
        <Button onClick={() => handleSave(true)} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Globe className="h-4 w-4 mr-1.5" />}
          Publish Theme
        </Button>
      </div>
    </div>
  );
}
