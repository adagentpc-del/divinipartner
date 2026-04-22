/**
 * Partner Portal Section Builder (Section 22 — refined April 22, 2026)
 *
 * The builder shows the sections currently on a partner's portal as a stacked
 * list with status badges + reorder/show-hide/remove controls. To add a new
 * section, the operator picks from a NAMED dropdown of all section types
 * available for that partner's `partnerType` (branding vs ordering), each
 * option showing label + short description. Single-instance section types
 * (e.g. hero, contact_support) are disabled in the picker once added; the
 * "custom_content" type is multi-instance.
 *
 * Backend is unchanged — this is purely a builder UX overhaul on top of the
 * existing /api/partners/:id/sections endpoints.
 */
import { useParams, useLocation, Link } from "wouter";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Loader2, ChevronUp, ChevronDown, Plus, Trash2,
  Eye, EyeOff, LayoutGrid, MapPin, Sparkles, Hammer, MessageSquareQuote,
  FileText, Briefcase, Home, Package, Building2, CalendarRange,
  Boxes, LifeBuoy, HelpCircle, Type,
} from "lucide-react";

interface Section {
  id?: number;
  sectionType: string;
  title: string;
  subtitle: string;
  description: string;
  featuredImageUrl: string;
  featuredVideoUrl: string;
  isEnabled: boolean;
  sortOrder: number;
}

interface Partner { id: number; name: string; partnerType: string | null; }

type Audience = "branding" | "ordering" | "both";
interface SectionTypeDef {
  value: string;
  label: string;
  description: string;
  audience: Audience;
  multiInstance?: boolean;
  icon: typeof LayoutGrid;
  defaultTitle?: string;
}

/**
 * Master catalog of section types. `audience` filters the picker by the
 * partner's `partnerType`. `multiInstance: true` means the type can appear
 * more than once on a portal (e.g. multiple custom content blocks).
 */
const SECTION_TYPES: SectionTypeDef[] = [
  // Universal
  { value: "hero",              label: "Hero / Landing",         description: "Top-of-page hero banner with headline, subhead, and call-to-action.", audience: "both",     icon: Home,           defaultTitle: "Welcome" },
  { value: "packages",          label: "Packages",                description: "Bundled offerings clients can choose between (tiers / kits).",         audience: "both",     icon: Package,        defaultTitle: "Packages" },
  { value: "catalog",           label: "Catalog",                 description: "Individual products or add-ons available for order.",                  audience: "both",     icon: LayoutGrid,     defaultTitle: "Catalog" },
  { value: "contact_support",   label: "Contact / Support",       description: "Contact card with support hours, escalation path, and account rep.",   audience: "both",     icon: LifeBuoy,       defaultTitle: "Contact us" },
  { value: "faq",               label: "FAQ",                     description: "Frequently asked questions, accordion-style.",                          audience: "both",     icon: HelpCircle,     defaultTitle: "FAQ" },
  { value: "custom_content",    label: "Custom content block",    description: "Free-form titled text/image block. Add as many as needed.",            audience: "both",     icon: Type,           multiInstance: true, defaultTitle: "Custom block" },
  { value: "partner_deck",      label: "Partner Deck",            description: "Static PDF or slide deck for the partner.",                            audience: "both",     icon: FileText,       defaultTitle: "Partner Deck" },
  { value: "capabilities",      label: "A3 Capabilities",         description: "Overview of A3's wider capabilities and services.",                    audience: "both",     icon: Briefcase,      defaultTitle: "Capabilities" },

  // Ordering-partner sections (Social Commerce, multi-event)
  { value: "cities",            label: "Cities",                  description: "City picker for multi-city ordering partners.",                        audience: "ordering", icon: MapPin,         defaultTitle: "Pick your city" },
  { value: "venues",            label: "Venues",                  description: "Venue picker / venue-specific info for ordering partners.",            audience: "ordering", icon: Building2,      defaultTitle: "Venues" },
  { value: "event_selection",   label: "Event selection",         description: "Lets clients pick which event the order belongs to.",                  audience: "ordering", icon: CalendarRange,  defaultTitle: "Pick your event" },
  { value: "inventory",         label: "Inventory-aware items",   description: "Product list filtered to items currently in stock for the city/venue.", audience: "ordering", icon: Boxes,          defaultTitle: "Available now" },
  { value: "standard_products", label: "Standard Products",       description: "Standard event signage and displays catalog.",                         audience: "ordering", icon: LayoutGrid,     defaultTitle: "Standard Products" },
  { value: "event_materials",   label: "Branded Event Materials", description: "Awards, programs, invitations, menus, badges, etc.",                  audience: "ordering", icon: FileText,       defaultTitle: "Event Materials" },

  // Branding-partner sections (Move Miami, Wynwood — venue/zone branding)
  { value: "venue_branding",    label: "Venue Branding Map",      description: "Pre-mapped venue branding opportunities (clickable map).",             audience: "branding", icon: MapPin,         defaultTitle: "Brand This Venue" },
  { value: "branding_zones",    label: "Branding Zones",          description: "Selectable branded areas within the venue.",                           audience: "branding", icon: MapPin,         defaultTitle: "Branding Zones" },
  { value: "immersive",         label: "Immersive Upgrades",      description: "LED walls, projection mapping, interactive displays.",                 audience: "branding", icon: Sparkles,       defaultTitle: "Immersive Upgrades" },
  { value: "fabrication",       label: "Custom Fabrication",      description: "Bespoke event builds and structures.",                                 audience: "branding", icon: Hammer,         defaultTitle: "Custom Fabrication" },
  { value: "open_request",      label: "Open Creative Request",   description: "Catch-all form for unique requests that don't fit other sections.",    audience: "branding", icon: MessageSquareQuote, defaultTitle: "Creative Request" },
];

