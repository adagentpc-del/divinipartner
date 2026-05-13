import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Boxes, Mail, ArrowRight, HelpCircle, Building2 } from "lucide-react";

/**
 * Read-only "Internal A3 Intake" panel.
 *
 * Mirrors the polished internal ops email (Pass 7). The same backend
 * `buildA3IntakeAnalysis` powers both, so the admin UI and the inbox can
 * never disagree about what we said about the order. Lives on the order
 * detail page so an A3 ops person reading the email and the admin opening
 * the order get the exact same answers to "what kind of order is this,
 * what's left, what should I do next, what should I ask the partner."
 */

type ContactSource = "partner_field" | "partner_contact" | "recipient_role";
interface IntakeContact { label: string; name: string | null; email: string | null; source: ContactSource }
type ItemLabel =
  | "print_only_on_partner_inventory"
  | "full_unit_required"
  | "print_only_no_hardware_link"
  | "hardware_supplied_in_order"
  | "rental_asset"
  | "addon_or_misc"
  | "unknown";
interface IntakeItem {
  itemId: number;
  itemName: string;
  quantity: number;
  familyName: string | null;
  memberRole: "hardware" | "component" | "accessory" | null;
  label: ItemLabel;
  reservedFromInventoryQty: number;
  shortageQty: number;
  inventorySource: { cityName: string | null; inventoryName: string | null; onHandBefore: number | null; onHandAfter: number | null } | null;
  note: string;
  surveyAsset: {
    id: number;
    externalAssetId: string;
    name: string;
    venueName: string | null;
    cityName: string | null;
    selectedMaterial: string | null;
    measurements: {
      widthIn: number | null; heightIn: number | null; depthIn: number | null;
      areaSqft: number | null; shape: string | null;
      measurementUnit: string | null; orientation: string | null;
    };
    surfaceMaterial: string | null;
    environment: string | null;
    zoneName: string | null;
    recommendedApplications: string[];
    alternateApplications: string[];
    visibilityTier: string | null;
    publicStatus: string | null;
    designNeeded: boolean;
    commissionEligible: boolean;
    opsOwner: string | null;
    internalNotes: string | null;
    installNotes: string | null;
    productionNotes: string | null;
    pricingNotes: string | null;
    internalPhotos: Array<{ url: string; caption?: string }>;
    netsuiteAssetNumber: string | null;
    netsuiteVenueNumber: string | null;
    netsuiteItemName: string | null;
    netsuiteItemCategory: string | null;
  } | null;
}
interface IntakeFamily {
  familyId: number;
  familyName: string;
  hardwareProductName: string | null;
  totalOwned: number;
  reservedNow: number;
  availableAfterThisOrder: number;
  status: "ok" | "low" | "depleted";
  perCity: Array<{ cityName: string; onHand: number; reservedAfter: number; remaining: number }>;
}
// Task #27: PM intake packet — extended types mirroring the email.
type InventorySourceLabel = "customer_stock" | "partner_stock" | "a3_stock" | "third_party" | "confirm_manually";
interface PmIntakeItemExtras {
  inventorySourceLabel: InventorySourceLabel;
  dimensions: { enteredWidth: number | null; enteredHeight: number | null; enteredDepth: number | null; sizeUnit: string | null; packedW: number | null; packedH: number | null; packedD: number | null; packedUnit: string | null };
  artwork: { fileUrl: string | null; needed: boolean };
  selectedMaterial: string | null;
  hardwareSummary: string | null;
  vendor: { supplierId: number | null; supplierName: string | null; matchSource: "order_assigned" | "product_default" | "branding_location_default" | "none" };
}
interface IntakeAnalysis {
  orderType: "print_only" | "full_unit" | "mixed" | "rental" | "other";
  orderTypeReason: string;
  quoteType?: "Print Production" | "Hardware + Print" | "Mixed Fulfillment" | "Rental" | "Standard";
  netsuiteCustomerNumber: string | null;
  salesperson?: IntakeContact;
  programManager: IntakeContact | null;
  accountOwner: IntakeContact | null;
  supportContact: IntakeContact | null;
  partnerContacts: IntakeContact[];
  opsRecipients: string[];
  customer?: { contactName: string; contactEmail: string; contactPhone: string | null; companyName: string | null };
  billing?: { contactName: string | null; contactEmail: string | null; contactPhone: string | null; addressLine: string | null; paymentModel: string | null; paymentTerms: string | null; netsuiteCustomerNumber: string | null };
  event?: { eventName: string | null; eventStartDate: string | null; eventEndDate: string | null; installDate: string | null; teardownDate: string | null; shippingDeadline: string | null; venueName: string | null; venueAddress: string | null; venueContacts: Array<{ name: string; email?: string | null; phone?: string | null; role?: string | null }> };
  packages?: Array<{ packageId: number; packageName: string; packageDescription: string | null; itemIds: number[] }>;
  items: Array<IntakeItem & Partial<PmIntakeItemExtras>>;
  familiesRemaining: IntakeFamily[];
  vendorMatches?: Array<{ supplierId: number; supplierName: string; itemIds: number[]; matchSources: Array<"order_assigned" | "product_default" | "branding_location_default"> }>;
  files?: Array<{ url: string; name: string; kind: "artwork" | "product_image" | "survey_photo"; contextLabel: string | null }>;
  missingFields?: Array<{ field: string; severity: "critical" | "warning"; reason: string }>;
  pmChecklist?: Array<{ key: string; label: string; done: boolean; detail: string | null }>;
  recommendedSupplierName: string | null;
  followUpQuestions: string[];
  nextSteps: string[];
  readinessLabel: "ready_to_dispatch" | "needs_clarification" | "needs_artwork" | "blocked_inventory";
  readinessReason: string;
}

