/**
 * Phase 7 - Intelligence routes. Mount base: /api/intelligence.
 *
 * Exposes the deterministic intelligence engines (blueprints 25, 26, 27):
 *   GET  /next-best-action   - ranked per-role action prompts
 *   POST /scope-builder      - plain-English description -> structured scope
 *   POST /recommendations    - rank candidate vendors for an event's criteria
 *   POST /budget             - budget report + quote comparison
 *   POST /risk               - risk signals for an event
 *   GET  /trust              - the acting org's trust score
 *   GET  /trust/:targetType/:orgId - a specific org's trust score
 *
 * The state snapshots that drive next-best-action are gathered here from the
 * existing domain tables; the ranking logic lives in lib/nextbestaction.ts.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { q, q1 } from "../pool.js";
import {
  buildNextBestActions,
  type OrgStateSnapshot,
  type NbaRole,
} from "../lib/nextbestaction.js";
import {
  buildEventScope,
  rankVendorMatches,
  buildBudget,
  compareQuotes,
  detectRisks,
  type VendorCandidate,
  type EventCriteria,
} from "../lib/recommend.js";
import { computeTrustForOrg } from "../db/reviews.js";
import { detectRepeatRelationships } from "../db/starred.js";
import { winLossReport } from "../db/winloss.js";
import type { TrustTargetType } from "../lib/trust.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

const router = Router();
router.use(requireUser);

/** Gather a best-effort org-state snapshot for next-best-action. */
async function gatherSnapshot(a: db.Actor): Promise<OrgStateSnapshot> {
  const role = (a.user.role ?? a.org?.type ?? "client") as NbaRole;
  const orgId = a.org?.id ?? null;

  if (!orgId) {
    return { role };
  }

  // Counts from existing tables. Each query is independent.
  const [docs, overdue, repeats, trust, completedNoReview] = await Promise.all([
    q1<{ n: string }>(
      `select count(*)::int as n from documents
        where organization_id = $1 and (expiration_date is null or expiration_date > now())`,
      [orgId],
    ),
    q1<{ n: string }>(
      `select count(*)::int as n from invoices
        where (organization_id = $1 or vendor_id in (select id from vendors where organization_id = $1))
          and status = 'overdue'`,
      [orgId],
    ),
    detectRepeatRelationships(orgId).catch(() => []),
    computeTrustForOrg(orgId, (role === "venue" ? "venue" : role === "client" || role === "planner" ? "client" : "vendor") as TrustTargetType).catch(() => null),
    q1<{ n: string }>(
      `select count(*)::int as n from event_history eh
        where eh.organization_id = $1 and eh.outcome = 'completed'
          and not exists (
            select 1 from reviews r
             where r.event_id = eh.event_id and r.reviewer_org_id = $1 and r.status in ('submitted','published')
          )`,
      [orgId],
    ),
  ]);

  const documentsReady = Number(docs?.n ?? 0);
  const snapshot: OrgStateSnapshot = {
    role,
    documentsReady,
    overdueInvoices: Number(overdue?.n ?? 0),
    repeatPromptCount: Array.isArray(repeats) ? repeats.length : 0,
    completedAwaitingReview: Number(completedNoReview?.n ?? 0),
    trustScore: trust?.score ?? null,
  };

  // Role-specific counts.
  if (role === "vendor" || role === "supplier" || role === "installer") {
    const services = await q1<{ ok: boolean }>(
      `select true as ok from vendors where organization_id = $1 and services is not null limit 1`,
      [orgId],
    );
    snapshot.servicesListed = !!services?.ok;
  } else if (role === "venue") {
    const profile = await q1<{ ok: boolean }>(
      `select true as ok from profiles where organization_id = $1 and published_status = 'published' limit 1`,
      [orgId],
    );
    snapshot.profilePublished = !!profile?.ok;
    const active = await q1<{ n: string }>(
      `select count(*)::int as n from events
        where organization_id = $1 and status not in ('completed','closed','archived')`,
      [orgId],
    );
    snapshot.activeEvents = Number(active?.n ?? 0);
  } else {
    const active = await q1<{ n: string }>(
      `select count(*)::int as n from events
        where (client_id = $1 or planner_id = $1 or organization_id = $2)
          and status not in ('completed','closed','archived')`,
      [a.user.id, orgId],
    );
    snapshot.activeEvents = Number(active?.n ?? 0);
  }

  return snapshot;
}

/** Ranked next-best-action prompts for the acting org. */
router.get(
  "/next-best-action",
  h(async (req, res) => {
    const a = await actor(req);
    const snapshot = await gatherSnapshot(a);
    res.json({ role: snapshot.role, actions: buildNextBestActions(snapshot), snapshot });
  }),
);

