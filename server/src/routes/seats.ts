/**
 * Team seat routes. Mounted by the parent at /api/seats.
 *
 *   GET    /api/seats            list seats + billable count + monthly cost
 *   POST   /api/seats            add a seat { email, name? }
 *   DELETE /api/seats/:id        remove a seat
 *   POST   /api/seats/checkout   charge the monthly cost for billable seats
 *
 * Org-scoped: every action runs against the signed-in actor's organization.
 * The checkout path is optional/simple: when a processor is enabled it creates a
 * hosted checkout for the seat total; otherwise it returns a recorded marker so
 * billing is tracked without a money move.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import {
  listSeats,
  addSeat,
  removeSeat,
  countBillableSeats,
  monthlyCost,
} from "../db/seats.js";
import { enabledProcessors, createCheckout, type Processor } from "../lib/processors.js";
import { SEAT_PRICE_USD, PUBLIC_APP_URL, BASE_PATH } from "../config.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function appBaseUrl(req: Request): string {
  if (PUBLIC_APP_URL) return PUBLIC_APP_URL + BASE_PATH;
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
  const host = req.headers.host || "localhost";
  return `${proto}://${host}${BASE_PATH}`;
}

/** List the org's seats with the running billable count + monthly cost. */
router.get(
  "/",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) {
      return res.json({ seats: [], billable: 0, monthly_cost: 0, seat_price: SEAT_PRICE_USD });
    }
    const seats = await listSeats(actor.org.id);
    const billable = await countBillableSeats(actor.org.id);
    res.json({
      seats,
      billable,
      monthly_cost: monthlyCost(billable),
      seat_price: SEAT_PRICE_USD,
    });
  }),
);

/** Add a seat by email (with optional name). */
router.post(
  "/",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.status(400).json({ error: "register an organization first" });
    const b = req.body ?? {};
    const email = String(b.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "a valid email is required" });
    }
    const name = typeof b.name === "string" ? b.name : null;
    const seat = await addSeat(actor.org.id, email, name);
    res.status(201).json({ seat });
  }),
);

/** Remove a seat. */
router.delete(
  "/:id",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.status(404).json({ error: "not found" });
    const seat = await removeSeat(actor.org.id, req.params.id);
    if (!seat) return res.status(404).json({ error: "not found" });
    res.json({ seat });
  }),
);

/**
 * Charge the monthly cost for the org's billable seats. When a processor is
 * enabled we create a hosted checkout for the total and return its redirect_url.
 * When none is configured we return { recorded: true } so billing stays tracked
 * without breaking. Stripe is preferred when both are live.
 */
router.post(
  "/checkout",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.status(400).json({ error: "register an organization first" });

    const billable = await countBillableSeats(actor.org.id);
    const amount = monthlyCost(billable);
    if (billable <= 0 || amount <= 0) {
      return res.status(400).json({ error: "no billable seats to charge" });
    }

    const en = enabledProcessors();
    const processor: Processor | null = en.stripe ? "stripe" : en.paypal ? "paypal" : null;
    if (!processor) {
      return res.json({
        recorded: true,
        billable,
        monthly_cost: amount,
        note: "No payment processor is configured. Seat billing is tracked and will be charged once payments are enabled.",
      });
    }

    const base = appBaseUrl(req);
    const successUrl = `${base}/account/seats?seats=paid`;
    const cancelUrl = `${base}/account/seats?seats=cancel`;
    const checkout = await createCheckout({
      processor,
      amount,
      label: "Divini Partners team seats",
      successUrl,
      cancelUrl,
      metadata: {
        org_id: actor.org.id,
        kind: "team_seats",
        seats: String(billable),
        recorded_by: actor.user.id,
      },
    });
    res.status(201).json({ redirect_url: checkout.redirect_url, billable, monthly_cost: amount });
  }),
);

export default router;
