import { useParams, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Palette, Check, Sparkles } from "lucide-react";
import { Link } from "wouter";

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
}

const TONE_PRESETS = ["luxury", "modern", "energetic", "playful", "corporate", "minimal"];
const BUTTON_STYLES = ["rounded", "pill", "square", "soft"];
const FONT_OPTIONS = ["Inter", "Poppins", "Playfair Display", "Montserrat", "DM Sans", "Space Grotesk", "Outfit"];

export default function PartnerThemeEditor() {
  const params = useParams();
  const id = parseInt(params.id || "0");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [theme, setTheme] = useState<ThemeData>({
    primaryColor: "#0f1729",
    secondaryColor: "#1e293b",
    accentColor: "#f59e0b",
    backgroundColor: "#f8fafc",
    buttonColor: "#0f1729",
    textColor: "#0f172a",
    headingFont: "Inter",
    bodyFont: "Inter",
    buttonStyle: "rounded",
    borderRadius: "0.75rem",
    tonePreset: "luxury",
    themeNotes: "",
    isApproved: "pending",
  });

  useEffect(() => {
    fetch(`/api/partners/${id}/theme`)
      .then(r => r.json())
      .then(data => {
        if (data) {
          setTheme({
            primaryColor: data.primaryColor || "#0f1729",
            secondaryColor: data.secondaryColor || "#1e293b",
            accentColor: data.accentColor || "#f59e0b",
            backgroundColor: data.backgroundColor || "#f8fafc",
            buttonColor: data.buttonColor || data.primaryColor || "#0f1729",
            textColor: data.textColor || "#0f172a",
            headingFont: data.headingFont || "Inter",
            bodyFont: data.bodyFont || "Inter",
            buttonStyle: data.buttonStyle || "rounded",
            borderRadius: data.borderRadius || "0.75rem",
            tonePreset: data.tonePreset || "luxury",
            themeNotes: data.themeNotes || "",
            isApproved: data.isApproved || "pending",
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/partners/${id}/theme`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(theme),
      });
      if (res.ok) {
        toast({ title: "Theme saved" });
      } else {
        toast({ title: "Failed to save theme", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to save theme", variant: "destructive" });
    }
    setSaving(false);
  };

  const handleApprove = () => {
    setTheme(prev => ({ ...prev, isApproved: "approved" }));
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
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
        <span className="text-foreground font-medium">Theme</span>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Palette className="h-6 w-6" /> Partner Theme</h1>
        <div className="flex items-center gap-2">
          {theme.isApproved === "approved" ? (
            <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded-lg font-medium flex items-center gap-1">
              <Check className="h-3 w-3" /> Approved
            </span>
          ) : (
            <Button variant="outline" size="sm" onClick={handleApprove} className="gap-1.5">
              <Check className="h-3.5 w-3.5" /> Approve Theme
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Color Palette</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { key: "primaryColor", label: "Primary" },
              { key: "secondaryColor", label: "Secondary" },
              { key: "accentColor", label: "Accent" },
              { key: "backgroundColor", label: "Background" },
              { key: "buttonColor", label: "Button" },
              { key: "textColor", label: "Text" },
            ].map(({ key, label }) => (
              <div key={key} className="space-y-2">
                <Label className="text-xs">{label}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={theme[key as keyof ThemeData]}
                    onChange={e => setTheme(prev => ({ ...prev, [key]: e.target.value }))}
                    className="w-10 h-10 rounded-lg border cursor-pointer"
                  />
                  <Input
                    value={theme[key as keyof ThemeData]}
                    onChange={e => setTheme(prev => ({ ...prev, [key]: e.target.value }))}
                    className="text-xs font-mono"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 rounded-xl border">
            <p className="text-xs text-muted-foreground mb-3">Preview</p>
            <div className="flex gap-3">
              {[theme.primaryColor, theme.secondaryColor, theme.accentColor, theme.backgroundColor, theme.buttonColor, theme.textColor].map((color, i) => (
                <div key={i} className="flex-1 h-16 rounded-lg border" style={{ backgroundColor: color }} />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Typography & Style</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Heading Font</Label>
              <Select value={theme.headingFont} onValueChange={v => setTheme(prev => ({ ...prev, headingFont: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Body Font</Label>
              <Select value={theme.bodyFont} onValueChange={v => setTheme(prev => ({ ...prev, bodyFont: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Button Style</Label>
              <Select value={theme.buttonStyle} onValueChange={v => setTheme(prev => ({ ...prev, buttonStyle: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUTTON_STYLES.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Border Radius</Label>
              <Input value={theme.borderRadius} onChange={e => setTheme(prev => ({ ...prev, borderRadius: e.target.value }))} placeholder="0.75rem" />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Tone Preset</Label>
            <div className="flex flex-wrap gap-2">
              {TONE_PRESETS.map(tone => (
                <button
                  key={tone}
                  type="button"
                  onClick={() => setTheme(prev => ({ ...prev, tonePreset: tone }))}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                    theme.tonePreset === tone ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
                  }`}
                >
                  {tone.charAt(0).toUpperCase() + tone.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={theme.themeNotes}
            onChange={e => setTheme(prev => ({ ...prev, themeNotes: e.target.value }))}
            placeholder="Any notes about the theme, style direction, or AI suggestions..."
            className="min-h-[80px] resize-none"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => setLocation(`/admin/partners/${id}/edit`)}>Back to Partner</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save Theme
        </Button>
      </div>
    </div>
  );
}
