import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch, resolveAssetUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductImage } from "@/components/branding/ProductImage";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ChevronRight, ChevronLeft, Calendar, MapPin, Package, Plus, Minus, Check, Upload, ShoppingCart, Sparkles, X, Ruler, AlertTriangle, ZoomIn } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatWxHDual, formatPrimarySecondary, computePrice, convert, PRICING_UNIT_LABELS, type UnitSystem, type LengthUnit, type PricingModel, type PricingUnit } from "@/lib/units";
import { BrandedShell } from "@/components/branding/BrandedShell";
import { resolveBranding } from "@/components/branding/usePartnerBranding";
import { PartnerLogo } from "@/components/branding/PartnerLogo";
import { PortalNavbar } from "@/components/branding/PortalNavbar";
import { PortalFooter } from "@/components/branding/PortalFooter";
import { PortalCTA } from "@/components/branding/PortalCTA";

type City = { id: number; name: string; state: string | null };
type Venue = { id: number; cityId: number | null; name: string; venueAddress: string | null; shippingAddress: string | null };
type Event = { id: number; cityId: number | null; venueId: number | null; name: string; eventStartDate: string | null; eventEndDate: string | null; shippingDeadline: string | null; status: string; availablePackageIdsJson: number[] | null };
type PkgItem = { id: number; productId: number; productName: string | null; productCategory: string | null; productImageUrl: string | null; quantity: number; isOptional: boolean };
type Pkg = { id: number; name: string; displayName: string | null; description: string | null; tier: number; price: string | null; imageUrl: string | null; imageUrls: string[] | null; items: PkgItem[] };
type Product = {
  id: number; name: string; category: string; imageUrl: string | null; sku: string | null;
  rentalEligible: boolean | null; printOnlyAvailable: boolean | null;
  pricingModel: string | null; unitRate: string | number | null; pricingUnit: string | null;
  minBillableSize: number | null; minCharge: string | number | null; allowsCustomSize: boolean | null;
  sizeWidthMm: string | number | null; sizeHeightMm: string | number | null;
};
type Partner = { id: number; companyName: string; logoUrl?: string | null; secondaryLogoUrl?: string | null; introHeadline: string | null; introText: string | null; pricingDisplayEnabled: boolean | null; thankYouText?: string | null; replyToEmail?: string | null; contactEmail?: string | null };
type ThemeShape = { primaryColor?: string | null; secondaryColor?: string | null; accentColor?: string | null; backgroundColor?: string | null; buttonColor?: string | null; textColor?: string | null; headingFont?: string | null; bodyFont?: string | null; borderRadius?: string | null } | null;
type EventAddonItem = { productId: number; isFeatured: boolean; isActive: boolean; sortOrder: number; categoryOverride?: string | null; effectiveCategory?: string | null };
type EventAddons = {
  eventId: number;
  partnerId?: number;
  inheritance?: "inherit" | "override";
  addons?: EventAddonItem[];
  partnerAddonCount?: number;
  // Section 36: display config
  displayFormat?: "flat" | "grid" | "category_tiles";
  displayFormatSource?: "event_override" | "partner_default";
  partnerDefaultFormat?: string;
  categoryGroupingEnabled?: boolean;
  categoryFilter?: string[];
  categoryOrder?: string[];
  addonsByCategory?: Array<{ category: string; addons: EventAddonItem[] }>;
};
type Data = { partner: Partner; theme?: ThemeShape; cities: City[]; venues: Venue[]; events: Event[]; packages: Pkg[]; products: Product[]; eventAddons?: EventAddons[] };

type CartItem = {
  key: string; itemType: "product" | "package" | "branding_zone";
  productId?: number | null; packageId?: number; name: string; quantity: number;
  unitPrice?: string | null; productImageUrl?: string | null;
  customWidth?: number | null; customHeight?: number | null; customSizeUnit?: LengthUnit | null;
  pricingBasis?: string | null;
  surveyAssetId?: number | null;
  selectedMaterial?: string | null;
};

const STEPS = ["Event", "Package", "Add-ons", "Artwork", "Contact", "Review"] as const;

/**
 * Section 36: format-aware add-on renderer.
 *
 * - "flat"            → vertical list (compact, image+name+add button on each row)
 * - "grid" (default)  → existing card grid
 * - "category_tiles"  → big tiles per category; clicking a tile expands its
 *                       products inline. Defaults to a single auto-expanded
 *                       category when only one exists.
 *
 * When the partner has no add-on library yet, we fall back to the grid layout
 * over `addonProducts` (legacy behaviour from Section 35) and skip grouping.
 */
