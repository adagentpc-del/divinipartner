/**
 * Intelligence Moat - Feature 13: Opportunity Engine (daily actionable feed).
 *
 * Pure, deterministic generator. The db / route layer (server/src/db/
 * opportunity.ts, server/src/routes/opportunities.ts) loads the role-relevant
 * raw data and passes it in; this module turns that data into a ranked list of
 * opportunity rows ready to persist. Same inputs always produce the same rows.
 * No DB work, no network, no AI calls.
 *
 * It reuses three existing deterministic engines:
 *   - recommendForEvent (server/src/lib/recommend.ts) for category fit,
 *   - scanVenue / scanEvent (server/src/lib/revenueLeakage.ts) for leakage,
 *   - simple matches over the supplied open projects / preferred requests.
 *
 * AI SEAM (intentionally NOT called): a future enhancement could re-rank or
 * enrich this feed with an LLM. Per the cost-control rules that must be
 * feature-flagged, manual-triggered, cached, and rate-limited. The `aiEnrich`
 * option below is the documented plug point; when false/undefined (the default)
 * the engine stays fully deterministic and free. See the commented seam at the
 * bottom of generateOpportunities.
 */
import { recommendForEvent } from "./recommend.js";
import {
  scanVenue,
  scanEvent,
  type VenueScanInput,
  type EventScanInput,
  type RevenueScanResult,
} from "./revenueLeakage.js";

export type OpportunityRole = "venue" | "vendor" | "planner" | "sponsor" | "client";

export type OpportunityKind =
  | "unused_inventory"
  | "revenue_leak"
  | "open_project"
  | "preferred_request"
  | "audience_match"
  | "cost_saving"
  | "enhancement"
  | "match"
  | "partnership_match";

/** A generated opportunity, ready to persist into the `opportunities` table. */
export type GeneratedOpportunity = {
  audience_role: OpportunityRole;
  audience_org_id: string | null;
  audience_user_id: string | null;
  kind: OpportunityKind;
  title: string;
  detail: Record<string, unknown>;
  potential_value: number;
  source: string;
};

/** The signed-in actor the feed is generated for (org / user scope). */
export type OpportunityActor = {
  orgId: string | null;
  userId: string | null;
};

/**
 * Raw, already-loaded inputs the engine reasons over. All optional: the route
 * supplies whatever it can for the actor's role, and the engine emits only the
 * opportunities the data supports.
 */
export type OpportunityInputs = {
  // Venue side (F4 leakage + unused inventory).
  venues?: Array<{
    venueId: string;
    name?: string | null;
    venueType?: string | null;
    audienceSize?: number | null;
    impressionEstimate?: number | null;
    capacity?: number | null;
    assets?: VenueScanInput["assets"];
    unsoldInventoryCount?: number | null;
  }>;
  // Event side (F4 leakage + category recommendation).
  events?: Array<{
    eventId: string;
    name?: string | null;
    eventType?: string | null;
    venueType?: string | null;
    guestCount?: number | null;
    budget?: number | null;
    bookedItems?: EventScanInput["bookedItems"];
    hasSponsors?: boolean | null;
    filledCategories?: string[] | null;
  }>;
  // Open projects relevant to a vendor / planner (simple match).
  openProjects?: Array<{
    eventId: string;
    name?: string | null;
    category?: string | null;
    budget?: number | null;
    region?: string | null;
  }>;
  // Preferred-vendor requests / invitations awaiting a response.
  preferredRequests?: Array<{
    venueId?: string | null;
    venueName?: string | null;
    tier?: string | null;
  }>;
  /**
   * AI enrich seam. NOT used by the deterministic engine and ignored today; it
   * exists so a feature-flagged, cached, rate-limited AI pass can be wired in
   * later WITHOUT changing this signature.
   */
  aiEnrich?: boolean;
};

const round = (n: number): number => Math.round(n);

/**
 * Generate the deterministic opportunity feed for an actor in a role. Returns
 * the rows to persist (highest potential_value first, ties broken by kind+title
 * for stable ordering). Pure and side-effect free.
 */
