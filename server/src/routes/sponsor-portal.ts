/**
 * Workstream C - Sponsor Portal discovery routes. Mount base: /api/sponsor-portal.
 *
 * Read-only discovery for sponsors: browse the sponsorship_packages a nonprofit
 * has published (the Workstream B table, queried by name and joined to
 * fundraising_events for context). Any signed-in user may browse; the listing is
 * intentionally cross-org (status open / active). Degrades to an empty list when
 * Workstream B has not seeded its tables yet.
 *
 * Mirrors the h() + actor(req) patterns of server/src/routes/sponsorships.ts.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { q, q1 } from "../pool.js";

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

/**
 * Browse available sponsorship offerings. Joins fundraising_events for event
 * name/date context where available. Optional ?event=<fundraising_event_id> and
 * ?limit=. Read-only and best-effort: any DB error (most likely the B tables not
 * existing yet) returns an empty list rather than failing the request.
 */
router.get(
  "/packages",
  h(async (req, res) => {
    await actor(req); // require a resolved user; listing is cross-org
    const eventId = typeof req.query.event === "string" ? req.query.event : null;
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : NaN;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 100;

    // Workstream B's sponsorship_packages.status defaults to 'open'. Treat 'open'
    // (and historical 'active'/'published') as browsable so a sponsor can see a
    // nonprofit's published packages.
    const where: string[] = [
      "(pk.status is null or pk.status in ('open','active','published'))",
    ];
    const params: unknown[] = [];
    if (eventId) {
      params.push(eventId);
      where.push(`pk.fundraising_event_id = $${params.length}`);
    }
    params.push(limit);

    const rows = await q(
      `select pk.id, pk.fundraising_event_id, pk.organization_id, pk.tier, pk.name,
              pk.price, pk.benefits, pk.tickets_included, pk.quantity, pk.sold,
              pk.status,
              fe.name as event_name, fe.event_date as event_starts_at
         from sponsorship_packages pk
         left join fundraising_events fe on fe.id = pk.fundraising_event_id
        where ${where.join(" and ")}
        order by pk.price asc nulls last, pk.created_at desc
        limit $${params.length}`,
      params,
    ).catch(() => [] as unknown[]);

    res.json({ packages: rows });
  }),
);

/** One package by id (read-only). Returns null when missing or B is absent. */
router.get(
  "/packages/:id",
  h(async (req, res) => {
    await actor(req);
    const row = await q1(
      `select pk.id, pk.fundraising_event_id, pk.organization_id, pk.tier, pk.name,
              pk.price, pk.benefits, pk.tickets_included, pk.quantity, pk.sold,
              pk.fulfillment_checklist, pk.status,
              fe.name as event_name, fe.event_date as event_starts_at
         from sponsorship_packages pk
         left join fundraising_events fe on fe.id = pk.fundraising_event_id
        where pk.id = $1`,
      [req.params.id],
    ).catch(() => null);
    res.json({ package: row });
  }),
);

export default router;
