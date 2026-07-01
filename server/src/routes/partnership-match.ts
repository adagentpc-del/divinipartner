/**
 * Intelligence Moat addendum - F6 Partnership Matching Engine routes.
 * Mount base: /partnership-match (the lead wires the mount in routes.ts).
 *
 *   GET /?type=&id=&kind=   ranked partner matches for one source entity
 *
 * The route loads the source entity attributes, an org-relevant candidate pool,
 * and relationship-edge strengths, then scores them deterministically via
 * server/src/lib/partnershipMatch.ts. requireUser + getActor + h() wrapper.
 *
 * IDOR posture: matching ranks ecosystem partners (venues / vendors / sponsors /
 * clients) that are inherently discoverable in the marketplace, so the candidate
 * pool is global by design (the marketplace surfaces these anyway). The source
 * entity attributes are read by id, and relationship-edge strengths are scoped
 * to the actor org so private relationship signal never leaks across orgs.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as dbCore from "../db.js";
import { q } from "../pool.js";
import {
  match,
  type MatchEntity,
  type MatchEntityType,
  type TargetKind,
} from "../lib/partnershipMatch.js";
import { persistPartnershipMatches } from "../db/opportunity.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function getActor(req: Request): Promise<dbCore.Actor> {
  const auth = getAuth(req);
  return dbCore.getActor(auth.userId!, auth.email);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SOURCE_TYPES: MatchEntityType[] = [
  "venue",
  "vendor",
  "planner",
  "agency",
  "sponsor",
  "brand",
  "client",
];
const TARGET_KINDS: TargetKind[] = ["vendor", "sponsor", "client", "venue"];

const num = (n: unknown): number =>
  typeof n === "number" && Number.isFinite(n)
    ? n
    : typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n))
      ? Number(n)
      : 0;

// ---- Source loaders --------------------------------------------------------

async function loadVenue(id: string): Promise<MatchEntity | null> {
  const r = await q<any>(
    `select id, name, city, region, venue_type, capacity, amenities, review_score
       from venues where id = $1`,
    [id],
  );
  const v = r[0];
  if (!v) return null;
  return {
    id: v.id,
    kind: "venue",
    name: v.name ?? null,
    city: v.city ?? null,
    region: v.region ?? null,
    category: v.venue_type ?? null,
    capabilities: Array.isArray(v.amenities) ? v.amenities : [],
    capacity: num(v.capacity) || null,
    review_score: v.review_score != null ? num(v.review_score) : null,
  };
}

async function loadVendor(id: string): Promise<MatchEntity | null> {
  const r = await q<any>(
    `select id, category, subcategories, service_radius, review_score, organization_id
       from vendors where id = $1`,
    [id],
  );
  const v = r[0];
  if (!v) return null;
  return {
    id: v.id,
    kind: "vendor",
    name: v.category ?? "Vendor",
    category: v.category ?? null,
    capabilities: Array.isArray(v.subcategories) ? v.subcategories : [],
    review_score: v.review_score != null ? num(v.review_score) : null,
  };
}

/** Source can also be a planner / client / brand / agency (a user-rooted org). */
async function loadOrgEntity(id: string, kind: MatchEntityType): Promise<MatchEntity | null> {
  // For these source kinds we anchor on the user's own venue/vendor context when
  // present; otherwise return a thin entity so location/budget still flow from
  // query overrides. We resolve a name from organizations when id is an org.
  const r = await q<any>(`select id, name, type from organizations where id = $1`, [id]);
  const o = r[0];
  if (o) return { id: o.id, kind, name: o.name ?? kind, industry: o.type ?? null };
  // Fall back to a user row (planner / client are users).
  const u = await q<any>(`select id, name, email from users where id = $1`, [id]);
  const usr = u[0];
  if (usr) return { id: usr.id, kind, name: usr.name ?? usr.email ?? kind };
  return null;
}

async function loadSource(type: MatchEntityType, id: string): Promise<MatchEntity | null> {
  if (type === "venue") return loadVenue(id);
  if (type === "vendor") return loadVendor(id);
  return loadOrgEntity(id, type);
}

// ---- Candidate loaders -----------------------------------------------------

