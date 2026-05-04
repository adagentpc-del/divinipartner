import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, ShoppingBag, MapPin, Palette, Sparkles, Hammer, MessageSquare,
  ArrowRight, Download, ExternalLink, Package, FileText, Layers
} from "lucide-react";
import RequestFormDialog from "./RequestFormDialog";
import { formatWxH, type UnitSystem } from "@/lib/units";

interface PortalData {
  partner: {
    id: number;
    companyName: string;
    slug: string;
    logoUrl: string | null;
    secondaryLogoUrl: string | null;
    websiteUrl: string | null;
    smallA3BadgeEnabled: boolean;
    introHeadline: string | null;
    introText: string | null;
    thankYouText: string | null;
    capabilitiesLink: string | null;
    partnerDeckFileUrl: string | null;
    globalSizzleReelUrl: string | null;
    partnerVideoUrl: string | null;
    portalMode: string | null;
  };
  theme: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    backgroundColor: string;
    headingFont: string;
    bodyFont: string;
    buttonStyle: string;
    borderRadius: string;
  } | null;
  sections: {
    id: number;
    sectionType: string;
    title: string | null;
    subtitle: string | null;
    description: string | null;
    featuredImageUrl: string | null;
    featuredVideoUrl: string | null;
    sortOrder: number | null;
  }[];
  products: {
    id: number;
    name: string;
    slug: string;
    category: string;
    description: string | null;
    imageUrl: string | null;
    isOrderable: boolean;
    allowsDesignRequest: boolean;
    sizeOptionsJson: string[] | null;
    sortOrder: number | null;
  }[];
  brandingLocations: {
    id: number;
    name: string;
    category: string;
    description: string | null;
    sizeWidth: number | null;
    sizeHeight: number | null;
    sizeUnit: string | null;
    previewImageUrl: string | null;
    templateFileUrl: string | null;
    artworkGuidelines: string | null;
    sortOrder: number | null;
  }[];
}

const SECTION_ICONS: Record<string, any> = {
  standard_products: ShoppingBag,
  venue_branding: MapPin,
  event_materials: Palette,
  immersive: Sparkles,
  fabrication: Hammer,
  open_request: MessageSquare,
  partner_deck: FileText,
  capabilities: Layers,
};

const SECTION_LABELS: Record<string, string> = {
  standard_products: "Event Products",
  venue_branding: "Brand This Venue",
  event_materials: "Event Materials",
  immersive: "Immersive Experiences",
  fabrication: "Custom Fabrication",
  open_request: "Open Request",
  partner_deck: "Partner Deck",
  capabilities: "Capabilities",
};

const QUICK_ACTION_LABELS: Record<string, string> = {
  standard_products: "Order Standard Products",
  venue_branding: "Brand This Venue",
  event_materials: "Request Event Materials",
  immersive: "Explore Immersive Upgrades",
  fabrication: "Request Custom Fabrication",
};

const QUICK_ACTION_TYPES = ["standard_products", "venue_branding", "event_materials", "immersive", "fabrication"];