export function generateOpportunities(
  actor: OpportunityActor,
  role: OpportunityRole,
  inputs: OpportunityInputs = {},
): GeneratedOpportunity[] {
  const out: GeneratedOpportunity[] = [];
  const orgId = actor.orgId ?? null;
  const userId = actor.userId ?? null;

  // --- Venue role: leakage scans + unused inventory --------------------------
  if (role === "venue") {
    for (const v of inputs.venues ?? []) {
      const scan: RevenueScanResult = scanVenue({
        venueId: v.venueId,
        audienceSize: v.audienceSize ?? null,
        impressionEstimate: v.impressionEstimate ?? null,
        capacity: v.capacity ?? null,
        assets: v.assets ?? [],
      });
      if (scan.missed > 0) {
        const top = scan.suggestions.slice(0, 3);
        out.push({
          audience_role: "venue",
          audience_org_id: orgId,
          audience_user_id: null,
          kind: "revenue_leak",
          title: `${currency(scan.missed)} in unrealized revenue at ${v.name ?? "your venue"}`,
          detail: {
            venue_id: v.venueId,
            potential: scan.potential,
            captured: scan.captured,
            missed: scan.missed,
            top_suggestions: top,
          },
          potential_value: scan.missed,
          source: "leakage",
        });
      }
      const unsold = Number(v.unsoldInventoryCount ?? 0);
      if (Number.isFinite(unsold) && unsold > 0) {
        out.push({
          audience_role: "venue",
          audience_org_id: orgId,
          audience_user_id: null,
          kind: "unused_inventory",
          title: `${unsold} unsold inventory item${unsold === 1 ? "" : "s"} at ${v.name ?? "your venue"}`,
          detail: { venue_id: v.venueId, unsold_count: unsold },
          potential_value: 0,
          source: "inventory",
        });
      }
    }
  }

  // --- Venue / planner / client: per-event leakage + category enhancement ----
  if (role === "venue" || role === "planner" || role === "client") {
    for (const ev of inputs.events ?? []) {
      const scan = scanEvent({
        eventId: ev.eventId,
        guestCount: ev.guestCount ?? null,
        budget: ev.budget ?? null,
        bookedItems: ev.bookedItems ?? [],
        hasSponsors: ev.hasSponsors ?? null,
      });
      if (scan.missed > 0) {
        out.push({
          audience_role: role,
          audience_org_id: orgId,
          audience_user_id: null,
          kind: "revenue_leak",
          title: `${currency(scan.missed)} in add-on revenue available for ${ev.name ?? "this event"}`,
          detail: {
            event_id: ev.eventId,
            potential: scan.potential,
            captured: scan.captured,
            missed: scan.missed,
            top_suggestions: scan.suggestions.slice(0, 3),
          },
          potential_value: scan.missed,
          source: "leakage",
        });
      }

      // Category enhancement from the recommendation engine: surface the top
      // recommended categories the event has not filled yet.
      const rec = recommendForEvent({
        venueType: ev.venueType ?? null,
        eventType: ev.eventType ?? null,
        budget: ev.budget ?? null,
        guestCount: ev.guestCount ?? null,
      });
      const filled = new Set((ev.filledCategories ?? []).map((c) => (c ?? "").trim().toLowerCase()));
      const missingTop = rec.vendorCategories
        .filter((c) => c.score >= 55 && !filled.has(c.category))
        .slice(0, 3);
      if (missingTop.length > 0) {
        out.push({
          audience_role: role,
          audience_org_id: orgId,
          audience_user_id: null,
          kind: "enhancement",
          title: `Enhance ${ev.name ?? "this event"} with ${missingTop.map((c) => c.label).join(", ")}`,
          detail: {
            event_id: ev.eventId,
            recommended: missingTop.map((c) => ({ category: c.category, label: c.label, score: c.score, reasons: c.reasons })),
          },
          potential_value: 0,
          source: "recommend",
        });
      }
    }
  }

  // --- Vendor / planner: open projects matching the actor ---------------------
  if (role === "vendor" || role === "planner") {
    for (const p of inputs.openProjects ?? []) {
      out.push({
        audience_role: role,
        audience_org_id: orgId,
        audience_user_id: null,
        kind: "open_project",
        title: `Open project: ${p.name ?? "Untitled event"}${p.category ? ` (${p.category})` : ""}`,
        detail: {
          event_id: p.eventId,
          category: p.category ?? null,
          budget: p.budget ?? null,
          region: p.region ?? null,
        },
        potential_value: round(Number(p.budget ?? 0) || 0),
        source: "match",
      });
    }
  }

  // --- Vendor: preferred-vendor requests awaiting a response ------------------
  if (role === "vendor") {
    for (const r of inputs.preferredRequests ?? []) {
      out.push({
        audience_role: "vendor",
        audience_org_id: orgId,
        audience_user_id: null,
        kind: "preferred_request",
        title: `Preferred request from ${r.venueName ?? "a venue"}${r.tier ? ` (${r.tier})` : ""}`,
        detail: { venue_id: r.venueId ?? null, venue_name: r.venueName ?? null, tier: r.tier ?? null },
        potential_value: 0,
        source: "match",
      });
    }
  }

  // --- Sponsor: audience matches from open sponsorship inventory --------------
  if (role === "sponsor") {
    for (const v of inputs.venues ?? []) {
      const reach = Number(v.audienceSize ?? v.impressionEstimate ?? 0) || 0;
      if (reach <= 0) continue;
      out.push({
        audience_role: "sponsor",
        audience_org_id: orgId,
        audience_user_id: null,
        kind: "audience_match",
        title: `${v.name ?? "A venue"} reaches roughly ${reach.toLocaleString()} - a fit for your audience`,
        detail: { venue_id: v.venueId, reach, venue_type: v.venueType ?? null },
        potential_value: 0,
        source: "match",
      });
    }
  }

  out.sort(
    (a, b) =>
      b.potential_value - a.potential_value ||
      a.kind.localeCompare(b.kind) ||
      a.title.localeCompare(b.title),
  );

  // ---------------------------------------------------------------------------
  // AI ENRICH SEAM (intentionally NOT invoked). When wired up later, this is
  // where a feature-flagged, cached, rate-limited LLM pass would re-rank or
  // enrich `out` before it is returned. It must never run on the default path.
  //
  //   if (inputs.aiEnrich && featureFlagEnabled() && underRateLimit()) {
  //     return await aiRerankOpportunities(out, cacheKeyFor(actor, role, inputs));
  //   }
  // ---------------------------------------------------------------------------

  return out;
}

/** Format a whole-dollar amount for opportunity titles. */
function currency(n: number): string {
  const v = round(Number(n) || 0);
  return `$${v.toLocaleString()}`;
}
