/**
 * Public ticket purchase flow - discovery routes. Mount base: /api/ticket-portal.
 *
 * Read-only discovery: browse the ticket_packages a nonprofit has published
 * (queried by name and joined to fundraising_events for context). Any
 * signed-in user may browse; the listing is intentionally cross-org (status
 * open). Mirrors server/src/routes/sponsor-portal.ts.
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
 * Browse available ticket offerings. Joins fundraising_events for event
 * name/date context where available. Optional ?event=<fundraising_event_id>
 * and ?limit=. Read-only and best-effort: any DB error returns an empty list
 * rather than failing the request.
 */
router.get(
  "/packages",
  h(async (req, res) => {
    await actor(req); // require a resolved user; listing is cross-org
    const eventId = typeof req.query.event === "string" ? req.query.event : null;
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : NaN;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 100;

    const where: string[] = ["(tp.status is null or tp.status in ('open','active','published'))"];
    const params: unknown[] = [];
    if (eventId) {
      params.push(eventId);
      where.push(`tp.fundraising_event_id = $${params.length}`);
    }
    params.push(limit);

    const rows = await q(
      `select tp.id, tp.fundraising_event_id, tp.organization_id, tp.name, tp.type,
              tp.price, tp.seats, tp.quantity, tp.sold, tp.status,
              fe.name as event_name, fe.event_date as event_starts_at
         from ticket_packages tp
         left join fundraising_events fe on fe.id = tp.fundraising_event_id
        where ${where.join(" and ")}
        order by tp.price asc nulls last, tp.created_at desc
        limit $${params.length}`,
      params,
    ).catch(() => [] as unknown[]);

    res.json({ packages: rows });
  }),
);

/** One package by id (read-only). Returns null when missing. */
router.get(
  "/packages/:id",
  h(async (req, res) => {
    await actor(req);
    const row = await q1(
      `select tp.id, tp.fundraising_event_id, tp.organization_id, tp.name, tp.type,
              tp.price, tp.seats, tp.quantity, tp.sold, tp.status,
              fe.name as event_name, fe.event_date as event_starts_at
         from ticket_packages tp
         left join fundraising_events fe on fe.id = tp.fundraising_event_id
        where tp.id = $1`,
      [req.params.id],
    ).catch(() => null);
    res.json({ package: row });
  }),
);

export default router;
