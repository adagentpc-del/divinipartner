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
interface IntakeAnalysis {
  orderType: "print_only" | "full_unit" | "mixed" | "rental" | "other";
  orderTypeReason: string;
  netsuiteCustomerNumber: string | null;
  programManager: IntakeContact | null;
  accountOwner: IntakeContact | null;
  supportContact: IntakeContact | null;
  partnerContacts: IntakeContact[];
  opsRecipients: string[];
  items: IntakeItem[];
  familiesRemaining: IntakeFamily[];
  recommendedSupplierName: string | null;
  followUpQuestions: string[];
  nextSteps: string[];
  readinessLabel: "ready_to_dispatch" | "needs_clarification" | "needs_artwork" | "blocked_inventory";
  readinessReason: string;
}

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

      {/* Account snapshot */}
      <Section title="Account snapshot" icon={<Building2 className="h-3.5 w-3.5" />}>
        <KvRow label="NetSuite customer #">
          {a.netsuiteCustomerNumber
            ? <code className="text-xs px-1.5 py-0.5 rounded border bg-muted">{a.netsuiteCustomerNumber}</code>
            : <span className="text-muted-foreground text-xs">— not on file —</span>}
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

      {/* People */}
      {(a.programManager || a.accountOwner || a.supportContact || a.partnerContacts.length > 0) && (
        <Section title="People to call">
          <div className="grid sm:grid-cols-2 gap-2">
            {[a.programManager, a.accountOwner, a.supportContact].filter((c): c is IntakeContact => !!c).map(c => (
              <ContactCard key={c.label} c={c} />
            ))}
            {a.partnerContacts.slice(0, 4).map(c => <ContactCard key={c.label + (c.email ?? "")} c={c} />)}
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
                  <Badge variant="outline" className={`${ITEM_LABEL[it.label].tone} text-[10px] font-semibold whitespace-nowrap`}>
                    {ITEM_LABEL[it.label].text}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{it.note}</div>
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

      {a.followUpQuestions.length === 0 && a.readinessLabel === "ready_to_dispatch" && (
        <div className="mt-4 flex items-center gap-2 text-xs text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> No outstanding questions — this one is ready to move.
        </div>
      )}
    </Card>
  );
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
