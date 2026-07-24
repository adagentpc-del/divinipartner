/**
 * WS-4c - PUBLIC event agenda (no auth). Mount base: /api/public/agenda.
 *
 *   GET /:eventId   the shareable schedule: event name/date + only the itinerary
 *                   items the organizer marked public, grouped by track then time.
 *
 * Only whitelisted, public-flagged fields are exposed. Production logistics items
 * (is_public = false) never appear. No auth: the organizer shares /agenda/:id.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { q, q1 } from "../pool.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();

router.get(
  "/:eventId",
  h(async (req, res) => {
    const eventId = req.params.eventId;
    const ev = await q1<{ id: string; name: string | null; date_time: string | null }>(
      `select id, name, date_time from events where id = $1`,
      [eventId],
    );
    if (!ev) return res.status(404).json({ error: "Event not found." });

    const items = await q<{
      id: string;
      title: string | null;
      description: string | null;
      start_time: string | null;
      end_time: string | null;
      location: string | null;
      track: string | null;
      category: string | null;
    }>(
      `select id, title, description, start_time, end_time, location, track, category
         from itinerary_items
        where event_id = $1 and is_public = true
        order by coalesce(start_time, 'infinity'::timestamptz) asc, track asc nulls first`,
      [eventId],
    );

    res.json({
      event: { id: ev.id, name: ev.name, date_time: ev.date_time },
      items,
    });
  }),
);

export default router;
