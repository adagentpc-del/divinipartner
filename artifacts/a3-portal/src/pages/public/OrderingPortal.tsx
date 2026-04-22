import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ChevronRight, ChevronLeft, Calendar, MapPin, Package, Plus, Minus, Check, Upload, ShoppingCart, Sparkles, X, Ruler } from "lucide-react";
import { formatWxHDual, formatPrimarySecondary, computePrice, convert, PRICING_UNIT_LABELS, type UnitSystem, type LengthUnit, type PricingModel, type PricingUnit } from "@/lib/units";

type City = { id: number; name: string; state: string | null };
type Venue = { id: number; cityId: number | null; name: string; venueAddress: string | null; shippingAddress: string | null };
type Event = { id: number; cityId: number | null; venueId: number | null; name: string; eventStartDate: string | null; eventEndDate: string | null; shippingDeadline: string | null; status: string; availablePackageIdsJson: number[] | null };
type PkgItem = { id: number; productId: number; productName: string | null; productCategory: string | null; productImageUrl: string | null; quantity: number; isOptional: boolean };
type Pkg = { id: number; name: string; displayName: string | null; description: string | null; tier: number; price: string | null; items: PkgItem[] };
type Product = {
  id: number; name: string; category: string; imageUrl: string | null; sku: string | null;
  rentalEligible: boolean | null; printOnlyAvailable: boolean | null;
  pricingModel: string | null; unitRate: string | number | null; pricingUnit: string | null;
  minBillableSize: number | null; minCharge: string | number | null; allowsCustomSize: boolean | null;
  sizeWidthMm: string | number | null; sizeHeightMm: string | number | null;
};
type Partner = { id: number; companyName: string; introHeadline: string | null; introText: string | null; pricingDisplayEnabled: boolean | null };
type Data = { partner: Partner; cities: City[]; venues: Venue[]; events: Event[]; packages: Pkg[]; products: Product[] };

type CartItem = {
  key: string; itemType: "product" | "package" | "branding_zone";
  productId?: number; packageId?: number; name: string; quantity: number;
  unitPrice?: string | null; productImageUrl?: string | null;
  customWidth?: number | null; customHeight?: number | null; customSizeUnit?: LengthUnit | null;
  pricingBasis?: string | null;
};