async function vendorCandidates(): Promise<MatchEntity[]> {
  const rows = await q<any>(
    `select v.id, v.organization_id, v.category, v.subcategories, v.review_score,
            coalesce(sum(case when iv.total is not null then iv.total else 0 end),0) as revenue
       from vendors v
       left join invoices iv on iv.vendor_id = v.id
      group by v.id
      order by v.id
      limit 300`,
  );
  return rows.map((v) => ({
    id: v.id,
    kind: "vendor" as const,
    name: v.category ?? "Vendor",
    category: v.category ?? null,
    capabilities: Array.isArray(v.subcategories) ? v.subcategories : [],
    review_score: v.review_score != null ? num(v.review_score) : null,
    revenue: num(v.revenue) || null,
    _orgId: v.organization_id ?? null,
  }));
}

async function venueCandidates(): Promise<MatchEntity[]> {
  const rows = await q<any>(
    `select id, organization_id, name, city, region, venue_type, capacity, amenities, review_score
       from venues
      order by id
      limit 300`,
  );
  return rows.map((v) => ({
    id: v.id,
    kind: "venue" as const,
    name: v.name ?? null,
    city: v.city ?? null,
    region: v.region ?? null,
    category: v.venue_type ?? null,
    capabilities: Array.isArray(v.amenities) ? v.amenities : [],
    capacity: num(v.capacity) || null,
    review_score: v.review_score != null ? num(v.review_score) : null,
    _orgId: v.organization_id ?? null,
  }));
}

async function sponsorCandidates(): Promise<MatchEntity[]> {
  // The Divini Score for a "sponsor" is keyed on the owning organization, so we
  // surface the opportunity's organization_id as the intelligence key.
  const rows = await q<any>(
    `select so.id, so.organization_id, so.name, so.category, so.audience_size, so.venue_id
       from sponsorship_opportunities so
      where so.status = 'open'
      order by so.id
      limit 300`,
  );
  return rows.map((s) => ({
    id: s.id,
    kind: "sponsor" as const,
    name: s.name ?? "Sponsorship",
    category: s.category ?? null,
    audience_size: num(s.audience_size) || null,
    _orgId: s.organization_id ?? null,
    _scoreId: s.organization_id ?? null, // sponsor score is keyed on the org
  }));
}

async function clientCandidates(): Promise<MatchEntity[]> {
  const rows = await q<any>(
    `select id, organization_id, name, email from users where role = 'client' order by id limit 300`,
  );
  return rows.map((c) => ({
    id: c.id,
    kind: "client" as const,
    name: c.name ?? c.email ?? "Client",
    _orgId: c.organization_id ?? null,
  }));
}

async function loadCandidates(kind: TargetKind): Promise<MatchEntity[]> {
  if (kind === "vendor") return vendorCandidates();
  if (kind === "venue") return venueCandidates();
  if (kind === "sponsor") return sponsorCandidates();
  return clientCandidates();
}

/** Carrier fields the loaders stash so attachIntelligence can resolve the caches. */
type CandidateWithKeys = MatchEntity & { _orgId?: string | null; _scoreId?: string | null };

/**
 * Attach the previously-computed-but-unconsumed intelligence to each candidate:
 *   - divini_score: the cached per-entity Divini Score (divini_scores), keyed on
 *     (entity_type, entity_id). For sponsors that key is the org id (_scoreId);
 *     for everyone else it is the candidate's own id.
 *   - business_health: the owning org's Business Health (business_health_scores),
 *     keyed on org id (_orgId).
 * Both are batch-loaded in one query each (no N+1) and left null when absent so
 * the engine ranks the candidate on fit alone (graceful absence). Best-effort:
 * an intelligence load failure must never break the live match response.
 */
