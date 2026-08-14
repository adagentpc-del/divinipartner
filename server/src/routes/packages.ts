/**
 * Phase 4 - Package routes. Mounted at /api/packages.
 *
 * Org-scoped CRUD for named bundles of inventory + services (blueprint 17).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as pkg from "../db/packages.js";
import { checkLimit, limitExceededPayload } from "../lib/entitlements.js";
import { instantBookPackage } from "../db/quotes.js";
import { refreshRelationshipGraphForQuote } from "../db/lifecycle.js";
import { notify } from "../lib/notify.js";
import { recipients } from "../lib/recipients.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function requireOrg(req: Request, res: Response): Promise<string | null> {
  const org = await requireOrgRow(req, res);
  return org?.id ?? null;
}

async function requireOrgRow(req: Request, res: Response): Promise<db.DbOrg | null> {
  const auth = getAuth(req);
  const actor = await db.getActor(auth.userId!, auth.email);
  if (!actor.org) {
    res.status(400).json({ error: "no organization for this account" });
    return null;
  }
  return actor.org;
}

const router = Router();

// GET /api/packages - list (optional ?status=)
router.get(
  "/",
  requireUser,
  h(async (req, res) => {
    const orgId = await requireOrg(req, res);
    if (!orgId) return;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const packages = await pkg.listPackages(orgId, status);
    res.json({ packages });
  }),
);

// GET /api/packages/vendor/:orgId/bookable - a vendor org's instant-bookable
// packages, for a client browsing before they book (moat roadmap Phase 2c).
// Registered BEFORE GET /:id -- Express matches route order, and /:id would
// otherwise swallow this (and /bookable below) as if "vendor" were an id.
router.get(
  "/vendor/:orgId/bookable",
  requireUser,
  h(async (req, res) => {
    const packages = await pkg.listBookablePackages(req.params.orgId);
    res.json({ packages });
  }),
);

// GET /api/packages/bookable - every instant-bookable package platform-wide
// (optional ?category=), for a client discovering vendors to book directly.
// Also registered BEFORE GET /:id for the same reason.
router.get(
  "/bookable",
  requireUser,
  h(async (req, res) => {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const packages = await pkg.listAllBookablePackages(category);
    res.json({ packages });
  }),
);

// GET /api/packages/:id - single
router.get(
  "/:id",
  requireUser,
  h(async (req, res) => {
    const orgId = await requireOrg(req, res);
    if (!orgId) return;
    const item = await pkg.getPackage(orgId, req.params.id);
    if (!item) return res.status(404).json({ error: "not found" });
    res.json({ package: item });
  }),
);

// POST /api/packages - create
router.post(
  "/",
  requireUser,
  h(async (req, res) => {
    const org = await requireOrgRow(req, res);
    if (!org) return;
    const used = await pkg.countPackages(org.id);
    const check = checkLimit(org, "packages", used);
    if (!check.allowed) {
      return res.status(402).json(limitExceededPayload(org, "packages", check));
    }
    const item = await pkg.createPackage(org.id, req.body ?? {});
    res.status(201).json({ package: item });
  }),
);

// PUT /api/packages/:id - update
router.put(
  "/:id",
  requireUser,
  h(async (req, res) => {
    const orgId = await requireOrg(req, res);
    if (!orgId) return;
    const item = await pkg.updatePackage(orgId, req.params.id, req.body ?? {});
    res.json({ package: item });
  }),
);

// DELETE /api/packages/:id - remove
router.delete(
  "/:id",
  requireUser,
  h(async (req, res) => {
    const orgId = await requireOrg(req, res);
    if (!orgId) return;
    const ok = await pkg.deletePackage(orgId, req.params.id);
    if (!ok) return res.status(404).json({ error: "not found" });
    res.status(204).end();
  }),
);

// POST /api/packages/:id/instant-book { event_id } - book this package
// against the actor's own event with no bid/quote back-and-forth: creates
// and immediately awards a quote through the same atomic awardQuote()
// transaction every negotiated award goes through.
router.post(
  "/:id/instant-book",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    const { event_id } = req.body ?? {};
    if (!event_id || typeof event_id !== "string") {
      return res.status(400).json({ error: "event_id required" });
    }
    const result = await instantBookPackage(actor, req.params.id, event_id);
    if (result.firstAward) await refreshRelationshipGraphForQuote(result.quote.id).catch(() => undefined);
    const to = await recipients.quoteVendorEmails(result.quote.id).catch(() => [] as string[]);
    if (to.length) await notify.quoteDecision(to, "accepted", { quoteId: result.quote.id }).catch(() => undefined);
    res.status(201).json({ quote: result.quote, contract: result.contract });
  }),
);

export default router;