function AddonRenderer({
  addonProducts,
  eventAddonRow,
  partnerHasAddonLibrary,
  addToCart,
}: {
  addonProducts: Product[];
  eventAddonRow: EventAddons | null;
  partnerHasAddonLibrary: boolean;
  addToCart: (p: Product) => void;
}) {
  const format: "flat" | "grid" | "category_tiles" =
    (eventAddonRow?.displayFormat as any) || "grid";
  const groupingEnabled = !!eventAddonRow?.categoryGroupingEnabled;
  const productById = useMemo(() => {
    const m = new Map<number, Product>();
    for (const p of addonProducts) m.set(p.id, p);
    return m;
  }, [addonProducts]);

  // Resolve grouped products from the API payload, intersecting with the
  // visible addonProducts list (which already excludes products already in
  // the package). If the partner has no curated library yet we synthesise
  // a single bucket from the legacy product list.
  const groups = useMemo(() => {
    if (partnerHasAddonLibrary && eventAddonRow?.addonsByCategory?.length) {
      return eventAddonRow.addonsByCategory
        .map(g => ({
          category: g.category,
          products: g.addons
            .map(a => productById.get(a.productId))
            .filter((p): p is Product => !!p),
        }))
        .filter(g => g.products.length > 0);
    }
    // Legacy / fallback: group by product.category if grouping is enabled,
    // otherwise a single bucket.
    if (!groupingEnabled || format !== "category_tiles") {
      return [{ category: "All", products: addonProducts }];
    }
    const byCat = new Map<string, Product[]>();
    for (const p of addonProducts) {
      const k = p.category || "Uncategorized";
      if (!byCat.has(k)) byCat.set(k, []);
      byCat.get(k)!.push(p);
    }
    return Array.from(byCat.entries())
      .sort(([a], [b]) => (a === "Uncategorized" ? 1 : b === "Uncategorized" ? -1 : a.localeCompare(b)))
      .map(([category, products]) => ({ category, products }));
  }, [eventAddonRow, partnerHasAddonLibrary, productById, addonProducts, format, groupingEnabled]);

  // Tile expansion state — auto-expand if there's only one category so the
  // user isn't forced to click for nothing.
  const [openCat, setOpenCat] = useState<string | null>(null);
  useEffect(() => {
    if (format === "category_tiles" && groups.length === 1) setOpenCat(groups[0].category);
  }, [format, groups]);

  const ProductCard = (p: Product) => (
    <button key={p.id} type="button" onClick={() => addToCart(p)} className="text-left p-3 rounded-lg border hover:border-primary/40 hover:shadow-md transition bg-card">
      <ProductImage src={p.imageUrl} alt={p.name} className="aspect-square w-full rounded object-cover mb-2 bg-muted" fallbackClassName="aspect-square w-full rounded bg-muted mb-2 overflow-hidden" />
      <div className="text-xs text-muted-foreground">{p.category}</div>
      <div className="text-sm font-medium line-clamp-2">{p.name}</div>
      <Button size="sm" variant="outline" className="w-full mt-2 h-7 text-xs gap-1"><Plus className="h-3 w-3" />Add</Button>
    </button>
  );

  const ProductRow = (p: Product) => (
    <button key={p.id} type="button" onClick={() => addToCart(p)} className="w-full flex items-center gap-3 p-2 rounded-lg border hover:border-primary/40 hover:bg-muted/30 transition bg-card text-left">
      <ProductImage src={p.imageUrl} alt={p.name} className="h-12 w-12 rounded object-cover bg-muted" fallbackClassName="h-12 w-12 rounded bg-muted overflow-hidden" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{p.name}</div>
        <div className="text-xs text-muted-foreground truncate">{p.category}</div>
      </div>
      <Button size="sm" variant="outline" className="h-7 text-xs gap-1"><Plus className="h-3 w-3" />Add</Button>
    </button>
  );

  if (addonProducts.length === 0) return null;

  if (format === "flat") {
    if (groupingEnabled && groups.length > 1) {
      return (
        <div className="space-y-4">
          {groups.map(g => (
            <div key={g.category}>
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">{g.category}</div>
              <div className="space-y-2">{g.products.map(ProductRow)}</div>
            </div>
          ))}
        </div>
      );
    }
    return <div className="space-y-2">{addonProducts.map(ProductRow)}</div>;
  }

  if (format === "category_tiles") {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {groups.map(g => {
            const isOpen = openCat === g.category;
            const cover = g.products.find(p => !!p.imageUrl)?.imageUrl || null;
            return (
              <button
                key={g.category}
                type="button"
                onClick={() => setOpenCat(isOpen ? null : g.category)}
                className={`relative text-left p-0 rounded-lg border overflow-hidden transition shadow-sm hover:shadow-md ${isOpen ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/40"}`}
              >
                <ProductImage src={cover} alt={g.category} className="aspect-[4/3] w-full object-cover" fallbackClassName="aspect-[4/3] w-full bg-muted overflow-hidden" />
                <div className="p-3">
                  <div className="text-sm font-semibold">{g.category}</div>
                  <div className="text-[11px] text-muted-foreground">{g.products.length} item{g.products.length === 1 ? "" : "s"}</div>
                </div>
              </button>
            );
          })}
        </div>
        {openCat && (() => {
          const g = groups.find(x => x.category === openCat);
          if (!g) return null;
          return (
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold">{g.category}</div>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpenCat(null)}>
                  <X className="h-3.5 w-3.5 mr-1" />Close
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {g.products.map(ProductCard)}
              </div>
            </div>
          );
        })()}
      </div>
    );
  }

  // "grid" — default
  if (groupingEnabled && groups.length > 1) {
    return (
      <div className="space-y-5">
        {groups.map(g => (
          <div key={g.category}>
            <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">{g.category}</div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">{g.products.map(ProductCard)}</div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {addonProducts.map(ProductCard)}
    </div>
  );
}

export default function OrderingPortal({ slug }: { slug: string }) {
  const { toast } = useToast();
  const { data, isLoading, isError } = useQuery<Data>({ queryKey: [`/api/public/partners/${slug}/ordering`], queryFn: () => apiFetch(`/api/public/partners/${slug}/ordering`) });

  const [step, setStep] = useState(0);
  const [eventId, setEventId] = useState<number | null>(null);
  const [cityId, setCityId] = useState<number | null>(null);
  const [venueId, setVenueId] = useState<number | null>(null);
  const [selectedPkgId, setSelectedPkgId] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [artworkFiles, setArtworkFiles] = useState<{ name: string; url: string }[]>([]);
  const [artworkUrlInput, setArtworkUrlInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadArtwork = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      const uploaded: { name: string; url: string }[] = [];
      for (const file of Array.from(fileList)) {
        if (file.size > 50 * 1024 * 1024) {
          throw new Error(`${file.name} exceeds 50MB limit`);
        }
        const r = await fetch("/api/storage/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
        });
        if (!r.ok) throw new Error(`Failed to prepare upload for ${file.name}`);
        const { uploadURL, objectPath } = await r.json();
        if (!uploadURL || !objectPath) throw new Error(`Invalid upload response for ${file.name}`);
        const put = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
        if (!put.ok) throw new Error(`Upload failed for ${file.name}`);
        uploaded.push({ name: file.name, url: objectPath });
      }
      setArtworkFiles(prev => [...prev, ...uploaded]);
    } catch (e: any) {
      setUploadError(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };
  const [contact, setContact] = useState({ contactName: "", contactEmail: "", contactPhone: "", companyName: "", notes: "" });
  const [addonRequest, setAddonRequest] = useState("");
  const [submitted, setSubmitted] = useState<{ orderNumber: string; email?: { confirmation: boolean; forward: boolean; warnings: string[] } } | null>(null);

  const submit = useMutation({
    mutationFn: (body: any) => apiFetch(`/api/public/partners/${slug}/orders`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (res: any) => { setSubmitted({ orderNumber: res.orderNumber, email: res.email }); window.scrollTo(0, 0); },
    onError: (e: any) => {
      // Section 26: server returns 409 HARDWARE_REQUIRED when partner-owned
      // hardware (tent frames, etc.) is exhausted. Auto-add the hardware
      // product to the cart so the partner can re-submit immediately.
      if (e?.status === 409 && e?.body?.code === "HARDWARE_REQUIRED" && data) {
        const hwId = e.body.hardwareProductId as number | undefined;
        const hwProduct = hwId ? data.products.find(p => p.id === hwId) : null;
        // Only auto-add if we actually changed the cart — otherwise the partner
        // already has the hardware in cart yet supply is still short, which
        // means a real shortage they need to know about.
        if (hwProduct && !cart.find(c => c.productId === hwProduct.id)) {
          setCart(prev => [...prev, {
            key: `hw-${hwProduct.id}-${Date.now()}`, itemType: "product",
            productId: hwProduct.id, name: hwProduct.name, quantity: e.body.needed || 1,
            productImageUrl: hwProduct.imageUrl, customSizeUnit: null,
          } as CartItem]);
          toast({
            title: "New hardware added to your order",
            description: `${e.body.familyName ?? "Hardware"} stock is exhausted — added ${hwProduct.name} so the order can ship complete. Tap Submit again.`,
          });
          return;
        }
        toast({
          title: "Hardware shortage",
          description: e.body.error || "Not enough partner-owned hardware for this order.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Submission failed", description: e.message, variant: "destructive" });
    },
  });

  // Section 26: family context for products in the cart so we can show inline
  // "uses your existing tent frame (X of Y left)" or "new frame required" hints.
  const cartProductIds = useMemo(() => Array.from(new Set(cart.map(c => c.productId).filter((x): x is number => !!x))), [cart]);
  const partnerIdForFamily = data?.partner?.id;
  const familyContextQueries = useQuery<Record<number, any>>({
    queryKey: ["family-context", partnerIdForFamily, cartProductIds.join(",")],
    enabled: !!partnerIdForFamily && cartProductIds.length > 0,
    queryFn: async () => {
      const out: Record<number, any> = {};
      await Promise.all(cartProductIds.map(async pid => {
        try { out[pid] = await apiFetch(`/api/public/partners/${slug}/products/${pid}/family-context`); } catch { /* noop */ }
      }));
      return out;
    },
  });

  const selectedEvent = useMemo(() => data?.events.find(e => e.id === eventId), [data, eventId]);
  const selectedVenue = useMemo(() => data?.venues.find(v => v.id === venueId), [data, venueId]);
  const selectedPkg = useMemo(() => data?.packages.find(p => p.id === selectedPkgId), [data, selectedPkgId]);
  const totalEstimate = useMemo(() => {
    let t = 0;
    if (selectedPkg?.price) t += parseFloat(selectedPkg.price);
    cart.forEach(c => { if (c.unitPrice) t += parseFloat(c.unitPrice) * c.quantity; });
    return t;
  }, [cart, selectedPkg]);

  // ---------------------------------------------------------------------------
  // IMPORTANT: All hooks must run BEFORE the conditional early returns below.
  // Previously `eventAddonRow` and `addonProducts` (useMemo calls) lived AFTER
  // the loading/error short-circuits, which meant they were skipped on the
  // first render (when data was still loading) but then ran on the second
  // render (when data arrived). React detected the changing hook count and
  // threw a "Rules of Hooks" violation, which crashed the entire portal —
  // hence the empty Preview tab. Hoist these hooks here and tolerate
  // `data === undefined` with safe defaults so they're identical across renders.
  // ---------------------------------------------------------------------------
  const eventAddonRow = useMemo(
    () => data?.eventAddons?.find(e => e.eventId === eventId) || null,
    [data, eventId],
  );
  const partnerHasAddonLibrary = (eventAddonRow?.partnerAddonCount ?? 0) > 0;
  const addonProducts = useMemo(() => {
    const products = data?.products ?? [];
    const inPackage = (id: number) => !!selectedPkg?.items.some(it => it.productId === id);
    if (partnerHasAddonLibrary && eventAddonRow?.addons) {
      const sorted = [...eventAddonRow.addons].sort((a, b) =>
        Number(b.isFeatured) - Number(a.isFeatured) || a.sortOrder - b.sortOrder
      );
      return sorted
        .map(a => products.find(p => p.id === a.productId))
        .filter((p): p is Product => !!p && !inPackage(p.id));
    }
    return products.filter(p => !inPackage(p.id));
  }, [data, selectedPkg, eventAddonRow, partnerHasAddonLibrary]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (isError || !data) return <div className="min-h-screen flex items-center justify-center"><Card className="p-10 max-w-md text-center"><p className="text-lg font-semibold">We couldn't load this portal.</p><p className="text-sm text-muted-foreground mt-2">Please check the link or try again shortly.</p></Card></div>;

  // Resolve branding once for use in conditional success view + main flow.
  const branding = resolveBranding(data.theme);

  if (submitted) {
    const emailFailed = submitted.email && (!submitted.email.confirmation || !submitted.email.forward);
    return (
      <BrandedShell theme={data.theme}>
        <div className="min-h-screen flex items-center justify-center p-6">
          <Card className="max-w-lg p-10 text-center shadow-xl" style={{ borderColor: `${branding.primary}26` }}>
            <div className="mb-4 flex justify-center"><PartnerLogo src={data.partner.logoUrl} name={data.partner.companyName} size={56} /></div>
            <div className="h-16 w-16 mx-auto rounded-full flex items-center justify-center mb-4" style={{ background: `${branding.accent}26` }}>
              <Check className="h-8 w-8" style={{ color: branding.primary }} />
            </div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: branding.text, fontFamily: branding.headingFont }}>Order received!</h1>
            <p className="mb-4" style={{ color: branding.muted }}>
              {data.partner.thankYouText || `Your order has been submitted. ${data.partner.companyName} will reach out shortly to confirm details.`}
            </p>
            <div className="rounded-lg p-4 mb-6" style={{ background: branding.background, border: `1px solid ${branding.primary}1a` }}>
              <div className="text-xs" style={{ color: branding.muted }}>Order Number</div>
              <div className="font-mono font-bold text-lg" style={{ color: branding.text }}>{submitted.orderNumber}</div>
            </div>
            {emailFailed && (
              <div className="mb-4 rounded-lg p-3 text-left text-xs flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-900">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold">Order saved — confirmation email is being retried.</div>
                  <div className="mt-0.5">Your order is recorded as <strong>{submitted.orderNumber}</strong>. The team has been notified directly.</div>
                </div>
              </div>
            )}
            {!emailFailed && submitted.email?.confirmation && (
              <div className="mb-4 text-xs" style={{ color: branding.muted }}>A confirmation email is on the way to your inbox.</div>
            )}
            <Button onClick={() => { setSubmitted(null); setStep(0); setCart([]); setSelectedPkgId(null); setEventId(null); setArtworkFiles([]); setContact({ contactName: "", contactEmail: "", contactPhone: "", companyName: "", notes: "" }); setAddonRequest(""); }} style={{ background: branding.button, color: branding.buttonText }}>
              Place another order
            </Button>
          </Card>
        </div>
      </BrandedShell>
    );
  }

  const upcomingEvents = data.events.filter(e => e.status === "upcoming" || e.status === "live");
  const venuesForCity = cityId ? data.venues.filter(v => v.cityId === cityId) : [];
  const availablePkgs = selectedEvent?.availablePackageIdsJson?.length ? data.packages.filter(p => selectedEvent.availablePackageIdsJson!.includes(p.id)) : data.packages;

  // Note: `eventAddonRow`, `partnerHasAddonLibrary`, and `addonProducts` are
  // computed earlier (above the loading/error early returns) so their useMemo
  // hooks always run on every render. See the "Rules of Hooks" comment above.

  function priceCart(p: Product, item: Partial<CartItem>) {
    if (!p.pricingModel) return { unitPrice: null as string | null, basis: null as string | null };
    const u = item.customSizeUnit ?? null;
    const wMm = item.customWidth != null && u ? convert(item.customWidth, u, "mm") : (p.sizeWidthMm != null ? Number(p.sizeWidthMm) : null);
    const hMm = item.customHeight != null && u ? convert(item.customHeight, u, "mm") : (p.sizeHeightMm != null ? Number(p.sizeHeightMm) : null);
    const r = computePrice({
      pricingModel: p.pricingModel as PricingModel,
      unitRate: p.unitRate,
      pricingUnit: p.pricingUnit as PricingUnit | null,
      widthMm: wMm, heightMm: hMm,
      quantity: item.quantity ?? 1,
      minBillableSize: p.minBillableSize,
      minCharge: p.minCharge,
    });
    return { unitPrice: r.unitPrice != null ? String(r.unitPrice) : null, basis: r.basis || null };
  }

  const addToCart = (p: Product) => {
    setCart(prev => {
      const customSize = !!p.allowsCustomSize && p.pricingModel !== "fixed" && p.pricingModel !== "quantity";
      // Don't dedupe custom-size lines — each entry has its own dimensions.
      const existing = !customSize ? prev.find(c => c.productId === p.id && !c.customWidth) : null;
      if (existing) {
        return prev.map(c => c === existing ? {
          ...c, quantity: c.quantity + 1,
          ...priceCart(p, { ...c, quantity: c.quantity + 1 }),
        } : c);
      }
      const initial: CartItem = {
        key: `prod-${p.id}-${Date.now()}`, itemType: "product",
        productId: p.id, name: p.name, quantity: 1, productImageUrl: p.imageUrl,
        customWidth: customSize ? null : null,
        customHeight: customSize ? null : null,
        customSizeUnit: customSize ? "m" : null,
      };
      const priced = priceCart(p, initial);
      return [...prev, { ...initial, unitPrice: priced.unitPrice, pricingBasis: priced.basis }];
    });
  };
  const updateQty = (key: string, delta: number) => setCart(prev => prev.map(c => {
    if (c.key !== key) return c;
    const q = Math.max(1, c.quantity + delta);
    const p = data.products.find(pp => pp.id === c.productId);
    const next = { ...c, quantity: q };
    if (p?.pricingModel) Object.assign(next, priceCart(p, next));
    return next;
  }));
  const updateCustomSize = (key: string, patch: Partial<Pick<CartItem, "customWidth" | "customHeight" | "customSizeUnit">>) => setCart(prev => prev.map(c => {
    if (c.key !== key) return c;
    const p = data.products.find(pp => pp.id === c.productId);
    const next = { ...c, ...patch };
    if (p?.pricingModel) {
      const priced = priceCart(p, next);
      next.unitPrice = priced.unitPrice;
      next.pricingBasis = priced.basis;
    }
    return next;
  }));
  const removeFromCart = (key: string) => setCart(prev => prev.filter(c => c.key !== key));

  const canAdvance = () => {
    if (step === 0) return eventId !== null || (cityId !== null && venueId !== null);
    if (step === 1) return selectedPkgId !== null;
    if (step === 4) return contact.contactName && contact.contactEmail;
    return true;
  };

  const handleSubmit = () => {
    const items: any[] = [];
    if (selectedPkg) {
      items.push({ itemType: "package", packageId: selectedPkg.id, name: selectedPkg.displayName || selectedPkg.name, quantity: 1, unitPrice: selectedPkg.price });
      selectedPkg.items.forEach(it => items.push({ itemType: "product", productId: it.productId, name: it.productName || `Product ${it.productId}`, quantity: it.quantity }));
    }
    cart.forEach(c => items.push({
      itemType: "product", productId: c.productId, name: c.name,
      quantity: c.quantity, unitPrice: c.unitPrice,
      customWidth: c.customWidth ?? null,
      customHeight: c.customHeight ?? null,
      customSizeUnit: c.customSizeUnit ?? null,
      surveyAssetId: c.surveyAssetId ?? null,
      selectedMaterial: c.selectedMaterial ?? null,
    }));

    const addonReqTrim = addonRequest.trim();
    const mergedNotes = addonReqTrim
      ? `${contact.notes ? contact.notes.trim() + "\n\n" : ""}Custom add-on request:\n${addonReqTrim}`
      : contact.notes;

    submit.mutate({
      eventId, packageId: selectedPkgId, shippingVenueId: venueId,
      shippingAddress: selectedVenue ? { address: selectedVenue.shippingAddress || selectedVenue.venueAddress, venueName: selectedVenue.name } : null,
      ...contact, notes: mergedNotes, items, artworkFiles, totalEstimate: totalEstimate > 0 ? totalEstimate.toFixed(2) : null,
    });
  };

  const summaryItemCount = (selectedPkg ? 1 : 0) + cart.length;

  return (
    <BrandedShell theme={data.theme}>
      {(data as any)?.previewMode && (
        <div className="bg-blue-600 text-white text-xs sm:text-sm px-4 py-2 text-center font-medium">
          Preview mode — this portal is visible for review only. Submissions are disabled until it goes live.
        </div>
      )}
      <PortalNavbar
        partnerName={data.partner.companyName}
        partnerLogoUrl={data.partner.logoUrl}
        branding={branding}
      />
      <div className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        <div className="text-center mb-8">
          <Badge className="mb-3" style={{ background: `${branding.accent}26`, color: branding.text, border: "none" }}><Sparkles className="h-3 w-3 mr-1" />Order Portal</Badge>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: branding.text, fontFamily: branding.headingFont }}>{data.partner.introHeadline || `Order with ${data.partner.companyName}`}</h1>
          {data.partner.introText && <p className="mt-2 max-w-2xl mx-auto" style={{ color: branding.muted }}>{data.partner.introText}</p>}
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-1 mb-8 flex-wrap">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
                style={
                  i === step
                    ? { background: branding.button, color: branding.buttonText }
                    : i < step
                      ? { background: `${branding.accent}26`, color: branding.text }
                      : { background: `${branding.primary}10`, color: branding.muted }
                }
              >
                <span className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">{i < step ? <Check className="h-3 w-3" /> : i + 1}</span>{s}
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground mx-1" />}
            </div>
          ))}
        </div>

        <Card className="p-6 md:p-8 shadow-lg">
          {step === 0 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold">Where is this for?</h2>
              {upcomingEvents.length > 0 && (
                <div>
                  <Label className="text-sm font-semibold mb-3 block">Upcoming events</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {upcomingEvents.map(e => {
                      const v = data.venues.find(x => x.id === e.venueId);
                      const c = data.cities.find(x => x.id === e.cityId);
                      const sel = eventId === e.id;
                      return (
                        <button key={e.id} type="button" onClick={() => { setEventId(e.id); setCityId(e.cityId); setVenueId(e.venueId); }} className={`text-left p-4 rounded-xl border-2 transition ${sel ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 bg-card"}`}>
                          <div className="flex items-center justify-between mb-2"><Badge variant={sel ? "default" : "outline"}>{e.status}</Badge>{sel && <Check className="h-4 w-4 text-primary" />}</div>
                          <div className="font-semibold">{e.name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="h-3 w-3" />{c?.name} · {v?.name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Calendar className="h-3 w-3" />{e.eventStartDate}{e.eventEndDate && e.eventEndDate !== e.eventStartDate && ` → ${e.eventEndDate}`}</div>
                          {e.shippingDeadline && <div className="text-xs text-amber-600 mt-2">Ship by {e.shippingDeadline}</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="border-t pt-6">
                <Label className="text-sm font-semibold mb-3 block">Or pick a city + venue manually</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><Label className="text-xs">City</Label>
                    <Select value={cityId?.toString() || ""} onValueChange={v => { setCityId(parseInt(v)); setVenueId(null); setEventId(null); }}><SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger><SelectContent>{data.cities.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}{c.state && `, ${c.state}`}</SelectItem>)}</SelectContent></Select>
                  </div>
                  <div><Label className="text-xs">Venue</Label>
                    <Select value={venueId?.toString() || ""} onValueChange={v => { setVenueId(parseInt(v)); setEventId(null); }} disabled={!cityId}><SelectTrigger><SelectValue placeholder={cityId ? "Select venue" : "Pick city first"} /></SelectTrigger><SelectContent>{venuesForCity.map(v => <SelectItem key={v.id} value={v.id.toString()}>{v.name}</SelectItem>)}</SelectContent></Select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold">Choose a package</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {availablePkgs.map(p => {
                  const sel = selectedPkgId === p.id;
                  return (
                    <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={sel}
                      aria-label={`Select package ${p.displayName || p.name}`}
                      onClick={() => setSelectedPkgId(p.id)}
                      onKeyDown={(e) => { if (e.currentTarget !== e.target) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedPkgId(p.id); } }}
                      className={`text-left p-5 rounded-xl border-2 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${sel ? "border-primary bg-primary/5 shadow-md" : "border-border hover:border-primary/40 bg-card"}`}
                    >
                      <PackageGallery pkg={p} />

                      <div className="flex items-center justify-between mb-2"><Badge variant={sel ? "default" : "secondary"}>Tier {p.tier}</Badge>{sel && <Check className="h-4 w-4 text-primary" />}</div>
                      <div className="font-bold text-lg">{p.displayName || p.name}</div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{p.description}</p>
                      {p.price && data.partner.pricingDisplayEnabled && <div className="text-2xl font-bold mt-3">${p.price}</div>}
                      <div className="border-t mt-3 pt-3 space-y-1">
                        {p.items.slice(0, 5).map(it => <div key={it.id} className="text-xs text-muted-foreground flex justify-between"><span className="truncate">{it.productName}</span><span className="font-semibold">{it.quantity}x</span></div>)}
                        {p.items.length > 5 && <div className="text-xs text-muted-foreground">+{p.items.length - 5} more</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {availablePkgs.length === 0 && <div className="text-center py-12 text-muted-foreground"><Package className="h-10 w-10 mx-auto mb-2 opacity-40" />No packages available for this event yet.</div>}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold">Add anything else?</h2>
              <p className="text-sm text-muted-foreground">Browse extras to add on top of your package.</p>

              {cart.length > 0 && (
                <div className="bg-muted/40 rounded-lg p-4 space-y-2">
                  <div className="text-sm font-semibold">In your add-ons ({cart.length})</div>
                  {cart.map(c => {
                    const p = data.products.find(pp => pp.id === c.productId);
                    const isCustom = !!p?.allowsCustomSize && p.pricingModel !== "fixed" && p.pricingModel !== "quantity";
                    const isQuote = p?.pricingModel === "custom_quote";
                    const fam = c.productId ? familyContextQueries.data?.[c.productId] : null;
                    return (
                      <div key={c.key} className="bg-card p-2 rounded space-y-2">
                        <div className="flex items-center gap-2">
                          {c.productImageUrl && <img src={c.productImageUrl} className="h-10 w-10 rounded object-cover" alt="" />}
                          <div className="flex-1 text-sm">
                            <div>{c.name}</div>
                            {fam?.inFamily && fam.role !== "hardware" && fam.requiresHardwareDefault && (
                              <div className={`mt-0.5 text-[11px] ${fam.availability && fam.availability.available >= (c.quantity * (fam.requiresHardwareUnits || 1)) ? "text-emerald-700" : "text-amber-700"}`}>
                                {fam.availability && fam.availability.available >= (c.quantity * (fam.requiresHardwareUnits || 1))
                                  ? `Uses your existing ${fam.familyName} hardware (${fam.availability.available} of ${fam.availability.totalOwned ?? fam.availability.available} available)`
                                  : `${fam.familyName} hardware exhausted — a new unit will be added at submit`}
                              </div>
                            )}
                            {p?.pricingModel && p.pricingModel !== "fixed" && p.pricingModel !== "quantity" && (
                              <div className="text-[11px] text-muted-foreground">
                                {p.pricingModel === "custom_quote"
                                  ? "Custom quote — sales will follow up"
                                  : `${p.unitRate ?? "?"} ${p.pricingUnit ? PRICING_UNIT_LABELS[p.pricingUnit as PricingUnit] : ""}`}
                              </div>
                            )}
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQty(c.key, -1)}><Minus className="h-3.5 w-3.5" /></Button>
                          <span className="w-8 text-center font-semibold">{c.quantity}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQty(c.key, 1)}><Plus className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeFromCart(c.key)}><X className="h-3.5 w-3.5" /></Button>
                        </div>
                        {(isCustom || isQuote) && (
                          <div className="border-t pt-2 space-y-2">
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><Ruler className="h-3 w-3" />Enter your custom size</div>
                            <div className="grid grid-cols-3 gap-2">
                              <Input type="number" step="0.01" placeholder="Width" value={c.customWidth ?? ""}
                                onChange={e => updateCustomSize(c.key, { customWidth: e.target.value === "" ? null : Number(e.target.value) })} />
                              <Input type="number" step="0.01" placeholder="Height" value={c.customHeight ?? ""}
                                onChange={e => updateCustomSize(c.key, { customHeight: e.target.value === "" ? null : Number(e.target.value) })} />
                              <Select value={c.customSizeUnit ?? "m"} onValueChange={v => updateCustomSize(c.key, { customSizeUnit: v as LengthUnit })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="m">m</SelectItem><SelectItem value="cm">cm</SelectItem><SelectItem value="mm">mm</SelectItem>
                                  <SelectItem value="ft">ft</SelectItem><SelectItem value="in">in</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {c.pricingBasis && (
                              <div className="text-[11px] font-mono bg-muted/50 rounded p-1.5">
                                {c.pricingBasis}{c.unitPrice && data.partner.pricingDisplayEnabled ? ` → $${c.unitPrice}` : ""}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <AddonRenderer
                addonProducts={addonProducts}
                eventAddonRow={eventAddonRow}
                partnerHasAddonLibrary={partnerHasAddonLibrary}
                addToCart={addToCart}
              />

              <SurveyAssetsSection
                slug={slug}
                cart={cart}
                addToCart={(item: CartItem) => setCart(prev => [...prev, item])}
                removeFromCart={(key) => setCart(prev => prev.filter(c => c.key !== key))}
                branding={branding}
              />

              <div className={`rounded-lg border p-4 ${addonProducts.length === 0 ? "bg-amber-50 border-amber-200" : "bg-muted/30"}`}>
                {addonProducts.length === 0 ? (
                  <>
                    <div className="text-sm font-semibold mb-1">Don't see what you need?</div>
                    <p className="text-xs text-muted-foreground mb-2">
                      There aren't any specific add-ons listed for this package. Tell us what else you'd like and we'll put together a custom quote.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-semibold mb-1">Need something not listed?</div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Describe anything else you'd like added to your order and we'll quote it for you.
                    </p>
                  </>
                )}
                <Textarea
                  rows={4}
                  value={addonRequest}
                  onChange={e => setAddonRequest(e.target.value)}
                  placeholder="e.g. 2 extra retractable banners with our logo, custom-printed table runner 6ft, branded lanyards x50…"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Upload artwork</h2>
              <ArtworkGuidancePanel
                partnerId={data.partner?.id}
                productIds={[
                  ...(selectedPkg?.items || []).map((i: any) => i.productId).filter(Boolean),
                  ...cart.map(c => c.productId).filter(Boolean),
                ]}
              />
              <p className="text-sm text-muted-foreground">Upload your artwork files directly, or paste a link if they live in Drive, Dropbox, Figma, etc. You can also send them later by replying to your order confirmation.</p>

              <div className="rounded-lg border-2 border-dashed p-6 text-center bg-muted/20">
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <div className="text-sm font-medium mb-1">Upload artwork files</div>
                <div className="text-xs text-muted-foreground mb-3">PNG, JPG, PDF, AI, PSD, EPS, SVG, ZIP — up to 50MB each</div>
                <label className="inline-flex">
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    accept="image/*,.pdf,.ai,.psd,.eps,.svg,.zip,.tiff,.tif"
                    onChange={e => { uploadArtwork(e.target.files); e.target.value = ""; }}
                    disabled={uploading}
                  />
                  <span className="cursor-pointer inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90">
                    {uploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Uploading…</> : <><Upload className="h-3.5 w-3.5" />Choose files</>}
                  </span>
                </label>
                {uploadError && <div className="text-xs text-destructive mt-2">{uploadError}</div>}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide">or paste a link</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="flex gap-2">
                <Input placeholder="https://drive.google.com/..." value={artworkUrlInput} onChange={e => setArtworkUrlInput(e.target.value)} />
                <Button onClick={() => { if (artworkUrlInput) { setArtworkFiles([...artworkFiles, { name: artworkUrlInput, url: artworkUrlInput }]); setArtworkUrlInput(""); } }} className="gap-1"><Upload className="h-4 w-4" />Add link</Button>
              </div>
              <div className="space-y-2">
                {artworkFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-muted/40 rounded">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <a href={f.url} target="_blank" rel="noreferrer" className="text-sm flex-1 truncate text-primary hover:underline">{f.name}</a>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setArtworkFiles(artworkFiles.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
                {artworkFiles.length === 0 && <div className="text-sm text-muted-foreground italic">No files yet — that's fine, you can send them later.</div>}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Your contact info</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><Label>Full Name *</Label><Input value={contact.contactName} onChange={e => setContact({ ...contact, contactName: e.target.value })} /></div>
                <div><Label>Email *</Label><Input type="email" value={contact.contactEmail} onChange={e => setContact({ ...contact, contactEmail: e.target.value })} /></div>
                <div><Label>Phone</Label><Input value={contact.contactPhone} onChange={e => setContact({ ...contact, contactPhone: e.target.value })} /></div>
                <div><Label>Company</Label><Input value={contact.companyName} onChange={e => setContact({ ...contact, companyName: e.target.value })} /></div>
              </div>
              <div><Label>Notes for our team</Label><Textarea value={contact.notes} onChange={e => setContact({ ...contact, notes: e.target.value })} rows={3} placeholder="Anything we should know?" /></div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold">Review & submit</h2>
              <div className="space-y-4">
                <Card className="p-4">
                  <div className="text-xs uppercase text-muted-foreground font-semibold">Event</div>
                  <div className="font-semibold mt-1">{selectedEvent?.name || "Custom"}</div>
                  <div className="text-sm text-muted-foreground">{data.cities.find(c => c.id === cityId)?.name} · {selectedVenue?.name}</div>
                  {selectedEvent?.shippingDeadline && <div className="text-xs text-amber-600 mt-1">Ship by {selectedEvent.shippingDeadline}</div>}
                </Card>
                {selectedPkg && <Card className="p-4">
                  <div className="text-xs uppercase text-muted-foreground font-semibold">Package</div>
                  <div className="flex items-center justify-between mt-1">
                    <div className="font-semibold">{selectedPkg.displayName || selectedPkg.name}</div>
                    {selectedPkg.price && data.partner.pricingDisplayEnabled && <div className="font-bold">${selectedPkg.price}</div>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{selectedPkg.items.length} item{selectedPkg.items.length !== 1 ? "s" : ""}</div>
                </Card>}
                {cart.length > 0 && <Card className="p-4">
                  <div className="text-xs uppercase text-muted-foreground font-semibold mb-2">Add-ons ({cart.length})</div>
                  <div className="space-y-1">{cart.map(c => <div key={c.key} className="flex justify-between text-sm"><span>{c.name}</span><span className="font-semibold">{c.quantity}x</span></div>)}</div>
                </Card>}
                <Card className="p-4">
                  <div className="text-xs uppercase text-muted-foreground font-semibold">Contact</div>
                  <div className="text-sm mt-1">{contact.contactName} · {contact.contactEmail}</div>
                  {contact.companyName && <div className="text-sm text-muted-foreground">{contact.companyName}</div>}
                </Card>
                {totalEstimate > 0 && data.partner.pricingDisplayEnabled && <Card className="p-4 bg-primary/5 border-primary/20">
                  <div className="flex items-center justify-between"><div className="font-semibold">Estimated Total</div><div className="text-2xl font-bold">${totalEstimate.toFixed(2)}</div></div>
                  <div className="text-xs text-muted-foreground mt-1">Final pricing confirmed by our team</div>
                </Card>}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-6 mt-6 border-t">
            <Button variant="ghost" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0} className="gap-1"><ChevronLeft className="h-4 w-4" />Back</Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep(s => s + 1)} disabled={!canAdvance()} className="gap-1" style={{ background: branding.button, color: branding.buttonText }}>Next<ChevronRight className="h-4 w-4" /></Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submit.isPending || !contact.contactName || !contact.contactEmail} className="gap-2" style={{ background: branding.button, color: branding.buttonText }}>{submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}Submit Order</Button>
            )}
          </div>
        </Card>
          </div>

          {/* Sticky Summary Sidebar (desktop) */}
          <aside className="hidden lg:block">
            <div className="sticky top-6 space-y-3">
              <Card className="p-5 shadow-md">
                <div className="flex items-center gap-2 mb-3">
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-semibold text-sm">Your Order</h3>
                  {summaryItemCount > 0 && <Badge variant="secondary" className="ml-auto text-[10px]">{summaryItemCount} item{summaryItemCount !== 1 ? "s" : ""}</Badge>}
                </div>

                {selectedEvent ? (
                  <div className="text-xs space-y-0.5 pb-3 border-b">
                    <div className="text-muted-foreground uppercase tracking-wide text-[10px] font-semibold">Event</div>
                    <div className="font-medium">{selectedEvent.name}</div>
                    <div className="text-muted-foreground">{data.cities.find(c => c.id === cityId)?.name} · {selectedVenue?.name}</div>
                    {selectedEvent.shippingDeadline && <div className="text-amber-600">Ship by {selectedEvent.shippingDeadline}</div>}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic pb-3 border-b">Select an event to begin</div>
                )}

                {selectedPkg && (
                  <div className="text-xs space-y-1 py-3 border-b">
                    <div className="text-muted-foreground uppercase tracking-wide text-[10px] font-semibold">Package</div>
                    <div className="flex justify-between"><span className="font-medium">{selectedPkg.displayName || selectedPkg.name}</span>{selectedPkg.price && data.partner.pricingDisplayEnabled && <span className="font-semibold">${selectedPkg.price}</span>}</div>
                    <div className="text-muted-foreground">{selectedPkg.items.length} included item{selectedPkg.items.length !== 1 ? "s" : ""}</div>
                  </div>
                )}

                {cart.length > 0 && (
                  <div className="text-xs space-y-1 py-3 border-b">
                    <div className="text-muted-foreground uppercase tracking-wide text-[10px] font-semibold">Add-ons</div>
                    {cart.map(c => (
                      <div key={c.key} className="flex justify-between gap-2"><span className="truncate">{c.name}</span><span className="font-semibold shrink-0">{c.quantity}x</span></div>
                    ))}
                  </div>
                )}

                {artworkFiles.length > 0 && (
                  <div className="text-xs py-3 border-b">
                    <div className="text-muted-foreground uppercase tracking-wide text-[10px] font-semibold mb-1">Artwork</div>
                    <div>{artworkFiles.length} file{artworkFiles.length !== 1 ? "s" : ""} attached</div>
                  </div>
                )}

                {totalEstimate > 0 && data.partner.pricingDisplayEnabled && (
                  <div className="pt-3 flex items-center justify-between">
                    <span className="text-sm font-semibold">Estimated</span>
                    <span className="text-xl font-bold">${totalEstimate.toFixed(2)}</span>
                  </div>
                )}
              </Card>

              <Card className="p-4 bg-muted/30 border-dashed">
                <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">Step {step + 1} of {STEPS.length}:</span> {STEPS[step]}</p>
                <p className="text-[11px] text-muted-foreground mt-1">Your selections are kept as you navigate.</p>
              </Card>
            </div>
          </aside>
        </div>
      </div>
      <PortalFooter partnerName={data.partner.companyName} branding={branding} />
    </BrandedShell>
  );
}

// Matches the backend `toPublicSurveyAsset()` projection in
// lib/db/src/schema/surveyAssets.ts. Internal fields (notes, NetSuite,
// install/production notes, surveyor, etc.) are intentionally absent.
// Public projection — measurements and all internal fields are intentionally
// absent. A3 ops uses measurements internally for quoting; the customer-facing
// portal only shows the photo + the approved-material picker.
type PublicSurveyAsset = {
  id: number;
  externalAssetId: string;
  name: string;
  description: string | null;
  category: string | null;
  venueName: string | null;
  cityName: string | null;
  publicPhotoUrl: string | null;
  publicPhotos: Array<{ url: string; caption?: string }>;
  approvedMaterials: string[];
  materialOverrideMode: string;
};

type SurveyBranding = { text: string; headingFont: string; button: string; buttonText: string };

function SurveyAssetsSection({ slug, cart, addToCart, removeFromCart, branding }: {
  slug: string;
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (key: string) => void;
  branding: SurveyBranding;
}) {
  const { data } = useQuery<{ assets: PublicSurveyAsset[] }>({
    queryKey: [`/api/public/partners/${slug}/survey-assets`],
    queryFn: () => apiFetch(`/api/public/partners/${slug}/survey-assets`),
  });
  const [materialChoice, setMaterialChoice] = useState<Record<number, string>>({});
  const assets = data?.assets ?? [];
  if (assets.length === 0) return null;

  const cartByAssetId = new Map<number, CartItem>();
  for (const c of cart) if (c.surveyAssetId != null) cartByAssetId.set(c.surveyAssetId, c);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold" style={{ color: branding.text, fontFamily: branding.headingFont }}>Brand our space for your event</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Pre-surveyed venue locations ready to brand. Pick a material if you have a preference.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {assets.map(a => {
          const inCart = cartByAssetId.get(a.id);
          const photo = a.publicPhotos[0]?.url ?? a.publicPhotoUrl ?? null;
          const materials = a.approvedMaterials;
          const showMaterial = materials.length > 0;
          const chosen = materialChoice[a.id] ?? materials[0] ?? "";
          return (
            <div key={a.id} className="border rounded-lg overflow-hidden bg-white flex flex-col">
              {photo
                ? <img src={resolveAssetUrl(photo)} alt={a.name} className="w-full h-32 object-cover" />
                : <div className="w-full h-32 bg-muted flex items-center justify-center text-xs text-muted-foreground"><MapPin className="h-5 w-5" /></div>}
              <div className="p-3 flex-1 flex flex-col gap-2">
                <div>
                  <div className="text-sm font-semibold leading-tight">{a.name}</div>
                  {(a.venueName || a.cityName) && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">{[a.venueName, a.cityName].filter(Boolean).join(" · ")}</div>
                  )}
                </div>
                {a.description && <div className="text-xs text-muted-foreground line-clamp-2">{a.description}</div>}
                {showMaterial && (
                  <Select value={chosen} onValueChange={(v) => setMaterialChoice(prev => ({ ...prev, [a.id]: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose material" /></SelectTrigger>
                    <SelectContent>
                      {materials.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <div className="mt-auto pt-1">
                  {inCart ? (
                    <Button size="sm" variant="outline" className="w-full" onClick={() => removeFromCart(inCart.key)}>
                      <Check className="h-3.5 w-3.5 mr-1" /> Added — remove
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full"
                      style={{ background: branding.button, color: branding.buttonText }}
                      onClick={() => addToCart({
                        key: `survey-${a.id}-${Date.now()}`,
                        itemType: "product",
                        productId: null,
                        name: `Brand: ${a.name}${chosen ? ` (${chosen})` : ""}`,
                        quantity: 1,
                        productImageUrl: photo,
                        customSizeUnit: null,
                        surveyAssetId: a.id,
                        selectedMaterial: chosen || null,
                      })}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add to order
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PackageGallery({ pkg }: { pkg: Pkg }) {
  const gallery = (pkg.imageUrls && pkg.imageUrls.length > 0) ? pkg.imageUrls : (pkg.imageUrl ? [pkg.imageUrl] : []);
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  if (gallery.length === 0) {
    return <div className="aspect-video w-full rounded-lg bg-muted/50 mb-3 flex items-center justify-center"><Package className="h-10 w-10 text-muted-foreground/40" /></div>;
  }
  const current = gallery[Math.min(active, gallery.length - 1)];
  const open = (i: number, e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); setActive(i); setLightbox(true); };
  return (
    <div className="mb-3" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={(e) => open(active, e)} aria-label={`View ${pkg.displayName || pkg.name} larger`} className="relative block w-full group">
        <img src={resolveAssetUrl(current)} alt={`${pkg.displayName || pkg.name} — image ${active + 1} of ${gallery.length}`} className="aspect-video w-full rounded-lg object-cover bg-muted" />
        <span className="absolute top-2 right-2 rounded-full bg-black/60 text-white p-1.5 opacity-0 group-hover:opacity-100 transition" aria-hidden="true"><ZoomIn className="h-3.5 w-3.5" /></span>
        {gallery.length > 1 && (
          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/70 text-white text-[11px] font-semibold">{active + 1} / {gallery.length}</span>
        )}
      </button>
      {gallery.length > 1 && (
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
          {gallery.map((u, i) => (
            <button
              key={u + i}
              type="button"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setActive(i); }}
              onDoubleClick={(e) => open(i, e)}
              className={`shrink-0 rounded border-2 transition ${i === active ? "border-primary" : "border-transparent hover:border-primary/40"}`}
              aria-label={`View image ${i + 1}`}
            >
              <img src={resolveAssetUrl(u)} alt="" className="h-10 w-14 rounded object-cover bg-muted" />
            </button>
          ))}
        </div>
      )}
      <Dialog open={lightbox} onOpenChange={setLightbox}>
        <DialogContent className="max-w-5xl p-0 bg-black/95 border-0">
          <DialogTitle className="sr-only">{pkg.displayName || pkg.name} — image {active + 1} of {gallery.length}</DialogTitle>
          <div className="relative">
            <img src={resolveAssetUrl(gallery[active])} alt={`${pkg.displayName || pkg.name} — image ${active + 1} of ${gallery.length}`} className="w-full max-h-[85vh] object-contain" />
            {gallery.length > 1 && (
              <>
                <button type="button" aria-label="Previous image" onClick={() => setActive((active - 1 + gallery.length) % gallery.length)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 text-white p-2"><ChevronLeft className="h-6 w-6" /></button>
                <button type="button" aria-label="Next image" onClick={() => setActive((active + 1) % gallery.length)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 text-white p-2"><ChevronRight className="h-6 w-6" /></button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 text-white text-xs">{active + 1} / {gallery.length}</div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ArtworkGuidancePanel({ partnerId, productIds }: { partnerId?: number; productIds: number[] }) {
  const ids = Array.from(new Set(productIds.filter(Boolean)));
  const { data: products = [] } = useQuery<any[]>({
    queryKey: ["/api/products", "for-guidance"],
    queryFn: () => apiFetch("/api/products"),
    enabled: ids.length > 0,
  });
  const { data: pref } = useQuery<{ system: UnitSystem }>({
    queryKey: ["/api/units/resolve", "partner", partnerId],
    queryFn: () => apiFetch(`/api/units/resolve?partnerId=${partnerId}`),
    enabled: !!partnerId,
  });
  const preferredSystem: UnitSystem | undefined = pref?.system;

  const relevant = (products || []).filter((p: any) => ids.includes(p.id) &&
    (p.artworkWidth || p.artworkHeight || p.bleed != null || p.safeArea != null || p.sizeWidth || p.sizeHeight));
  if (!relevant.length) return null;

  return (
    <Card className="p-3 bg-blue-50 border-blue-200">
      <div className="flex items-center gap-2 text-sm font-semibold text-blue-900 mb-2">
        <Ruler className="h-4 w-4" />File guidance{preferredSystem ? ` (${preferredSystem})` : ""}
      </div>
      <div className="space-y-2">
        {relevant.map((p: any) => {
          const aUnit = p.artworkUnit || p.sizeUnit;
          const finished = formatWxHDual(p.sizeWidth, p.sizeHeight, p.sizeUnit, preferredSystem);
          const artwork  = formatWxHDual(p.artworkWidth, p.artworkHeight, aUnit, preferredSystem);
          const bleed    = formatPrimarySecondary(p.bleed, aUnit, preferredSystem);
          const safe     = formatPrimarySecondary(p.safeArea, aUnit, preferredSystem);
          return (
            <div key={p.id} className="text-xs text-blue-900/90">
              <div className="font-medium">{p.displayName || p.name}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                {finished.primary && <span>Finished: <span className="font-medium">{finished.primary}</span>{finished.secondary && <span className="opacity-70"> (≈ {finished.secondary})</span>}</span>}
                {artwork.primary  && <span>Artwork: <span className="font-medium">{artwork.primary}</span>{artwork.secondary && <span className="opacity-70"> (≈ {artwork.secondary})</span>}</span>}
                {bleed.primary    && <span>Bleed: <span className="font-medium">{bleed.primary}</span>{bleed.secondary && <span className="opacity-70"> (≈ {bleed.secondary})</span>}</span>}
                {safe.primary     && <span>Safe: <span className="font-medium">{safe.primary}</span>{safe.secondary && <span className="opacity-70"> (≈ {safe.secondary})</span>}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