async function attachIntelligence(
  kind: TargetKind,
  candidates: CandidateWithKeys[],
): Promise<MatchEntity[]> {
  const entityType = kind; // TargetKind values map 1:1 to divini entity types
  const scoreIds = Array.from(
    new Set(candidates.map((c) => c._scoreId ?? c.id).filter(Boolean) as string[]),
  );
  const orgIds = Array.from(
    new Set(candidates.map((c) => c._orgId).filter(Boolean) as string[]),
  );

  const diviniByKey = new Map<string, number>();
  const healthByOrg = new Map<string, number>();

  try {
    if (scoreIds.length > 0) {
      const rows = await q<{ entity_id: string; score: number }>(
        `select entity_id, score from divini_scores
          where entity_type = $1 and entity_id = any($2::uuid[])`,
        [entityType, scoreIds],
      );
      for (const r of rows) diviniByKey.set(r.entity_id, num(r.score));
    }
    if (orgIds.length > 0) {
      const rows = await q<{ org_id: string; score: number }>(
        `select org_id, score from business_health_scores
          where org_id = any($1::uuid[])`,
        [orgIds],
      );
      for (const r of rows) healthByOrg.set(r.org_id, num(r.score));
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("attachIntelligence failed (non-fatal):", err);
  }

  return candidates.map((c) => {
    const scoreKey = c._scoreId ?? c.id;
    const dv = diviniByKey.has(scoreKey) ? diviniByKey.get(scoreKey)! : null;
    const bh = c._orgId && healthByOrg.has(c._orgId) ? healthByOrg.get(c._orgId)! : null;
    const { _orgId, _scoreId, ...entity } = c;
    return { ...entity, divini_score: dv, business_health: bh };
  });
}

/**
 * Aggregate relationship-edge strength + revenue from the actor org's edges,
 * keyed by candidate id, for any edge that touches the source entity.
 */
async function edgeStrengths(
  orgId: string | null,
  sourceId: string,
): Promise<{ strength: Record<string, number>; revenue: Record<string, number> }> {
  const rows = await q<any>(
    `select from_id, to_id, weight, revenue
       from relationship_edges
      where ($1::uuid is null or organization_id = $1)
        and (from_id = $2 or to_id = $2)`,
    [orgId, sourceId],
  );
  const strength: Record<string, number> = {};
  const revenue: Record<string, number> = {};
  for (const r of rows) {
    const other = r.from_id === sourceId ? r.to_id : r.from_id;
    strength[other] = (strength[other] ?? 0) + num(r.weight);
    revenue[other] = (revenue[other] ?? 0) + num(r.revenue);
  }
  return { strength, revenue };
}

const router = Router();
router.use(requireUser);

/** Reference data for the UI (source types + target kinds). */
router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({ sourceTypes: SOURCE_TYPES, targetKinds: TARGET_KINDS });
  }),
);

/** Ranked partner matches. */
router.get(
  "/",
  h(async (req, res) => {
    const a = await getActor(req);
    const type = String(req.query.type ?? "").trim() as MatchEntityType;
    const id = String(req.query.id ?? "").trim();
    const kind = String(req.query.kind ?? "").trim() as TargetKind;

    if (!SOURCE_TYPES.includes(type)) {
      return res.status(400).json({ error: "valid type required" });
    }
    if (!UUID_RE.test(id)) {
      return res.status(400).json({ error: "valid id (uuid) required" });
    }
    if (!TARGET_KINDS.includes(kind)) {
      return res.status(400).json({ error: "valid kind required" });
    }

    const source = await loadSource(type, id);
    if (!source) {
      return res.status(404).json({ error: "source entity not found" });
    }

    const [rawCandidates, edges] = await Promise.all([
      loadCandidates(kind),
      edgeStrengths(a.org?.id ?? null, id),
    ]);

    // Overlay the cached Divini Score + Business Health so the ranking consumes
    // the recomputed intelligence (not just the raw fit / trust signals).
    const candidates = await attachIntelligence(kind, rawCandidates as CandidateWithKeys[]);

    const matches = match(type, id, kind, {
      source,
      candidates,
      edgeStrength: edges.strength,
      edgeRevenue: edges.revenue,
    });

    // F6 -> F13 intelligence loop: persist the qualifying matches into the
    // Opportunity Feed so proactive partnerships surface in the actor's daily
    // opportunities. Best-effort and idempotent (dedupe key per pairing); a write
    // hiccup must never break the live match response.
    try {
      await persistPartnershipMatches(
        a,
        { type, id, name: source.name ?? null },
        kind,
        matches,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("persistPartnershipMatches failed (non-fatal):", err);
    }

    res.json({
      source: { type, id, name: source.name ?? null, kind },
      targetKind: kind,
      matches: matches.slice(0, 50),
    });
  }),
);

export default router;
