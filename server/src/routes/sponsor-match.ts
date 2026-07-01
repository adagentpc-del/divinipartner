/**
 * Phase 3 Intelligence - Sponsor <-> Event matching routes.
 * Mount base: /sponsor-match (the lead wires the mount in routes.ts).
 *
 *   GET /meta                                   reference data (directions)
 *   GET /?direction=sponsors-for-event&id=<pkg-or-fevent-uuid>
 *                                               rank SPONSORS that fit an event/package
 *   GET /?direction=events-for-sponsor&id=<sponsor-org-uuid>
 *                                               rank EVENTS/PACKAGES that fit a sponsor
 *
 * Deterministic: loads the source + candidate pool + prior sponsorship history,
 * then scores via server/src/lib/sponsorMatch.ts (which mirrors the
 * partnershipMatch.ts scoring style). It does NOT rebuild vendor / partner
 * matching: that stays in partnershipMatch.ts and is cited, not duplicated.
 *
 * IDOR posture: this ranks fundraising inventory (events / packages) against
 * sponsor ORGS, both of which are discoverable in the sponsorship marketplace by
 * design, so the candidate pool is intentionally cross-org (like
 * partnership-match.ts). Source rows are loaded by id; prior-history signal is
 * scoped to the pairing only (sponsor_purchases between the two sides), so no
 * private operational data leaks. requireUser gates the endpoint.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as dbCore from "../db.js";
import { q, q1 } from "../pool.js";
import {
  matchSponsors,
  SPONSOR_MATCH_DIRECTIONS,
  type SponsorMatchDirection,
  type SponsorMatchEntity,
} from "../lib/sponsorMatch.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function getActor(req: Request): Promise<dbCore.Actor> {
  const auth = getAuth(req);
  return dbCore.getActor(auth.userId!, auth.email);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (n: unknown): number =>
  typeof n === "number" && Number.isFinite(n)
    ? n
    : typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n))
      ? Number(n)
      : 0;

/** True when a relation exists (graceful optional reads). */
async function tableExists(name: string): Promise<boolean> {
  const row = await q1<{ reg: string | null }>(`select to_regclass($1) as reg`, [name]);
  return !!row?.reg;
}

// ---- Source loaders --------------------------------------------------------

/**
 * Load a "package/event" source: try sponsorship_packages first (carries price +
 * cause via the parent fundraising_event), then fundraising_events directly.
 */
async function loadPackageSource(id: string): Promise<SponsorMatchEntity | null> {
  if (await tableExists("sponsorship_packages")) {
    const p = await q1<any>(
      `select sp.id, sp.name, sp.price, sp.tier, sp.status,
              fe.cause as cause, fe.guest_target as audience_size, fe.name as event_name
         from sponsorship_packages sp
         left join fundraising_events fe on fe.id = sp.fundraising_event_id
        where sp.id = $1`,
      [id],
    );
    if (p) {
      return {
        id: p.id,
        kind: "package",
        name: p.name ?? p.event_name ?? "Sponsorship package",
        cause: p.cause ?? null,
        category: p.tier ?? null,
        audience_size: num(p.audience_size) || null,
        amount: num(p.price) || null,
        tier: p.tier ?? null,
        status: p.status ?? null,
      };
    }
  }
  if (await tableExists("fundraising_events")) {
    const e = await q1<any>(
      `select id, name, cause, kind, guest_target, goal_amount, status
         from fundraising_events where id = $1`,
      [id],
    );
    if (e) {
      return {
        id: e.id,
        kind: "event",
        name: e.name ?? "Fundraising event",
        cause: e.cause ?? null,
        category: e.kind ?? null,
        audience_size: num(e.guest_target) || null,
        amount: num(e.goal_amount) || null,
        status: e.status ?? null,
      };
    }
  }
  return null;
}

/** Load a "sponsor" source: a sponsor organization. */
async function loadSponsorSource(id: string): Promise<SponsorMatchEntity | null> {
  const o = await q1<any>(`select id, name, type from organizations where id = $1`, [id]);
  if (!o) return null;
  return {
    id: o.id,
    kind: "sponsor",
    name: o.name ?? "Sponsor",
    industry: o.type ?? null,
    category: o.type ?? null,
  };
}

// ---- Candidate loaders -----------------------------------------------------