const INV_SOURCE_LABEL: Record<InventorySourceLabel, { text: string; tone: string }> = {
  customer_stock:   { text: "Customer stock",   tone: "bg-slate-50 text-slate-700 border-slate-200" },
  partner_stock:    { text: "Partner stock",    tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  a3_stock:         { text: "A3 stock",         tone: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  third_party:      { text: "Third-party",      tone: "bg-amber-50 text-amber-700 border-amber-200" },
  confirm_manually: { text: "Confirm source",   tone: "bg-rose-50 text-rose-700 border-rose-200" },
};

const ORDER_TYPE_TONE: Record<IntakeAnalysis["orderType"], string> = {
  print_only: "bg-emerald-50 text-emerald-700 border-emerald-200",
  full_unit:  "bg-rose-50 text-rose-700 border-rose-200",
  mixed:      "bg-amber-50 text-amber-700 border-amber-200",
  rental:     "bg-indigo-50 text-indigo-700 border-indigo-200",
  other:      "bg-slate-50 text-slate-700 border-slate-200",
};
const ORDER_TYPE_LABEL: Record<IntakeAnalysis["orderType"], string> = {
  print_only: "Print only · use partner inventory",
  full_unit: "Full unit required · ship hardware + print",
  mixed: "Mixed · print + full units",
  rental: "Rental asset",
  other: "Order received",
};
const READINESS_TONE: Record<IntakeAnalysis["readinessLabel"], string> = {
  ready_to_dispatch: "bg-emerald-50 text-emerald-700 border-emerald-200",
  needs_clarification: "bg-amber-50 text-amber-700 border-amber-200",
  needs_artwork: "bg-amber-50 text-amber-700 border-amber-200",
  blocked_inventory: "bg-rose-50 text-rose-700 border-rose-200",
};
const READINESS_LABEL: Record<IntakeAnalysis["readinessLabel"], string> = {
  ready_to_dispatch: "Ready to dispatch",
  needs_clarification: "Needs clarification",
  needs_artwork: "Needs artwork",
  blocked_inventory: "Blocked — inventory short",
};
const ITEM_LABEL: Record<ItemLabel, { text: string; tone: string }> = {
  print_only_on_partner_inventory: { text: "Print only — partner has the hardware", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  full_unit_required:              { text: "Full unit required",                    tone: "bg-rose-50 text-rose-700 border-rose-200" },
  print_only_no_hardware_link:     { text: "Print only",                            tone: "bg-slate-50 text-slate-700 border-slate-200" },
  hardware_supplied_in_order:      { text: "Hardware shipped in this order",        tone: "bg-amber-50 text-amber-700 border-amber-200" },
  rental_asset:                    { text: "Rental asset",                          tone: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  addon_or_misc:                   { text: "Add-on / line",                         tone: "bg-slate-50 text-slate-700 border-slate-200" },
  unknown:                         { text: "Unclassified",                          tone: "bg-slate-50 text-slate-500 border-slate-200" },
};

export default function OrderInternalIntakePanel({ orderId }: { orderId: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["order-intake-analysis", orderId],
    queryFn: () => apiFetch<{ analysis: IntakeAnalysis }>(`/api/orders/${orderId}/intake-analysis`),
    enabled: !!orderId,
    staleTime: 15_000,
  });

  if (isLoading) {
    return (
      <Card className="p-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Internal A3 Intake</div>
        <div className="mt-2 text-sm text-muted-foreground">Building intake summary…</div>
      </Card>
    );
  }
  if (error) {
    return (
      <Card className="p-5">
        <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Internal A3 Intake</div>
        <div className="mt-2 text-sm text-amber-700">Couldn't build intake summary. The intake email may still send fine — refresh to retry.</div>
      </Card>
    );
  }
  const a = data?.analysis;
  if (!a) return null;

  return (
    <Card className="p-5 border-slate-300 bg-gradient-to-b from-white to-slate-50/40">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-bold">Internal A3 Intake</div>
          <div className="text-base font-semibold mt-0.5">A3-side view of this order</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className={`${ORDER_TYPE_TONE[a.orderType]} text-[11px] font-semibold`}>{ORDER_TYPE_LABEL[a.orderType]}</Badge>
          <Badge variant="outline" className={`${READINESS_TONE[a.readinessLabel]} text-[11px] font-semibold`}>{READINESS_LABEL[a.readinessLabel]}</Badge>
        </div>
      </div>
      <div className="text-xs text-muted-foreground mt-2">{a.orderTypeReason}</div>
      {a.readinessReason && <div className="text-xs text-muted-foreground mt-1">{a.readinessReason}</div>}

      {/* Missing-info banner (PM packet, task #27) */}
      {a.missingFields && a.missingFields.length > 0 && (() => {
        const crit = a.missingFields!.filter(m => m.severity === "critical").length;
        const tone = crit > 0 ? "border-rose-300 bg-rose-50 text-rose-800" : "border-amber-300 bg-amber-50 text-amber-800";
        return (
          <div className={`mt-3 rounded-md border px-3 py-2 ${tone}`}>
            <div className="text-[11px] uppercase tracking-wider font-bold flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              {crit > 0 ? `Missing info — ${crit} critical, ${a.missingFields!.length - crit} warning` : `Heads up — ${a.missingFields!.length} item${a.missingFields!.length === 1 ? "" : "s"} to confirm`}
            </div>
            <ul className="mt-1.5 space-y-0.5 text-xs">
              {a.missingFields!.map((m, i) => (
                <li key={i}><strong>{m.field}</strong> — <span className="opacity-80">{m.reason}</span></li>
              ))}
            </ul>
          </div>
        );
      })()}

      {/* Account snapshot */}
      <Section title="Account snapshot" icon={<Building2 className="h-3.5 w-3.5" />}>
        {a.quoteType && (
          <KvRow label="Quote type"><span className="text-sm font-semibold">{a.quoteType}</span></KvRow>
        )}
        <KvRow label="NetSuite customer #">
          {a.netsuiteCustomerNumber
            ? <code className="text-xs px-1.5 py-0.5 rounded border bg-muted">{a.netsuiteCustomerNumber}</code>
            : <span className="text-rose-700 text-xs font-medium">— missing —</span>}
        </KvRow>
        {a.recommendedSupplierName && (
          <KvRow label="Suggested production partner">
            <span className="text-sm font-medium">{a.recommendedSupplierName}</span>
          </KvRow>
        )}
        {a.opsRecipients.length > 0 && (
          <KvRow label="Sent to">
            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
              {a.opsRecipients.map(e => <span key={e}><Mail className="inline h-3 w-3 mr-1 -mt-0.5" />{e}</span>)}
            </div>
          </KvRow>
        )}
      </Section>

      {/* Customer + billing block (PM packet) */}
      {(a.customer || a.billing) && (
        <Section title="Customer & billing" icon={<Building2 className="h-3.5 w-3.5" />}>
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            {a.customer && (
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Customer</div>
                <div className="font-medium text-sm">{a.customer.companyName || a.customer.contactName}</div>
                <div className="text-muted-foreground">{a.customer.contactName}</div>
                <div className="text-muted-foreground">{a.customer.contactEmail || "—"}{a.customer.contactPhone ? ` · ${a.customer.contactPhone}` : ""}</div>
              </div>
            )}
            {a.billing && (
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Billing</div>
                <div className="text-muted-foreground">{a.billing.contactName || <em>same as customer</em>}</div>
                <div className="text-muted-foreground">{a.billing.contactEmail || "—"}{a.billing.contactPhone ? ` · ${a.billing.contactPhone}` : ""}</div>
                {a.billing.addressLine && <div className="text-muted-foreground">{a.billing.addressLine}</div>}
                <div className="text-muted-foreground">Payment: {a.billing.paymentModel || "—"}{a.billing.paymentTerms ? ` · ${a.billing.paymentTerms}` : ""}</div>
                {a.billing.netsuiteCustomerNumber && <div className="text-muted-foreground">NS #: <code className="text-[10px]">{a.billing.netsuiteCustomerNumber}</code></div>}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Event timeline (PM packet) */}
      {a.event && (
        <Section title="Event & timeline">
          <div className="grid sm:grid-cols-3 gap-2 text-xs">
            <div><span className="text-muted-foreground">Event:</span> <span className="font-medium">{a.event.eventName || "—"}</span></div>
            <div><span className="text-muted-foreground">Window:</span> {fmtPanelDate(a.event.eventStartDate)}{a.event.eventEndDate ? ` → ${fmtPanelDate(a.event.eventEndDate)}` : ""}</div>
            <div><span className="text-muted-foreground">Install:</span> {fmtPanelDate(a.event.installDate)}</div>
            <div><span className="text-muted-foreground">Teardown:</span> {fmtPanelDate(a.event.teardownDate)}</div>
            <div><span className="text-muted-foreground">Ship by:</span> {fmtPanelDate(a.event.shippingDeadline)}</div>
            <div><span className="text-muted-foreground">Venue:</span> {a.event.venueName || "—"}</div>
          </div>
          {a.event.venueAddress && <div className="text-xs text-muted-foreground mt-1">{a.event.venueAddress}</div>}
          {a.event.venueContacts.length > 0 && (
            <div className="text-xs text-muted-foreground mt-1">Contacts: {a.event.venueContacts.map((v, i) => <span key={i}>{i ? " · " : ""}{v.name}{v.role ? ` (${v.role})` : ""}{v.email ? ` ${v.email}` : ""}</span>)}</div>
          )}
        </Section>
      )}

      {/* People */}
      {(a.salesperson || a.programManager || a.accountOwner || a.supportContact || a.partnerContacts.length > 0) && (
        <Section title="People to call">
          <div className="grid sm:grid-cols-2 gap-2">
            {[a.salesperson, a.programManager, a.accountOwner, a.supportContact].filter((c): c is IntakeContact => !!c).map(c => (
              <ContactCard key={c.label} c={c} />
            ))}
            {a.partnerContacts.slice(0, 4).map(c => <ContactCard key={c.label + (c.email ?? "")} c={c} />)}
          </div>
        </Section>
      )}

      {/* Packages (PM packet) */}
      {a.packages && a.packages.length > 0 && (
        <Section title="Packages">
          <div className="space-y-1.5">
            {a.packages.map(pkg => {
              const lines = a.items.filter(i => pkg.itemIds.includes(i.itemId));
              return (
                <div key={pkg.packageId} className="border rounded-md p-2.5 bg-white">
                  <div className="text-sm font-medium">{pkg.packageName}</div>
                  {pkg.packageDescription && <div className="text-xs text-muted-foreground mt-0.5">{pkg.packageDescription}</div>}
                  <div className="text-[11px] text-muted-foreground mt-1">{lines.length} line{lines.length === 1 ? "" : "s"}: {lines.map(l => `${l.itemName} ×${l.quantity}`).join(" · ") || "—"}</div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Items */}
      {a.items.length > 0 && (
        <Section title="Items + fulfillment intent">
          <div className="space-y-1.5">
            {a.items.map(it => (
              <div key={it.itemId} className="border rounded-md p-2.5 bg-white">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{it.itemName} <span className="text-xs text-muted-foreground font-normal">× {it.quantity}</span></div>
                    {it.familyName && <div className="text-[11px] text-muted-foreground">{it.familyName}{it.memberRole ? ` · ${it.memberRole}` : ""}</div>}
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end">
                    <Badge variant="outline" className={`${ITEM_LABEL[it.label].tone} text-[10px] font-semibold whitespace-nowrap`}>
                      {ITEM_LABEL[it.label].text}
                    </Badge>
                    {it.inventorySourceLabel && (
                      <Badge variant="outline" className={`${INV_SOURCE_LABEL[it.inventorySourceLabel].tone} text-[10px] font-semibold whitespace-nowrap`}>
                        {INV_SOURCE_LABEL[it.inventorySourceLabel].text}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{it.note}</div>
                {/* PM packet per-line detail (dimensions / material / hardware / vendor / artwork) */}
                {(it.dimensions || it.selectedMaterial || it.hardwareSummary || it.vendor?.supplierName || it.artwork?.fileUrl || it.artwork?.needed) && (
                  <div className="mt-1.5 rounded border bg-slate-50/60 px-2 py-1.5 text-[11px] text-foreground space-y-0.5">
                    {it.dimensions && (it.dimensions.enteredWidth != null && it.dimensions.enteredHeight != null) && (
                      <div><span className="font-semibold">Dims:</span> {it.dimensions.enteredWidth} × {it.dimensions.enteredHeight}{it.dimensions.enteredDepth != null ? ` × ${it.dimensions.enteredDepth}` : ""} {it.dimensions.sizeUnit || "in"}
                      {(it.dimensions.packedW != null && it.dimensions.packedH != null) && (
                        <span className="text-muted-foreground"> · packed {it.dimensions.packedW} × {it.dimensions.packedH}{it.dimensions.packedD != null ? ` × ${it.dimensions.packedD}` : ""} {it.dimensions.packedUnit || "in"}</span>
                      )}
                      </div>
                    )}
                    {it.selectedMaterial && <div><span className="font-semibold">Material:</span> {it.selectedMaterial}</div>}
                    {it.hardwareSummary && <div><span className="font-semibold">Hardware:</span> {it.hardwareSummary}</div>}
                    {it.vendor?.supplierName && <div><span className="font-semibold">Vendor:</span> {it.vendor.supplierName} <span className="text-muted-foreground">({it.vendor.matchSource.replace(/_/g, " ")})</span></div>}
                    {it.artwork?.fileUrl
                      ? <div><span className="font-semibold">Artwork:</span> <a href={it.artwork.fileUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">file</a></div>
                      : it.artwork?.needed
                        ? <div className="text-rose-700"><span className="font-semibold">Artwork needed</span></div>
                        : null}
                  </div>
                )}
                {it.inventorySource && (
                  <div className="text-[11px] text-muted-foreground mt-1">
                    Reserved from <span className="font-medium text-foreground">{it.inventorySource.inventoryName ?? "partner stock"}</span>
                    {it.inventorySource.cityName ? ` · ${it.inventorySource.cityName}` : ""}
                    {it.inventorySource.onHandBefore !== null && it.inventorySource.onHandAfter !== null && (
                      <> · {it.inventorySource.onHandBefore} → <span className="font-semibold text-foreground tabular-nums">{it.inventorySource.onHandAfter}</span> on hand</>
                    )}
                  </div>
                )}
                {it.shortageQty > 0 && (
                  <div className="text-[11px] text-rose-700 mt-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Shortage: {it.shortageQty}
                  </div>
                )}
                {it.surveyAsset && (
                  <div className="mt-1.5 border border-dashed rounded p-2 bg-slate-50/60 text-[11px]">
                    <div className="font-bold text-muted-foreground uppercase tracking-wider text-[10px]">
                      Venue Survey · {it.surveyAsset.name}
                      {" "}· Asset <code className="text-[10px] normal-case">{it.surveyAsset.externalAssetId}</code>
                      {" "}<span className="text-slate-400 normal-case">(#{it.surveyAsset.id})</span>
                    </div>
                    {(it.surveyAsset.venueName || it.surveyAsset.zoneName || it.surveyAsset.cityName) && (
                      <div className="mt-0.5">{[it.surveyAsset.venueName, it.surveyAsset.zoneName, it.surveyAsset.cityName].filter(Boolean).join(" · ")}</div>
                    )}
                    {(() => {
                      const m = it.surveyAsset.measurements;
                      const unit = m.measurementUnit ?? "in";
                      const g = unit === "in" ? "″" : ` ${unit}`;
                      const areaUnit = unit === "cm" ? "sq m" : "sq ft";
                      const parts: string[] = [];
                      if (m.widthIn != null && m.heightIn != null) parts.push(`${m.widthIn}${g} × ${m.heightIn}${g}${m.depthIn != null ? ` × ${m.depthIn}${g}` : ""}`);
                      if (m.areaSqft != null) parts.push(`${m.areaSqft} ${areaUnit}`);
                      if (m.shape) parts.push(m.shape);
                      if (m.orientation) parts.push(m.orientation);
                      return parts.length ? <div className="mt-0.5 tabular-nums">{parts.join(" · ")}</div> : null;
                    })()}
                    {(it.surveyAsset.surfaceMaterial || it.surveyAsset.environment) && (
                      <div className="mt-0.5">
                        {it.surveyAsset.surfaceMaterial && <span><span className="font-semibold">Surface:</span> {it.surveyAsset.surfaceMaterial}</span>}
                        {it.surveyAsset.surfaceMaterial && it.surveyAsset.environment && " · "}
                        {it.surveyAsset.environment && <span><span className="font-semibold">Env:</span> {it.surveyAsset.environment}</span>}
                      </div>
                    )}
                    {it.surveyAsset.selectedMaterial && <div className="mt-0.5"><span className="font-semibold">Material:</span> {it.surveyAsset.selectedMaterial}</div>}
                    {(it.surveyAsset.recommendedApplications.length > 0 || it.surveyAsset.alternateApplications.length > 0) && (
                      <div className="mt-0.5 text-muted-foreground">
                        {it.surveyAsset.recommendedApplications.length > 0 && <div>Recommended: {it.surveyAsset.recommendedApplications.join(", ")}</div>}
                        {it.surveyAsset.alternateApplications.length > 0 && <div>Alternate: {it.surveyAsset.alternateApplications.join(", ")}</div>}
                      </div>
                    )}
                    {(it.surveyAsset.visibilityTier || it.surveyAsset.publicStatus || it.surveyAsset.designNeeded || it.surveyAsset.commissionEligible || it.surveyAsset.opsOwner) && (
                      <div className="mt-0.5 text-muted-foreground space-x-1">
                        {it.surveyAsset.visibilityTier && <span>Tier: {it.surveyAsset.visibilityTier}</span>}
                        {it.surveyAsset.publicStatus && <span>· Status: {it.surveyAsset.publicStatus}</span>}
                        {it.surveyAsset.designNeeded && <span>· Design needed</span>}
                        {it.surveyAsset.commissionEligible && <span>· Commission eligible</span>}
                        {it.surveyAsset.opsOwner && <span>· Ops: {it.surveyAsset.opsOwner}</span>}
                      </div>
                    )}
                    {(it.surveyAsset.netsuiteItemName || it.surveyAsset.netsuiteItemCategory || it.surveyAsset.netsuiteAssetNumber || it.surveyAsset.netsuiteVenueNumber) && (
                      <div className="mt-0.5 text-muted-foreground space-x-1">
                        {it.surveyAsset.netsuiteItemName && <span>Item <code className="text-[10px]">{it.surveyAsset.netsuiteItemName}</code></span>}
                        {it.surveyAsset.netsuiteItemCategory && <span className="text-[10px]">({it.surveyAsset.netsuiteItemCategory})</span>}
                        {it.surveyAsset.netsuiteAssetNumber && <span>· Asset #<code className="text-[10px]">{it.surveyAsset.netsuiteAssetNumber}</code></span>}
                        {it.surveyAsset.netsuiteVenueNumber && <span>· Venue #<code className="text-[10px]">{it.surveyAsset.netsuiteVenueNumber}</code></span>}
                      </div>
                    )}
                    {it.surveyAsset.installNotes && <div className="mt-0.5 text-muted-foreground"><span className="font-semibold">Install:</span> {it.surveyAsset.installNotes}</div>}
                    {it.surveyAsset.productionNotes && <div className="mt-0.5 text-muted-foreground"><span className="font-semibold">Production:</span> {it.surveyAsset.productionNotes}</div>}
                    {it.surveyAsset.pricingNotes && <div className="mt-0.5 text-muted-foreground"><span className="font-semibold">Pricing:</span> {it.surveyAsset.pricingNotes}</div>}
                    {it.surveyAsset.internalNotes && <div className="mt-0.5 text-muted-foreground"><span className="font-semibold">Internal:</span> {it.surveyAsset.internalNotes}</div>}
                    {it.surveyAsset.internalPhotos.length > 0 && (
                      <div className="mt-1 text-[11px]">
                        <span className="font-semibold text-muted-foreground">Marked photos: </span>
                        {it.surveyAsset.internalPhotos.map((p, i) => (
                          <a key={i} href={p.url} target="_blank" rel="noreferrer" className="underline mr-2">
                            #{i + 1}{p.caption ? ` ${p.caption}` : ""}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Inventory remaining */}
      {a.familiesRemaining.length > 0 && (
        <Section title="Inventory after this order" icon={<Boxes className="h-3.5 w-3.5" />}>
          <div className="space-y-1.5">
            {a.familiesRemaining.map(f => (
              <div key={f.familyId} className="border rounded-md p-2.5 bg-white">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <div className="text-sm font-medium">{f.familyName}{f.hardwareProductName && <span className="text-xs text-muted-foreground font-normal"> · {f.hardwareProductName}</span>}</div>
                  <Badge variant="outline" className={
                    f.status === "depleted" ? "bg-rose-50 text-rose-700 border-rose-200 text-[10px] font-semibold" :
                    f.status === "low" ? "bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-semibold" :
                    "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold"}>
                    {f.status === "depleted" ? "Depleted" : f.status === "low" ? "Low" : "OK"}
                  </Badge>
                </div>
                <div className="text-xs mt-1 tabular-nums">
                  <span className={f.status === "depleted" ? "text-rose-700 font-bold" : f.status === "low" ? "text-amber-700 font-bold" : "text-emerald-700 font-bold"}>{f.availableAfterThisOrder}</span>
                  <span className="text-muted-foreground"> of {f.totalOwned} units remain after this order{f.reservedNow > 0 ? ` (this order reserves ${f.reservedNow})` : ""}</span>
                </div>
                {f.perCity.length > 1 && (
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {f.perCity.map(c => <span key={c.cityName} className="mr-2">{c.cityName} {c.remaining}/{c.onHand}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Next steps */}
      {a.nextSteps.length > 0 && (
        <Section title="Next steps for A3" icon={<ArrowRight className="h-3.5 w-3.5" />}>
          <ol className="space-y-1.5">
            {a.nextSteps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Follow-up questions */}
      {a.followUpQuestions.length > 0 && (
        <Section title="Questions to send back to the partner" icon={<HelpCircle className="h-3.5 w-3.5" />}>
          <ol className="space-y-1.5">
            {a.followUpQuestions.map((q, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-600 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                <span>{q}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {/* Vendor matches (PM packet) */}
      {a.vendorMatches && a.vendorMatches.length > 0 && (
        <Section title="Vendor matches">
          <div className="space-y-1">
            {a.vendorMatches.map(v => (
              <div key={v.supplierId} className="border rounded-md p-2 bg-white text-xs">
                <div className="font-medium text-sm">{v.supplierName}</div>
                <div className="text-muted-foreground">{v.itemIds.length} line{v.itemIds.length === 1 ? "" : "s"} · sources: {v.matchSources.map(s => s.replace(/_/g, " ")).join(", ")}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Files (PM packet) */}
      {a.files && a.files.length > 0 && (
        <Section title="Files">
          <ul className="space-y-0.5 text-xs">
            {a.files.map((f, i) => (
              <li key={i}>
                <a href={f.url} target="_blank" rel="noreferrer" className="text-blue-700 underline">{f.name}</a>
                <span className="text-muted-foreground"> · {f.kind.replace(/_/g, " ")}{f.contextLabel ? ` · ${f.contextLabel}` : ""}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* PM checklist (PM packet) */}
      {a.pmChecklist && a.pmChecklist.length > 0 && (
        <Section title="PM checklist" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
          <ul className="space-y-1 text-sm">
            {a.pmChecklist.map(c => (
              <li key={c.key} className="flex items-start gap-2">
                <span className={`flex-shrink-0 mt-0.5 inline-block w-3.5 h-3.5 rounded border ${c.done ? "bg-emerald-500 border-emerald-600" : "bg-white border-slate-300"}`} />
                <span className={c.done ? "text-foreground" : "text-muted-foreground"}>
                  {c.label}{c.detail ? <span className="text-muted-foreground"> — {c.detail}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {a.followUpQuestions.length === 0 && a.readinessLabel === "ready_to_dispatch" && (
        <div className="mt-4 flex items-center gap-2 text-xs text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> No outstanding questions — this one is ready to move.
        </div>
      )}
    </Card>
  );
}

function fmtPanelDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.10em] text-muted-foreground font-bold mb-1.5">
        {icon}{title}
      </div>
      {children}
    </div>
  );
}

function KvRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 py-1 text-sm">
      <div className="text-xs text-muted-foreground w-44 flex-shrink-0">{label}</div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function ContactCard({ c }: { c: IntakeContact }) {
  return (
    <div className="border rounded-md p-2 bg-white">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{c.label}</div>
      {c.name && <div className="text-sm font-medium leading-tight mt-0.5">{c.name}</div>}
      {c.email
        ? <a href={`mailto:${c.email}`} className="text-xs text-blue-700 hover:underline break-all">{c.email}</a>
        : <div className="text-xs text-muted-foreground italic">— no email on file —</div>}
    </div>
  );
}
