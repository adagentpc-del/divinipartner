import { useParams, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, GripVertical, Plus, Trash2 } from "lucide-react";
import { Link } from "wouter";

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

const SECTION_TYPES = [
  { value: "standard_products", label: "Standard Products" },
  { value: "venue_branding", label: "Venue Branding Map" },
  { value: "event_materials", label: "Branded Event Materials" },
  { value: "immersive", label: "Immersive Upgrades" },
  { value: "fabrication", label: "Custom Fabrication" },
  { value: "open_request", label: "Open Creative Request" },
  { value: "partner_deck", label: "Partner Deck" },
  { value: "capabilities", label: "A3 Capabilities" },
];

export default function PartnerSections() {
  const params = useParams();
  const id = parseInt(params.id || "0");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);

  useEffect(() => {
    fetch(`/api/partners/${id}/sections`)
      .then(r => r.json())
      .then(data => {
        setSections(data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const addSection = () => {
    const usedTypes = sections.map(s => s.sectionType);
    const nextType = SECTION_TYPES.find(t => !usedTypes.includes(t.value))?.value || "open_request";
    setSections(prev => [...prev, {
      sectionType: nextType,
      title: SECTION_TYPES.find(t => t.value === nextType)?.label || "",
      subtitle: "",
      description: "",
      featuredImageUrl: "",
      featuredVideoUrl: "",
      isEnabled: true,
      sortOrder: prev.length,
    }]);
  };

  const updateSection = (index: number, updates: Partial<Section>) => {
    setSections(prev => prev.map((s, i) => i === index ? { ...s, ...updates } : s));
  };

  const removeSection = (index: number) => {
    setSections(prev => prev.filter((_, i) => i !== index));
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
        toast({ title: "Sections saved" });
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

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Portal Sections</h1>
        <Button onClick={addSection} size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add Section
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">Configure which sections appear in this partner's portal and customize their content.</p>

      <div className="space-y-4">
        {sections.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No sections configured yet.</p>
              <Button variant="outline" className="mt-4" onClick={addSection}>Add First Section</Button>
            </CardContent>
          </Card>
        ) : sections.map((section, index) => (
          <Card key={index} className={!section.isEnabled ? "opacity-60" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                  <span className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                    {SECTION_TYPES.find(t => t.value === section.sectionType)?.label || section.sectionType}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={section.isEnabled}
                      onCheckedChange={v => updateSection(index, { isEnabled: v })}
                    />
                    <Label className="text-xs">{section.isEnabled ? "Enabled" : "Disabled"}</Label>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeSection(index)}>
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
        ))}
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => setLocation(`/admin/partners/${id}/edit`)}>Back to Partner</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save All Sections
        </Button>
      </div>
    </div>
  );
}