/** Sponsor candidates: organizations that act as sponsors, with prior spend. */
async function sponsorCandidates(): Promise<SponsorMatchEntity[]> {
  // Sponsor orgs are organizations whose type marks them sponsor-like. We treat
  // any org that has a sponsor_purchases row, or whose type is 'sponsor', as a
  // candidate. Prior spend (history_amount) comes from sponsor_purchases.
  const hasPurchases = await tableExists("sponsor_purchases");
  if (hasPurchases) {
    const rows = await q<any>(
      `select o.id, o.name, o.type,
              count(sp.id) as history_count,
              coalesce(sum(sp.amount),0) as history_amount
         from organizations o
         left join sponsor_purchases sp on sp.sponsor_org_id = o.id
        where o.type = 'sponsor' or sp.id is not null
        group by o.id
        order by history_amount desc, o.id
        limit 300`,
    );
    return rows.map((o) => ({
      id: o.id,
      kind: "sponsor" as const,
      name: o.name ?? "Sponsor",
      industry: o.type ?? null,
      category: o.type ?? null,
      history_count: num(o.history_count) || null,
      history_amount: num(o.history_amount) || null,
    }));
  }
  const rows = await q<any>(
    `select id, name, type from organizations where type = 'sponsor' order by id limit 300`,
  );
  return rows.map((o) => ({
    id: o.id,
    kind: "sponsor" as const,
    name: o.name ?? "Sponsor",
    industry: o.type ?? null,
    category: o.type ?? null,
  }));
}

/** Event/package candidates: open sponsorship packages with their event cause. */
async function packageCandidates(): Promise<SponsorMatchEntity[]> {
  if (!(await tableExists("sponsorship_packages"))) return [];
  const rows = await q<any>(
    `select sp.id, sp.name, sp.price, sp.tier, sp.status,
            fe.cause as cause, fe.guest_target as audience_size, fe.name as event_name
       from sponsorship_packages sp
       left join fundraising_events fe on fe.id = sp.fundraising_event_id
      where coalesce(sp.status,'open') = 'open'
      order by sp.id
      limit 300`,
  );
  return rows.map((p) => ({
    id: p.id,
    kind: "package" as const,
    name: p.name ?? p.event_name ?? "Sponsorship package",
    cause: p.cause ?? null,
    category: p.tier ?? null,
    audience_size: num(p.audience_size) || null,
    amount: num(p.price) || null,
    tier: p.tier ?? null,
    status: p.status ?? null,
  }));
}

/**
 * Prior pairing history between the source and each candidate, from
 * sponsor_purchases. Keyed by the OTHER side's id. Returns empty maps when the
 * table is absent so the engine simply omits the history signal.
 */
async function pairingHistory(
  direction: SponsorMatchDirection,
  sourceId: string,
): Promise<{ count: Record<string, number>; amount: Record<string, number> }> {
  const count: Record<string, number> = {};
  const amount: Record<string, number> = {};
  if (!(await tableExists("sponsor_purchases"))) return { count, amount };

  if (direction === "sponsors-for-event") {
    // Source is a package/event; candidates are sponsors. Join purchases on the
    // package, then on the package's parent event, to capture both linkages.
    const rows = await q<any>(
      `select sp.sponsor_org_id as other_id, count(*) as c, coalesce(sum(sp.amount),0) as a
         from sponsor_purchases sp
        where sp.sponsorship_package_id = $1 or sp.fundraising_event_id = $1
        group by sp.sponsor_org_id`,
      [sourceId],
    );
    for (const r of rows) {
      if (!r.other_id) continue;
      count[r.other_id] = num(r.c);
      amount[r.other_id] = num(r.a);
    }
  } else {
    // Source is a sponsor org; candidates are packages. Key by package id.
    const rows = await q<any>(
      `select sp.sponsorship_package_id as other_id, count(*) as c, coalesce(sum(sp.amount),0) as a
         from sponsor_purchases sp
        where sp.sponsor_org_id = $1 and sp.sponsorship_package_id is not null
        group by sp.sponsorship_package_id`,
      [sourceId],
    );
    for (const r of rows) {
      if (!r.other_id) continue;
      count[r.other_id] = num(r.c);
      amount[r.other_id] = num(r.a);
    }
  }
  return { count, amount };
}

const router = Router();
router.use(requireUser);

/** Reference data for the UI (supported directions). */
router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({ directions: SPONSOR_MATCH_DIRECTIONS });
  }),
);

/** Ranked sponsor <-> event matches. */
router.get(
  "/",
  h(async (req, res) => {
    await getActor(req); // gate + ensure the user row exists
    const direction = String(req.query.direction ?? "").trim() as SponsorMatchDirection;
    const id = String(req.query.id ?? "").trim();

    if (!SPONSOR_MATCH_DIRECTIONS.includes(direction)) {
      return res.status(400).json({ error: "valid direction required" });
    }
    if (!UUID_RE.test(id)) {
      return res.status(400).json({ error: "valid id (uuid) required" });
    }

    const source =
      direction === "sponsors-for-event"
        ? await loadPackageSource(id)
        : await loadSponsorSource(id);
    if (!source) {
      return res.status(404).json({ error: "source entity not found" });
    }

    const [candidates, history] = await Promise.all([
      direction === "sponsors-for-event" ? sponsorCandidates() : packageCandidates(),
      pairingHistory(direction, id),
    ]);

    const matches = matchSponsors({
      direction,
      source,
      candidates,
      historyCount: history.count,
      historyAmount: history.amount,
    });

    res.json({
      direction,
      source: { id: source.id, name: source.name ?? null, kind: source.kind },
      matches: matches.slice(0, 50),
    });
  }),
);

export default router;
