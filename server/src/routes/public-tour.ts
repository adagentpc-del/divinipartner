/**
 * Public tour landing (no auth). Mount base: /api/public/tour.
 *   GET /:tourId   the tour name + its stops, each linking to /event/:eventId.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import * as tours from "../db/tours.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();

router.get(
  "/:tourId",
  h(async (req, res) => {
    const t = await tours.getPublicTour(req.params.tourId);
    if (!t) return res.status(404).json({ error: "Tour not found." });
    res.json({ tour: t.tour, stops: t.stops });
  }),
);

export default router;
