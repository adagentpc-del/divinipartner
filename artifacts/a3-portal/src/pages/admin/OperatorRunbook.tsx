import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

type Section = {
  title: string;
  blurb: string;
  items: Array<{ q: string; a: string; link?: { label: string; href: string } }>;
};

const SECTIONS: Section[] = [
  {
    title: "Modules at a glance",
    blurb: "Each major module and what it owns.",
    items: [
      { q: "Partners & Portals", a: "Who you sell with. Per-partner branding, contacts, billing model, cities, venues, and packages.", link: { label: "Open Partners", href: "/admin/partners" } },
      { q: "Commercial accounts", a: "Who you sell to commercially. Plans, white-label level, activation status, billing entity, sales notes.", link: { label: "Open Commercial", href: "/admin/commercial" } },
      { q: "Sales & Proposals", a: "Pipeline, proposals, plan comparisons, activation checklists, and demo follow-ups.", link: { label: "Open Sales", href: "/admin/sales" } },
      { q: "Rollout & Stabilization", a: "Per-account blocker scan, stabilization queue, readiness scoring, activation briefs.", link: { label: "Open Rollout", href: "/admin/rollout" } },
      { q: "Orders & Production", a: "Order lifecycle, fulfillment mode, supplier assignment, supplier packets, artwork approval.", link: { label: "Open Orders", href: "/admin/orders" } },
      { q: "Billing & Reconciliation", a: "Invoices, commissions, payouts, billing-execution model inheritance, monthly close.", link: { label: "Open Billing", href: "/admin/billing" } },
    ],
  },
  {
    title: "Configure first",
    blurb: "Order of operations when standing up a new environment.",
    items: [
      { q: "1. Confirm integrations are healthy", a: "Object storage, auth, email. Use the deployment readiness page.", link: { label: "Open readiness", href: "/admin/deployment" } },
      { q: "2. Create at least one supplier", a: "Supplier routing requires at least one supplier exists." },
      { q: "3. Create your first partner", a: "Set portal type, branding, primary contact, and billing model." },
      { q: "4. Add cities, venues, packages", a: "Required for ordering and shipping." },
      { q: "5. Create a commercial account", a: "Link plan and billing entity. Use the activation checklist." },
    ],
  },
  {
    title: "Verify before launching a partner",
    blurb: "Use the rollout drilldown to check these automatically.",
    items: [
      { q: "Are blockers clear?", a: "Open Rollout > flagged > drilldown. Critical blockers must be resolved before go-live." },
      { q: "Is branding complete?", a: "White-label requires logo + palette. Standard portals need at least logo." },
      { q: "Is billing model selected?", a: "Each partner needs defaultBillingExecModel set so invoices route correctly." },
      { q: "Test order placed?", a: "Place a single end-to-end test order to confirm supplier routing and notifications." },
      { q: "Activation checklist clean?", a: "All items done or explicitly skipped. The status should be 'active'." },
    ],
  },
  {
    title: "When an order is blocked",
    blurb: "Common diagnostic path.",
    items: [
      { q: "No supplier assigned", a: "Check Orders > order detail. Confirm the partner has a supplier mapping or assign manually." },
      { q: "Awaiting artwork", a: "Open the order's assets panel. Artwork approval status will be 'pending' or missing." },
      { q: "Invoice not generated", a: "Check the partner's billing-execution model. Some models defer invoice creation." },
      { q: "Supplier packet not sent", a: "Confirm the supplier has a contact email and the asset is approved." },
    ],
  },
  {
    title: "When billing or reconciliation is off",
    blurb: "What to look at first.",
    items: [
      { q: "Invoice missing", a: "Check that invoiceRequired is true and partner billing model resolves to a known executor." },
      { q: "Commission wrong", a: "Open commercial plan overrides for the account; partner-level overrides take precedence." },
      { q: "Payout status stuck", a: "Reconciliation page > filter by status. Bulk update or notes can clear most edge cases." },
    ],
  },
  {
    title: "When suppliers are delayed",
    blurb: "Operational triage.",
    items: [
      { q: "Order shows no supplier movement", a: "Open the supplier command center. Look for the order in their queue and confirm they have the packet." },
      { q: "Asset never approved", a: "Asset Library > filter pending. Older than 24h triggers a workflow alert automatically." },
      { q: "Communication didn't reach supplier", a: "Communications log on the order. If empty, the email integration may be down." },
    ],
  },
  {
    title: "When assets are missing",
    blurb: "Where to look.",
    items: [
      { q: "Buyer didn't upload artwork", a: "Assets panel on the order. Use the upload prompt or send a reminder." },
      { q: "Asset uploaded but not visible", a: "Confirm isCurrent flag and that the asset is linked to the right order/event." },
    ],
  },
  {
    title: "Where to manage configuration",
    blurb: "Quick map of where settings live.",
    items: [
      { q: "Templates (events, packages)", a: "Inside each partner: events, packages, branding zones." },
      { q: "Workflow rules", a: "/admin/workflow/rules — triggers and actions." },
      { q: "Branding", a: "Partner > Theme editor and Branding zones." },
      { q: "Commercial settings", a: "/admin/commercial — separate from operational partner settings." },
    ],
  },
];

export default function OperatorRunbook() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Operator Runbook</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Practical, no-fluff reference for the people running the platform day-to-day.
        </p>
      </div>

      {SECTIONS.map(s => (
        <Card key={s.title}>
          <CardHeader>
            <CardTitle className="text-base">{s.title}</CardTitle>
            <p className="text-xs text-muted-foreground">{s.blurb}</p>
          </CardHeader>
          <CardContent className="divide-y">
            {s.items.map((it, i) => (
              <div key={i} className="py-3 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{it.q}</div>
                  <div className="text-sm text-muted-foreground mt-1">{it.a}</div>
                </div>
                {it.link && (
                  <Link href={it.link.href}>
                    <button className="text-xs text-primary hover:underline whitespace-nowrap inline-flex items-center gap-1 shrink-0">
                      {it.link.label} <ArrowRight className="h-3 w-3" />
                    </button>
                  </Link>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