export default function FullPortal({ slug }: { slug: string }) {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeDialog, setActiveDialog] = useState<{
    type: string;
    title: string;
    endpoint: string;
    extra: Record<string, any>;
    props: Record<string, any>;
  } | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<PortalData["products"][0] | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<PortalData["brandingLocations"][0] | null>(null);

  useEffect(() => {
    fetch(`/api/public/partners/${slug}/portal`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  const theme = data?.theme;
  const partner = data?.partner;

  const [preferredSystem, setPreferredSystem] = useState<UnitSystem | undefined>(undefined);
  useEffect(() => {
    setPreferredSystem(undefined);
    if (!partner?.id) return;
    let cancelled = false;
    fetch(`/api/units/resolve?partnerId=${partner.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancelled && j?.system) setPreferredSystem(j.system); })
      .catch(() => { if (!cancelled) setPreferredSystem(undefined); });
    return () => { cancelled = true; };
  }, [partner?.id]);
  const primaryColor = theme?.primaryColor || "#0f1729";
  const accentColor = theme?.accentColor || "#f59e0b";
  const bgColor = theme?.backgroundColor || "#f8fafc";
  // buttonColor falls back to primaryColor for partners that haven't customized buttons yet.
  const buttonColor = (theme as any)?.buttonColor || primaryColor;
  const textColor = (theme as any)?.textColor || "#0f172a";
  const borderRadius = theme?.borderRadius || "0.75rem";
  const headingFont = theme?.headingFont || "inherit";
  const bodyFont = theme?.bodyFont || "inherit";

  const enabledSections = useMemo(() => data?.sections || [], [data?.sections]);
  const sectionTypes = useMemo(() => new Set(enabledSections.map(s => s.sectionType)), [enabledSections]);
  const sectionMap = useMemo(() => {
    const m = new Map<string, typeof enabledSections[0]>();
    for (const s of enabledSections) m.set(s.sectionType, s);
    return m;
  }, [enabledSections]);

  const productsByCategory = useMemo(() => {
    if (!data?.products) return {};
    const map: Record<string, typeof data.products> = {};
    for (const p of data.products) {
      if (!map[p.category]) map[p.category] = [];
      map[p.category].push(p);
    }
    return map;
  }, [data?.products]);

  const locationsByCategory = useMemo(() => {
    if (!data?.brandingLocations) return {};
    const map: Record<string, typeof data.brandingLocations> = {};
    for (const l of data.brandingLocations) {
      if (!map[l.category]) map[l.category] = [];
      map[l.category].push(l);
    }
    return map;
  }, [data?.brandingLocations]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: bgColor }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: primaryColor }} />
      </div>
    );
  }

  if (!data || !partner) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center space-y-2">
          <p className="text-xl font-semibold">Partner not found</p>
          <p className="text-muted-foreground">This portal link may be invalid or expired.</p>
        </div>
      </div>
    );
  }

  const sectionTitle = (type: string) => sectionMap.get(type)?.title || SECTION_LABELS[type] || type;

  const openProductDialog = (product: PortalData["products"][0]) => {
    setSelectedProduct(product);
    setActiveDialog({
      type: "product",
      title: `Order: ${product.name}`,
      endpoint: "product-requests",
      extra: { productId: product.id },
      props: {
        showSizeSelector: !!product.sizeOptionsJson?.length,
        sizeOptions: product.sizeOptionsJson || [],
        showQuantity: true,
      },
    });
  };

  const openBrandingDialog = (location: PortalData["brandingLocations"][0]) => {
    setSelectedLocation(location);
    setActiveDialog({
      type: "branding",
      title: `Branding: ${location.name}`,
      endpoint: "branding-requests",
      extra: { brandingLocationId: location.id },
      props: {},
    });
  };

  const openSectionDialog = (sectionType: string, title: string) => {
    const configMap: Record<string, { endpoint: string; extra: Record<string, any>; props: Record<string, any> }> = {
      event_materials: {
        endpoint: "portal-requests",
        extra: { requestType: "event_materials", requestCategory: "collateral_print" },
        props: { showDescription: true },
      },
      immersive: {
        endpoint: "portal-requests",
        extra: { requestType: "immersive", requestCategory: "immersive" },
        props: { showGoals: true, showVenue: true, showBudget: true },
      },
      fabrication: {
        endpoint: "portal-requests",
        extra: { requestType: "fabrication", requestCategory: "fabrication" },
        props: { showDescription: true, showVenue: true, showBudget: true },
      },
      open_request: {
        endpoint: "portal-requests",
        extra: { requestType: "open_request", requestCategory: "open" },
        props: { showDescription: true },
      },
    };

    const config = configMap[sectionType];
    if (!config) return;

    setActiveDialog({ type: sectionType, title, ...config });
  };

  const scrollToSection = (sectionType: string) => {
    const el = document.getElementById(`section-${sectionType}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const availableQuickActions = QUICK_ACTION_TYPES
    .filter(type => sectionTypes.has(type))
    .filter(type => {
      if (type === "venue_branding" && !data.brandingLocations.length) return false;
      return true;
    });

  const renderCTASection = (section: typeof enabledSections[0], sectionType: string, ctaLabel: string) => {
    const Icon = SECTION_ICONS[sectionType] || Package;
    return (
      <section key={section.id} id={`section-${sectionType}`} className="scroll-mt-20">
        <Card className="overflow-hidden" style={{ borderRadius }}>
          <div className="p-6 sm:p-8" style={{ background: `linear-gradient(135deg, ${primaryColor}08, ${accentColor}08)` }}>
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${accentColor}20` }}>
                <Icon className="h-6 w-6" style={{ color: accentColor }} />
              </div>
              <div className="flex-1 space-y-2">
                <h3 className="text-xl sm:text-2xl font-bold">{section.title || SECTION_LABELS[sectionType]}</h3>
                {section.subtitle && <p className="text-muted-foreground">{section.subtitle}</p>}
                {section.description && (
                  <p className="text-sm text-muted-foreground max-w-xl">{section.description}</p>
                )}
                <Button className="mt-4 gap-1.5" style={{ backgroundColor: buttonColor, color: "#fff" }} onClick={() => openSectionDialog(sectionType, section.title || SECTION_LABELS[sectionType])}>
                  <Icon className="h-4 w-4" /> {ctaLabel}
                </Button>
              </div>
              {section.featuredImageUrl && (
                <img src={section.featuredImageUrl} alt="" className="hidden lg:block w-40 h-28 object-cover rounded-lg" />
              )}
            </div>
          </div>
        </Card>
      </section>
    );
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: bgColor, fontFamily: bodyFont }}>
      {(partner as any)?.previewMode && (
        <div className="bg-blue-600 text-white text-xs sm:text-sm px-4 py-2 text-center font-medium">
          Preview mode — this portal is visible for review only. Submissions are disabled until it goes live.
        </div>
      )}
      <header className="sticky top-0 z-30 border-b backdrop-blur-lg" style={{ backgroundColor: `${primaryColor}f0` }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {partner.logoUrl ? (
              <img src={partner.logoUrl} alt={partner.companyName} className="h-9 sm:h-10 object-contain" />
            ) : (
              <h1 className="text-lg sm:text-xl font-bold text-white">{partner.companyName}</h1>
            )}
            {partner.secondaryLogoUrl && (
              <>
                <div className="w-px h-6 bg-white/20" />
                <img src={partner.secondaryLogoUrl} alt="Secondary logo" className="h-7 sm:h-8 object-contain opacity-80" />
              </>
            )}
            {partner.smallA3BadgeEnabled && (
              <>
                <div className="w-px h-6 bg-white/20 hidden sm:block" />
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-white/60">
                  <span>Production by</span>
                  <div className="h-5 w-5 rounded flex items-center justify-center text-[9px] font-bold leading-none" style={{ backgroundColor: accentColor, color: primaryColor }}>A3</div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)` }}>
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24 relative">
          <div className="text-center text-white space-y-4">
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight leading-tight" style={{ fontFamily: headingFont }}>
              {partner.introHeadline || `Welcome to the ${partner.companyName} Partner Portal`}
            </h2>
            {partner.introText && (
              <p className="text-base sm:text-lg text-white/80 max-w-2xl mx-auto leading-relaxed">
                {partner.introText}
              </p>
            )}
            {partner.thankYouText && (
              <p className="text-sm text-white/60 max-w-xl mx-auto italic">
                {partner.thankYouText}
              </p>
            )}
            {(partner.capabilitiesLink || partner.partnerDeckFileUrl) && (
              <div className="flex flex-wrap justify-center gap-3 pt-4">
                {partner.capabilitiesLink && (
                  <a href={partner.capabilitiesLink} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="border-white/30 text-white hover:bg-white/10 gap-1.5">
                      A3 Capabilities <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                )}
                {partner.partnerDeckFileUrl && (
                  <a href={partner.partnerDeckFileUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="border-white/30 text-white hover:bg-white/10 gap-1.5">
                      Partner Deck <Download className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {(partner.globalSizzleReelUrl || partner.partnerVideoUrl) && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 -mt-8 relative z-10">
          <div className="aspect-video rounded-xl overflow-hidden shadow-2xl border-4 border-white/80">
            <iframe
              src={partner.partnerVideoUrl || partner.globalSizzleReelUrl || ""}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="Sizzle reel"
            />
          </div>
        </div>
      )}

      {availableQuickActions.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
          <div className={`grid grid-cols-2 sm:grid-cols-3 ${availableQuickActions.length >= 5 ? "lg:grid-cols-5" : `lg:grid-cols-${Math.min(availableQuickActions.length, 4)}`} gap-3`}>
            {availableQuickActions.map(type => {
              const Icon = SECTION_ICONS[type] || Package;
              const sectionData = sectionMap.get(type);
              const label = sectionData?.title || QUICK_ACTION_LABELS[type] || SECTION_LABELS[type];
              return (
                <button
                  key={type}
                  onClick={() => scrollToSection(type)}
                  className="group p-4 rounded-xl border bg-white hover:shadow-lg transition-all text-left space-y-2"
                  style={{ borderRadius }}
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accentColor}20` }}>
                    <Icon className="h-5 w-5" style={{ color: accentColor }} />
                  </div>
                  <p className="text-sm font-semibold leading-tight">{label}</p>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 space-y-16">
        {enabledSections.map(section => {
          const Icon = SECTION_ICONS[section.sectionType] || Package;

          if (section.sectionType === "standard_products") {
            if (!Object.keys(productsByCategory).length) return null;
            return (
              <section key={section.id} id={`section-${section.sectionType}`} className="scroll-mt-20">
                <div className="mb-8">
                  <div className="flex items-center gap-3 mb-2">
                    <Icon className="h-6 w-6" style={{ color: primaryColor }} />
                    <h3 className="text-2xl sm:text-3xl font-bold">{section.title || SECTION_LABELS.standard_products}</h3>
                  </div>
                  {section.subtitle && <p className="text-muted-foreground ml-9">{section.subtitle}</p>}
                  {section.description && <p className="text-sm text-muted-foreground ml-9 mt-1 max-w-2xl">{section.description}</p>}
                </div>
                {Object.entries(productsByCategory).map(([category, products]) => (
                  <div key={category} className="mb-8">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4 ml-1">{category}</h4>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {products.map(product => (
                        <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-shadow group cursor-pointer" style={{ borderRadius }} onClick={() => openProductDialog(product)}>
                          {product.imageUrl && (
                            <div className="aspect-[4/3] overflow-hidden bg-muted">
                              <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            </div>
                          )}
                          <CardContent className="p-4 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <h5 className="font-semibold text-sm">{product.name}</h5>
                              {product.sizeOptionsJson && product.sizeOptionsJson.length > 0 && (
                                <Badge variant="outline" className="text-[10px] shrink-0">{product.sizeOptionsJson.length} sizes</Badge>
                              )}
                            </div>
                            {product.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2">{product.description}</p>
                            )}
                            <Button size="sm" className="w-full gap-1.5 mt-2" style={{ backgroundColor: buttonColor, color: "#fff" }}>
                              <ShoppingBag className="h-3.5 w-3.5" /> Request Quote
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            );
          }

          if (section.sectionType === "venue_branding") {
            if (!data.brandingLocations.length) return null;
            return (
              <section key={section.id} id={`section-${section.sectionType}`} className="scroll-mt-20">
                <div className="mb-8">
                  <div className="flex items-center gap-3 mb-2">
                    <Icon className="h-6 w-6" style={{ color: primaryColor }} />
                    <h3 className="text-2xl sm:text-3xl font-bold">{section.title || SECTION_LABELS.venue_branding}</h3>
                  </div>
                  {section.subtitle && <p className="text-muted-foreground ml-9">{section.subtitle}</p>}
                  {section.description && <p className="text-sm text-muted-foreground ml-9 mt-1 max-w-2xl">{section.description}</p>}
                </div>
                {Object.entries(locationsByCategory).map(([category, locations]) => (
                  <div key={category} className="mb-8">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4 ml-1">{category}</h4>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {locations.map(loc => (
                        <Card key={loc.id} className="overflow-hidden hover:shadow-lg transition-shadow group cursor-pointer" style={{ borderRadius }} onClick={() => openBrandingDialog(loc)}>
                          {loc.previewImageUrl ? (
                            <div className="aspect-[4/3] overflow-hidden bg-muted">
                              <img src={loc.previewImageUrl} alt={loc.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            </div>
                          ) : (
                            <div className="aspect-[4/3] bg-muted flex items-center justify-center">
                              <MapPin className="h-10 w-10 text-muted-foreground/30" />
                            </div>
                          )}
                          <CardContent className="p-4 space-y-2">
                            <h5 className="font-semibold text-sm">{loc.name}</h5>
                            {loc.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2">{loc.description}</p>
                            )}
                            {(loc.sizeWidth || loc.sizeHeight) && (
                              <p className="text-xs text-muted-foreground">
                                {formatWxH(loc.sizeWidth, loc.sizeHeight, loc.sizeUnit, preferredSystem)}
                              </p>
                            )}
                            <div className="flex gap-2 mt-2">
                              {loc.templateFileUrl && (
                                <a href={loc.templateFileUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                                  <Button size="sm" variant="outline" className="gap-1 text-xs">
                                    <Download className="h-3 w-3" /> Template
                                  </Button>
                                </a>
                              )}
                              <Button size="sm" className="flex-1 gap-1.5" style={{ backgroundColor: buttonColor, color: "#fff" }}>
                                <MapPin className="h-3.5 w-3.5" /> Submit Artwork
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            );
          }

          if (section.sectionType === "event_materials") {
            return renderCTASection(section, "event_materials", "Request Event Materials");
          }

          if (section.sectionType === "immersive") {
            return renderCTASection(section, "immersive", "Explore Immersive");
          }

          if (section.sectionType === "fabrication") {
            return renderCTASection(section, "fabrication", "Request Fabrication");
          }

          if (section.sectionType === "open_request") {
            return renderCTASection(section, "open_request", "Submit Request");
          }

          if (section.sectionType === "partner_deck" && partner.partnerDeckFileUrl) {
            return (
              <section key={section.id} id={`section-${section.sectionType}`} className="scroll-mt-20">
                <Card style={{ borderRadius }}>
                  <CardContent className="p-6 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${primaryColor}10` }}>
                      <FileText className="h-6 w-6" style={{ color: primaryColor }} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{section.title || SECTION_LABELS.partner_deck}</h3>
                      {section.description && <p className="text-sm text-muted-foreground">{section.description}</p>}
                    </div>
                    <a href={partner.partnerDeckFileUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" className="gap-1.5">
                        <Download className="h-4 w-4" /> Download
                      </Button>
                    </a>
                  </CardContent>
                </Card>
              </section>
            );
          }

          if (section.sectionType === "capabilities" && partner.capabilitiesLink) {
            return (
              <section key={section.id} id={`section-${section.sectionType}`} className="scroll-mt-20">
                <Card style={{ borderRadius }}>
                  <CardContent className="p-6 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${primaryColor}10` }}>
                      <Layers className="h-6 w-6" style={{ color: primaryColor }} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{section.title || SECTION_LABELS.capabilities}</h3>
                      {section.description && <p className="text-sm text-muted-foreground">{section.description}</p>}
                    </div>
                    <a href={partner.capabilitiesLink} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" className="gap-1.5">
                        <ExternalLink className="h-4 w-4" /> View
                      </Button>
                    </a>
                  </CardContent>
                </Card>
              </section>
            );
          }

          return null;
        })}
      </div>

      <footer className="border-t py-6" style={{ backgroundColor: `${primaryColor}05` }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between text-xs text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} {partner.companyName}</span>
          {partner.smallA3BadgeEnabled && (
            <div className="flex items-center gap-1.5">
              <span>Powered by</span>
              <div className="h-4 w-4 rounded flex items-center justify-center text-[8px] font-bold" style={{ backgroundColor: primaryColor, color: "#fff" }}>A3</div>
              <span>Visual</span>
            </div>
          )}
        </div>
      </footer>

      {activeDialog && (
        <RequestFormDialog
          open={true}
          onClose={() => { setActiveDialog(null); setSelectedProduct(null); setSelectedLocation(null); }}
          title={activeDialog.title}
          slug={slug}
          endpoint={activeDialog.endpoint}
          extraFields={activeDialog.extra}
          themeColor={primaryColor}
          {...activeDialog.props}
        />
      )}
    </div>
  );
}
