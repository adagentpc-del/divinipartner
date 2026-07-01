/**
 * Phase 3 Intelligence - Donor prospecting routes.
 * Mount base: /donor-prospect (the lead wires the mount in routes.ts).
 *
 *   GET /            ranked donor prospects for the actor's nonprofit org
 *
 * Deterministic: cross-reads the donor tables (donors + donations) BY NAME,
 * probing each with to_regclass so the endpoint degrades to an empty list when
 * Workstream's donor schema is absent. Aggregates per-donor RFM stats and ranks
 * via server/src/lib/donorProspect.ts (pure). Optionally fires
 * notify.donorProspectIdentified for the strongest new major-gift prospect.
 *
 * IDOR posture: donors belong to the nonprofit organization that created them
 * (donors.organization_id). The list is ALWAYS scoped to the actor's own org
 * (admins with no org see all); a forged id is never accepted because the route
 * takes no donor id from the caller. requireUser gates the endpoint.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as dbCore from "../db.js";
import { q, q1 } from "../pool.js";
import { rankDonors, type DonorStats, type DonorProspect } from "../lib/donorProspect.js";
import { notify } from "../lib/notify.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function getActor(req: Request): Promise<dbCore.Actor> {
  const auth = getAuth(req);
  return dbCore.getActor(auth.userId!, auth.email);
}

const num = (n: unknown): number =>
  typeof n === "number" && Number.isFinite(n)
    ? n
    : typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n))
      ? Number(n)
      : 0;

function isAdmin(actor: dbCore.Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

/** True when a relation exists (graceful degradation when donor tables absent). */
async function tableExists(name: string): Promise<boolean> {
  const row = await q1<{ reg: string | null }>(`select to_regclass($1) as reg`, [name]);
  return !!row?.reg;
}

/** Per-donor donation aggregates keyed by donor_id (frequency / largest / first). */
type DonationAgg = {
  gift_count: number;
  largest_gift: number;
  first_gift_at: string | null;
  last_gift_at: string | null;
  sum_received: number;
};

/**
 * Load donors for the actor org and enrich each with donation aggregates. Reads
 * `donors` and (when present) `donations` by name. Returns [] when there is no
 * donor table or no org context, so the surface shows a graceful empty state.
 */
async function loadDonorStats(actor: dbCore.Actor): Promise<DonorStats[]> {
  if (!(await tableExists("donors"))) return [];

  const orgId = actor.org?.id ?? null;
  const scoped = !(isAdmin(actor) && !orgId);
  if (scoped && !orgId) return []; // a non-admin with no org sees nothing

  const donorRows = scoped
    ? await q<any>(
        `select id, name, email, total_given, last_gift_at from donors where organization_id = $1`,
        [orgId],
      )
    : await q<any>(`select id, name, email, total_given, last_gift_at from donors`);

  // Donation-level aggregates (frequency, largest, first gift). Optional table.
  const aggById = new Map<string, DonationAgg>();
  if (await tableExists("donations")) {
    const aggRows = scoped
      ? await q<any>(
          `select donor_id,
                  count(*) filter (where coalesce(status,'recorded') <> 'refunded') as gift_count,
                  coalesce(max(amount) filter (where coalesce(status,'recorded') <> 'refunded'),0) as largest_gift,
                  min(created_at) as first_gift_at,
                  max(created_at) as last_gift_at,
                  coalesce(sum(amount) filter (where coalesce(status,'recorded') <> 'refunded'),0) as sum_received
             from donations
            where organization_id = $1 and donor_id is not null
            group by donor_id`,
          [orgId],
        )
      : await q<any>(
          `select donor_id,
                  count(*) filter (where coalesce(status,'recorded') <> 'refunded') as gift_count,
                  coalesce(max(amount) filter (where coalesce(status,'recorded') <> 'refunded'),0) as largest_gift,
                  min(created_at) as first_gift_at,
                  max(created_at) as last_gift_at,
                  coalesce(sum(amount) filter (where coalesce(status,'recorded') <> 'refunded'),0) as sum_received
             from donations
            where donor_id is not null
            group by donor_id`,
        );
    for (const r of aggRows) {
      aggById.set(r.donor_id, {
        gift_count: num(r.gift_count),
        largest_gift: num(r.largest_gift),
        first_gift_at: r.first_gift_at ?? null,
        last_gift_at: r.last_gift_at ?? null,
        sum_received: num(r.sum_received),
      });
    }
  }

  return donorRows.map((d) => {
    const agg = aggById.get(d.id);
    // Prefer the denormalized donor rollups; fall back to donation aggregates.
    const total = num(d.total_given) || (agg ? agg.sum_received : 0);
    return {
      id: d.id,
      name: d.name ?? null,
      email: d.email ?? null,
      total_given: total,
      gift_count: agg?.gift_count ?? (total > 0 ? 1 : 0),
      largest_gift: agg?.largest_gift ?? (agg ? 0 : total),
      last_gift_at: d.last_gift_at ?? agg?.last_gift_at ?? null,
      first_gift_at: agg?.first_gift_at ?? null,
    };
  });
}

const router = Router();
router.use(requireUser);

/** Ranked donor prospects for the actor's nonprofit org. */
router.get(
  "/",
  h(async (req, res) => {
    const actor = await getActor(req);
    const donors = await loadDonorStats(actor);

    if (donors.length === 0) {
      return res.json({ prospects: [], total: 0, empty: true });
    }

    const limit = (() => {
      const n = Number(req.query.limit);
      return Number.isFinite(n) && n > 0 && n <= 200 ? Math.floor(n) : 50;
    })();

    const prospects = rankDonors(donors, { limit });

    // Optional best-effort notify: surface the single strongest, high-value
    // prospect so the org's team can act. Never blocks the response. Only fires
    // for a genuinely strong prospect to avoid noise.
    try {
      const top = prospects[0] as DonorProspect | undefined;
      const to = actor.user.email;
      if (top && to && top.score >= 70 && num(top.donor.total_given) >= 1000) {
        const label = top.donor.name || top.donor.email || "a major-gift prospect";
        await notify.donorProspectIdentified(to, label, {
          donor_id: top.donor.id,
          score: top.score,
          suggested_ask: top.suggested_ask,
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("donorProspectIdentified notify failed (non-fatal):", err);
    }

    res.json({ prospects, total: prospects.length, empty: false });
  }),
);

export default router;