const STEPS = ["Event", "Package", "Add-ons", "Artwork", "Contact", "Review"] as const;

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
  const [contact, setContact] = useState({ contactName: "", contactEmail: "", contactPhone: "", companyName: "", notes: "" });
  const [submitted, setSubmitted] = useState<{ orderNumber: string } | null>(null);

  const submit = useMutation({
    mutationFn: (body: any) => apiFetch(`/api/public/partners/${slug}/orders`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (res: any) => { setSubmitted({ orderNumber: res.orderNumber }); window.scrollTo(0, 0); },
    onError: (e: any) => toast({ title: "Submission failed", description: e.message, variant: "destructive" }),
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

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (isError || !data) return <div className="min-h-screen flex items-center justify-center"><Card className="p-10 max-w-md text-center"><p className="text-lg font-semibold">We couldn't load this portal.</p><p className="text-sm text-muted-foreground mt-2">Please check the link or try again shortly.</p></Card></div>;

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50 flex items-center justify-center p-6">
        <Card className="max-w-lg p-10 text-center shadow-xl border-emerald-200">
          <div className="h-16 w-16 mx-auto bg-emerald-100 rounded-full flex items-center justify-center mb-4"><Check className="h-8 w-8 text-emerald-600" /></div>
          <h1 className="text-2xl font-bold mb-2">Order received!</h1>
          <p className="text-muted-foreground mb-4">Your order has been submitted. Our production team will reach out shortly to confirm details.</p>
          <div className="bg-muted/50 rounded-lg p-4 mb-6">
            <div className="text-xs text-muted-foreground">Order Number</div>
            <div className="font-mono font-bold text-lg">{submitted.orderNumber}</div>
          </div>
          <Button onClick={() => { setSubmitted(null); setStep(0); setCart([]); setSelectedPkgId(null); setEventId(null); setArtworkFiles([]); setContact({ contactName: "", contactEmail: "", contactPhone: "", companyName: "", notes: "" }); }}>Place another order</Button>
        </Card>
      </div>
    );
  }

  const upcomingEvents = data.events.filter(e => e.status === "upcoming" || e.status === "live");
  const venuesForCity = cityId ? data.venues.filter(v => v.cityId === cityId) : [];
  const availablePkgs = selectedEvent?.availablePackageIdsJson?.length ? data.packages.filter(p => selectedEvent.availablePackageIdsJson!.includes(p.id)) : data.packages;

  const addonProducts = data.products.filter(p => !selectedPkg?.items.some(it => it.productId === p.id));

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
    }));

    submit.mutate({
      eventId, packageId: selectedPkgId, shippingVenueId: venueId,
      shippingAddress: selectedVenue ? { address: selectedVenue.shippingAddress || selectedVenue.venueAddress, venueName: selectedVenue.name } : null,
      ...contact, items, artworkFiles, totalEstimate: totalEstimate > 0 ? totalEstimate.toFixed(2) : null,
    });
  };

  const summaryItemCount = (selectedPkg ? 1 : 0) + cart.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <div className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        <div className="text-center mb-8">
          <Badge className="mb-3" variant="secondary"><Sparkles className="h-3 w-3 mr-1" />Order Portal</Badge>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{data.partner.introHeadline || `Order with ${data.partner.companyName}`}</h1>
          {data.partner.introText && <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">{data.partner.introText}</p>}
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-1 mb-8 flex-wrap">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
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
                    <button key={p.id} type="button" onClick={() => setSelectedPkgId(p.id)} className={`text-left p-5 rounded-xl border-2 transition ${sel ? "border-primary bg-primary/5 shadow-md" : "border-border hover:border-primary/40 bg-card"}`}>
                      <div className="flex items-center justify-between mb-2"><Badge variant={sel ? "default" : "secondary"}>Tier {p.tier}</Badge>{sel && <Check className="h-4 w-4 text-primary" />}</div>
                      <div className="font-bold text-lg">{p.displayName || p.name}</div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{p.description}</p>
                      {p.price && data.partner.pricingDisplayEnabled && <div className="text-2xl font-bold mt-3">${p.price}</div>}
                      <div className="border-t mt-3 pt-3 space-y-1">
                        {p.items.slice(0, 5).map(it => <div key={it.id} className="text-xs text-muted-foreground flex justify-between"><span className="truncate">{it.productName}</span><span className="font-semibold">{it.quantity}x</span></div>)}
                        {p.items.length > 5 && <div className="text-xs text-muted-foreground">+{p.items.length - 5} more</div>}
                      </div>
                    </button>
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
                    return (
                      <div key={c.key} className="bg-card p-2 rounded space-y-2">
                        <div className="flex items-center gap-2">
                          {c.productImageUrl && <img src={c.productImageUrl} className="h-10 w-10 rounded object-cover" alt="" />}
                          <div className="flex-1 text-sm">
                            <div>{c.name}</div>
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

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {addonProducts.map(p => (
                  <button key={p.id} type="button" onClick={() => addToCart(p)} className="text-left p-3 rounded-lg border hover:border-primary/40 hover:shadow-md transition bg-card">
                    {p.imageUrl ? <img src={p.imageUrl} className="aspect-square w-full rounded object-cover mb-2 bg-muted" alt={p.name} /> : <div className="aspect-square w-full rounded bg-muted mb-2 flex items-center justify-center"><Package className="h-8 w-8 text-muted-foreground/40" /></div>}
                    <div className="text-xs text-muted-foreground">{p.category}</div>
                    <div className="text-sm font-medium line-clamp-2">{p.name}</div>
                    <Button size="sm" variant="outline" className="w-full mt-2 h-7 text-xs gap-1"><Plus className="h-3 w-3" />Add</Button>
                  </button>
                ))}
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
              <p className="text-sm text-muted-foreground">Paste a link to your artwork (Drive, Dropbox, Figma, etc.). You can also send files later by replying to your order confirmation.</p>
              <div className="flex gap-2">
                <Input placeholder="https://drive.google.com/..." value={artworkUrlInput} onChange={e => setArtworkUrlInput(e.target.value)} />
                <Button onClick={() => { if (artworkUrlInput) { setArtworkFiles([...artworkFiles, { name: artworkUrlInput, url: artworkUrlInput }]); setArtworkUrlInput(""); } }} className="gap-1"><Upload className="h-4 w-4" />Add</Button>
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
              <Button onClick={() => setStep(s => s + 1)} disabled={!canAdvance()} className="gap-1">Next<ChevronRight className="h-4 w-4" /></Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submit.isPending || !contact.contactName || !contact.contactEmail} className="gap-2">{submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}Submit Order</Button>
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