/** Plain-English event description -> structured scope. */
router.post(
  "/scope-builder",
  h(async (req, res) => {
    const { description, guest_count, budget, event_type } = req.body ?? {};
    if (!description || typeof description !== "string") {
      return res.status(400).json({ error: "description required" });
    }
    const scope = buildEventScope(description, {
      guest_count: guest_count ?? null,
      budget: budget ?? null,
      event_type: event_type ?? null,
    });
    res.json({ scope });
  }),
);

/**
 * Rank vendor candidates for an event's criteria. Candidates are loaded from the
 * vendors table (joined to organizations for names + starred status for the
 * acting org); the scoring is deterministic.
 */
router.post(
  "/recommendations",
  h(async (req, res) => {
    const a = await actor(req);
    const criteria: EventCriteria = req.body?.criteria ?? req.body ?? {};
    const orgId = a.org?.id ?? null;
    const limit = Number(req.body?.limit) || 20;

    const rows = await dbCandidates(orgId, criteria);
    const matches = rankVendorMatches(criteria, rows, limit);
    res.json({ matches });
  }),
);

/** Budget report + quote comparison (blueprint 26.3). */
router.post(
  "/budget",
  h(async (req, res) => {
    const allocations = Array.isArray(req.body?.allocations) ? req.body.allocations : [];
    const quotes = Array.isArray(req.body?.quotes) ? req.body.quotes : [];
    res.json({
      budget: buildBudget(allocations, quotes),
      comparison: compareQuotes(quotes),
    });
  }),
);

/** Risk signals for an event (blueprint 26.4). */
router.post(
  "/risk",
  h(async (req, res) => {
    res.json({ risk: detectRisks(req.body ?? {}) });
  }),
);

/** Trust score for the acting org (role-derived target type). */
router.get(
  "/trust",
  h(async (req, res) => {
    const a = await actor(req);
    if (!a.org) return res.status(400).json({ error: "no organization for this account" });
    const role = a.user.role ?? a.org.type ?? "vendor";
    const targetType: TrustTargetType =
      role === "venue" ? "venue" : role === "client" || role === "planner" ? "client" : "vendor";
    res.json({ trust: await computeTrustForOrg(a.org.id, targetType) });
  }),
);

/** Trust score for a specific org + target type (for profiles / recommendations). */
router.get(
  "/trust/:targetType/:orgId",
  h(async (req, res) => {
    const targetType = req.params.targetType as TrustTargetType;
    if (!["vendor", "venue", "client"].includes(targetType)) {
      return res.status(400).json({ error: "invalid target type" });
    }
    res.json({ trust: await computeTrustForOrg(req.params.orgId, targetType) });
  }),
);

/**
 * Win/Loss + setup-efficacy scorecard (Super Admin). Won vs lost bids and
 * quotes, the bid win-rate trend over the last ~6 months, and a
 * profile-completeness vs win-rate efficacy rating. Pure aggregates over the
 * existing tables. Mounts under the same requireUser guard as the rest of this
 * router.
 */
router.get(
  "/winloss",
  h(async (_req, res) => {
    res.json({ report: await winLossReport() });
  }),
);

/**
 * Load vendor candidates for recommendation. Filters loosely by category /
 * region when supplied so scoring has a sensible pool, and flags which vendors
 * the acting org has starred.
 */
async function dbCandidates(orgId: string | null, criteria: EventCriteria): Promise<VendorCandidate[]> {
  const params: unknown[] = [orgId];
  let where = "v.status is distinct from 'inactive'";
  if (criteria.category) {
    params.push(criteria.category);
    where += ` and (v.category = $${params.length} or $${params.length} = any(v.subcategories))`;
  }
  const rows = await q<{
    id: string;
    organization_id: string;
    name: string | null;
    category: string | null;
    subcategories: string[] | null;
    service_radius: number | null;
    review_score: string | null;
    preferred_status: boolean | null;
    premier_status: boolean | null;
    starred: boolean | null;
    region: string | null;
    city: string | null;
  }>(
    `select v.id, v.organization_id, o.name, v.category, v.subcategories,
            v.service_radius, v.review_score, v.preferred_status, v.premier_status,
            (s.id is not null) as starred,
            ven.region, ven.city
       from vendors v
       left join organizations o on o.id = v.organization_id
       left join starred_vendors s on s.vendor_org_id = v.organization_id and s.organization_id = $1
       left join lateral (
         select region, city from venues where organization_id = v.organization_id limit 1
       ) ven on true
      where ${where}
      limit 200`,
    params,
  );
  return rows.map((r) => ({
    id: r.id,
    organization_id: r.organization_id,
    name: r.name,
    category: r.category,
    subcategories: r.subcategories,
    region: r.region,
    city: r.city,
    service_radius: r.service_radius,
    review_score: r.review_score == null ? null : Number(r.review_score),
    preferred_status: r.preferred_status,
    premier_status: r.premier_status,
    starred: !!r.starred,
  }));
}

export default router;
