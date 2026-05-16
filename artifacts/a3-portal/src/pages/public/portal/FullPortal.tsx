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
import { resolveBranding } from "@/components/branding/usePartnerBranding";
import { PartnerPortalHeader } from "@/components/branding/PartnerPortalHeader";
import { PortalFooter } from "@/components/branding/PortalFooter";
import { PortalCard } from "@/components/branding/PortalCard";
import { PortalCTA } from "@/components/branding/PortalCTA";
import { CARD_STYLE_MAP, BORDER_RADIUS_MAP } from "@/components/branding/templateDefaults";

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
  const branding = resolveBranding(theme);
  const primaryColor = branding.primary;
  const accentColor = branding.accent;
  const bgColor = branding.background;
  const buttonColor = branding.button;
  const textColor = branding.text;
  const borderRadius = branding.radius;
  const headingFont = branding.headingFont;
  const bodyFont = branding.bodyFont;

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
        <div
          className="overflow-hidden"
          style={{
            borderRadius,
            backgroundColor: branding.isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
            border: `1px solid ${branding.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
          }}
        >
          <div
            className="p-6 sm:p-8"
            style={{ background: branding.isDark ? `linear-gradient(135deg, ${primaryColor}15, ${accentColor}10)` : `linear-gradient(135deg, ${primaryColor}08, ${accentColor}08)` }}
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${accentColor}20` }}>
                <Icon className="h-6 w-6" style={{ color: accentColor }} />
              </div>
              <div className="flex-1 space-y-2">
                <h3 className="text-xl sm:text-2xl font-bold" style={{ color: branding.text, fontFamily: headingFont }}>{section.title || SECTION_LABELS[sectionType]}</h3>
                {section.subtitle && <p style={{ color: branding.muted }}>{section.subtitle}</p>}
                {section.description && (
                  <p className="text-sm max-w-xl" style={{ color: branding.muted }}>{section.description}</p>
                )}
                <PortalCTA branding={branding} label={ctaLabel} size="md" onClick={() => openSectionDialog(sectionType, section.title || SECTION_LABELS[sectionType])}>
                  <Icon className="h-4 w-4 mr-1.5 inline" /> {ctaLabel}
                </PortalCTA>
              </div>
              {section.featuredImageUrl && (
                <img src={section.featuredImageUrl} alt="" className="hidden lg:block w-40 h-28 object-cover rounded-lg" />
              )}
            </div>
          </div>
        </div>
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
      <PartnerPortalHeader
        partnerName={partner.companyName}
        partnerLogoUrl={partner.logoUrl}
        branding={branding}
        defaultHeadline={partner.introHeadline || `Welcome to the ${partner.companyName} Partner Portal`}
        defaultSubheadline={partner.introText || ""}
        ctaSlot={
          <>
            {partner.capabilitiesLink && (
              <a href={partner.capabilitiesLink} target="_blank" rel="noopener noreferrer">
                <PortalCTA branding={branding} label={branding.ctaLabel || "A3 Capabilities"} variant="outline" size="lg" />
              </a>
            )}
            {partner.partnerDeckFileUrl && (
              <a href={partner.partnerDeckFileUrl} target="_blank" rel="noopener noreferrer">
                <PortalCTA branding={branding} label={branding.secondaryCtaLabel || "Partner Deck"} variant="outline" size="lg" />
              </a>
            )}
          </>
        }
      />

      {(partner.globalSizzleReelUrl || partner.partnerVideoUrl) && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 -mt-8 relative z-10">
          <div className="aspect-video rounded-xl overflow-hidden shadow-2xl" style={{ border: `4px solid ${branding.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.8)'}` }}>
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
          <div className={`grid grid-cols-2 sm:grid-cols-3 ${availableQuickActions.length >= 5 ? "lg:grid-cols-5" : availableQuickActions.length === 4 ? "lg:grid-cols-4" : availableQuickActions.length === 3 ? "lg:grid-cols-3" : availableQuickActions.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-1"} gap-3`}>
            {availableQuickActions.map(type => {
              const Icon = SECTION_ICONS[type] || Package;
              const sectionData = sectionMap.get(type);
              const label = sectionData?.title || QUICK_ACTION_LABELS[type] || SECTION_LABELS[type];
              return (
                <button
                  key={type}
                  onClick={() => scrollToSection(type)}
                  className="group p-4 rounded-xl hover:shadow-lg transition-all text-left space-y-2"
                  style={{
                    borderRadius,
                    backgroundColor: branding.isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
                    border: `1px solid ${branding.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                  }}
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accentColor}20` }}>
                    <Icon className="h-5 w-5" style={{ color: accentColor }} />
                  </div>
                  <p className="text-sm font-semibold leading-tight" style={{ color: branding.text }}>{label}</p>
                  <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" style={{ color: branding.muted }} />
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
                        <div
                          key={product.id}
                          className="overflow-hidden hover:shadow-lg transition-all group cursor-pointer hover:-translate-y-0.5"
                          style={{
                            borderRadius,
                            backgroundColor: branding.isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                            border: `1px solid ${branding.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                          }}
                          onClick={() => openProductDialog(product)}
                        >
                          <div className="aspect-[4/3] overflow-hidden" style={{ backgroundColor: branding.isDark ? 'rgba(255,255,255,0.03)' : '#f1f5f9' }}>
                            {product.imageUrl ? (
                              <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <img
                                  src={`${import.meta.env.BASE_URL}brand/a3-lockup-on-light.jpeg`}
                                  alt="A3 Visual"
                                  className="max-w-[70%] max-h-[60%] object-contain opacity-80 group-hover:scale-105 transition-transform duration-300"
                                />
                              </div>
                            )}
                          </div>
                          <div className="p-4 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <h5 className="font-semibold text-sm" style={{ color: branding.text }}>{product.name}</h5>
                              {product.sizeOptionsJson && product.sizeOptionsJson.length > 0 && (
                                <Badge variant="outline" className="text-[10px] shrink-0">{product.sizeOptionsJson.length} sizes</Badge>
                              )}
                            </div>
                            {product.description && (
                              <p className="text-xs line-clamp-2" style={{ color: branding.muted }}>{product.description}</p>
                            )}
                            <PortalCTA branding={branding} size="sm" className="w-full mt-2">
                              <ShoppingBag className="h-3.5 w-3.5 mr-1.5 inline" /> Request Quote
                            </PortalCTA>
                          </div>
                        </div>
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
                        <div
                          key={loc.id}
                          className="overflow-hidden hover:shadow-lg transition-all group cursor-pointer hover:-translate-y-0.5"
                          style={{
                            borderRadius,
                            backgroundColor: branding.isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                            border: `1px solid ${branding.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                          }}
                          onClick={() => openBrandingDialog(loc)}
                        >
                          {loc.previewImageUrl ? (
                            <div className="aspect-[4/3] overflow-hidden" style={{ backgroundColor: branding.isDark ? 'rgba(255,255,255,0.03)' : '#f1f5f9' }}>
                              <img src={loc.previewImageUrl} alt={loc.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            </div>
                          ) : (
                            <div className="aspect-[4/3] flex items-center justify-center" style={{ backgroundColor: branding.isDark ? 'rgba(255,255,255,0.03)' : '#f1f5f9' }}>
                              <MapPin className="h-10 w-10" style={{ color: branding.muted + '4d' }} />
                            </div>
                          )}
                          <div className="p-4 space-y-2">
                            <h5 className="font-semibold text-sm" style={{ color: branding.text }}>{loc.name}</h5>
                            {loc.description && (
                              <p className="text-xs line-clamp-2" style={{ color: branding.muted }}>{loc.description}</p>
                            )}
                            {(loc.sizeWidth || loc.sizeHeight) && (
                              <p className="text-xs" style={{ color: branding.muted }}>
                                {formatWxH(loc.sizeWidth, loc.sizeHeight, loc.sizeUnit, preferredSystem)}
                              </p>
                            )}
                            <div className="flex gap-2 mt-2">
                              {loc.templateFileUrl && (
                                <a href={loc.templateFileUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                                  <PortalCTA branding={branding} variant="outline" size="sm">
                                    <Download className="h-3 w-3 mr-1 inline" /> Template
                                  </PortalCTA>
                                </a>
                              )}
                              <PortalCTA branding={branding} size="sm" className="flex-1">
                                <MapPin className="h-3.5 w-3.5 mr-1.5 inline" /> Submit Artwork
                              </PortalCTA>
                            </div>
                          </div>
                        </div>
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
                <div
                  className="p-6 flex items-center gap-4"
                  style={{
                    borderRadius,
                    backgroundColor: branding.isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                    border: `1px solid ${branding.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                  }}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${primaryColor}${branding.isDark ? '25' : '10'}` }}>
                    <FileText className="h-6 w-6" style={{ color: branding.accent }} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold" style={{ color: branding.text, fontFamily: headingFont }}>{section.title || SECTION_LABELS.partner_deck}</h3>
                    {section.description && <p className="text-sm" style={{ color: branding.muted }}>{section.description}</p>}
                  </div>
                  <a href={partner.partnerDeckFileUrl} target="_blank" rel="noopener noreferrer">
                    <PortalCTA branding={branding} variant="outline" size="md">
                      <Download className="h-4 w-4 mr-1.5 inline" /> Download
                    </PortalCTA>
                  </a>
                </div>
              </section>
            );
          }

          if (section.sectionType === "capabilities" && partner.capabilitiesLink) {
            return (
              <section key={section.id} id={`section-${section.sectionType}`} className="scroll-mt-20">
                <div
                  className="p-6 flex items-center gap-4"
                  style={{
                    borderRadius,
                    backgroundColor: branding.isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                    border: `1px solid ${branding.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                  }}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${primaryColor}${branding.isDark ? '25' : '10'}` }}>
                    <Layers className="h-6 w-6" style={{ color: branding.accent }} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold" style={{ color: branding.text, fontFamily: headingFont }}>{section.title || SECTION_LABELS.capabilities}</h3>
                    {section.description && <p className="text-sm" style={{ color: branding.muted }}>{section.description}</p>}
                  </div>
                  <a href={partner.capabilitiesLink} target="_blank" rel="noopener noreferrer">
                    <PortalCTA branding={branding} variant="outline" size="md">
                      <ExternalLink className="h-4 w-4 mr-1.5 inline" /> View
                    </PortalCTA>
                  </a>
                </div>
              </section>
            );
          }

          return null;
        })}
      </div>

      <PortalFooter partnerName={partner.companyName} branding={branding} />

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