const TYPE_BY_VALUE = new Map(SECTION_TYPES.map(t => [t.value, t]));

export default function PartnerSections() {
  const params = useParams();
  const id = parseInt(params.id || "0");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [pickerValue, setPickerValue] = useState<string>("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/partners/${id}/sections`).then(r => r.json()).catch(() => []),
      fetch(`/api/partners/${id}`).then(r => r.json()).catch(() => null),
    ]).then(([secs, p]) => {
      setSections(secs || []);
      setPartner(p);
      setLoading(false);
    });
  }, [id]);

  // Filter the master catalog by the partner's audience. `branding` and
  // `ordering` partners each see their own subset plus the universal items;
  // partners with no type set (or any unrecognized legacy value in the DB —
  // `partnerType` is a free-text column, so we normalize defensively) see
  // the FULL catalog so the operator can configure freely.
  const rawType = partner?.partnerType;
  const audience: Audience | null = (rawType === "branding" || rawType === "ordering") ? rawType : null;
  const availableTypes = SECTION_TYPES.filter(t => !audience || t.audience === "both" || t.audience === audience);
  const usedSingleInstance = new Set(sections.filter(s => !TYPE_BY_VALUE.get(s.sectionType)?.multiInstance).map(s => s.sectionType));

  const addSection = (typeValue: string) => {
    const def = TYPE_BY_VALUE.get(typeValue);
    if (!def) return;
    if (!def.multiInstance && usedSingleInstance.has(typeValue)) {
      toast({ title: "Already added", description: `"${def.label}" is single-instance and already on this portal.`, variant: "destructive" });
      return;
    }
    setSections(prev => [...prev, {
      sectionType: typeValue,
      title: def.defaultTitle || def.label,
      subtitle: "",
      description: "",
      featuredImageUrl: "",
      featuredVideoUrl: "",
      isEnabled: true,
      sortOrder: prev.length,
    }]);
    setPickerValue("");
  };

  const updateSection = (index: number, updates: Partial<Section>) => {
    setSections(prev => prev.map((s, i) => i === index ? { ...s, ...updates } : s));
  };
  const removeSection = (index: number) => setSections(prev => prev.filter((_, i) => i !== index));
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= sections.length) return;
    setSections(prev => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((s, i) => ({ ...s, sortOrder: i }));
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/partners/${id}/sections/bulk`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sections.map((s, i) => ({
          sectionType: s.sectionType,
          title: s.title,
          subtitle: s.subtitle,
          description: s.description,
          featuredImageUrl: s.featuredImageUrl || undefined,
          featuredVideoUrl: s.featuredVideoUrl || undefined,
          isEnabled: s.isEnabled,
          sortOrder: i,
        }))),
      });
      if (res.ok) {
        const data = await res.json();
        setSections(data);
        toast({ title: "Sections saved", description: `${data.length} section${data.length === 1 ? "" : "s"} on this portal.` });
      } else {
        toast({ title: "Failed to save sections", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to save sections", variant: "destructive" });
    }
    setSaving(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  const visibleCount = sections.filter(s => s.isEnabled).length;
  const hiddenCount = sections.length - visibleCount;

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
        <span className="text-foreground font-medium">Sections</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Portal Sections</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {partner?.name || "This partner"}'s portal · {sections.length} section{sections.length === 1 ? "" : "s"}
            {sections.length > 0 && <> ({visibleCount} visible{hiddenCount > 0 ? `, ${hiddenCount} hidden` : ""})</>}
            {audience && <> · {audience === "branding" ? "Branding partner" : "Ordering partner"} options shown</>}
          </p>
        </div>
      </div>

      {/* ============ Add section: named picker ============ */}
      <Card className="border-dashed">
        <CardContent className="py-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm font-medium">Add a section</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Pick from sections appropriate for this partner type. Already-added sections are disabled.</p>
            </div>
            <div className="w-72">
              <Select value={pickerValue} onValueChange={(v) => addSection(v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Choose a section…" />
                </SelectTrigger>
                <SelectContent className="max-h-[420px]">
                  {availableTypes.map(t => {
                    const Icon = t.icon;
                    const disabled = !t.multiInstance && usedSingleInstance.has(t.value);
                    return (
                      <SelectItem key={t.value} value={t.value} disabled={disabled}>
                        <div className="flex items-start gap-2 py-0.5 max-w-[320px]">
                          <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium leading-tight">
                              {t.label}
                              {disabled && <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">(already added)</span>}
                              {t.multiInstance && <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">(repeatable)</span>}
                            </span>
                            <span className="text-[11px] text-muted-foreground leading-snug">{t.description}</span>
                          </div>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ============ Existing sections ============ */}
      <div className="space-y-3">
        {sections.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <p className="text-muted-foreground">No sections configured yet.</p>
              <p className="text-xs text-muted-foreground">Use the picker above to add your first section.</p>
            </CardContent>
          </Card>
        ) : sections.map((section, index) => {
          const def = TYPE_BY_VALUE.get(section.sectionType);
          const Icon = def?.icon || LayoutGrid;
          return (
            <Card key={index} className={!section.isEnabled ? "opacity-70 border-dashed" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex flex-col gap-0.5">
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => move(index, -1)} disabled={index === 0} title="Move up">
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => move(index, 1)} disabled={index === sections.length - 1} title="Move down">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold truncate">{def?.label || section.sectionType}</span>
                        <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-4">#{index + 1}</Badge>
                        {section.isEnabled
                          ? <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] gap-1 h-4 px-1.5"><Eye className="h-3 w-3" />Visible</Badge>
                          : <Badge variant="outline" className="text-[10px] text-muted-foreground gap-1 h-4 px-1.5"><EyeOff className="h-3 w-3" />Hidden</Badge>}
                        {!section.title && <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 h-4 px-1.5">Not configured</Badge>}
                      </div>
                      {def?.description && <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{def.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <Switch checked={section.isEnabled} onCheckedChange={v => updateSection(index, { isEnabled: v })} />
                      <Label className="text-xs">{section.isEnabled ? "Show" : "Hide"}</Label>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeSection(index)} title="Remove section">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Title</Label>
                    <Input value={section.title} onChange={e => updateSection(index, { title: e.target.value })} placeholder="Section title" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Subtitle</Label>
                    <Input value={section.subtitle} onChange={e => updateSection(index, { subtitle: e.target.value })} placeholder="Subtitle" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Textarea value={section.description} onChange={e => updateSection(index, { description: e.target.value })} className="min-h-[60px] resize-none" />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Featured Image URL</Label>
                    <Input value={section.featuredImageUrl} onChange={e => updateSection(index, { featuredImageUrl: e.target.value })} placeholder="https://..." />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Featured Video URL</Label>
                    <Input value={section.featuredVideoUrl} onChange={e => updateSection(index, { featuredVideoUrl: e.target.value })} placeholder="https://..." />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end gap-3 pt-2 sticky bottom-0 bg-background/80 backdrop-blur py-3 border-t">
        <Button type="button" variant="outline" onClick={() => setLocation(`/admin/partners/${id}/edit`)}>Back to Partner</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save All Sections
        </Button>
      </div>
    </div>
  );
}
