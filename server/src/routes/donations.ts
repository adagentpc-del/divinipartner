/**
 * Nonprofit donor + donations routes. Mount base: /api/donations.
 *
 * CRUD over a nonprofit org's donors and donations. Recording a donation rolls
 * the gift into the donor's lifetime total (handled in the repo) and fires the
 * donationReceived + donorReceipt notifications. Every route is org-scoped and
 * IDOR-safe via the donor repo (server/src/db/donor.ts). Mirrors
 * server/src/routes/fundraising-events.ts: requireUser, getActor, the h() async
 * wrapper, 400 on bad input, 403/404 from ForbiddenError/NotFoundError.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as donor from "../db/donor.js";
import { notify } from "../lib/notify.js";

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

// ---- donors ----------------------------------------------------------------

/** List the actor org's donors. */
router.get(
  "/donors",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ donors: await donor.listDonors(a) });
  }),
);

/** Get one donor (org-scoped). */
router.get(
  "/donors/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ donor: await donor.getDonor(a, req.params.id) });
  }),
);

/** Create a donor for the actor's org. */
router.post(
  "/donors",
  h(async (req, res) => {
    const a = await actor(req);
    res.status(201).json({ donor: await donor.createDonor(a, req.body ?? {}) });
  }),
);

/** Patch a donor (org-scoped). */
router.patch(
  "/donors/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ donor: await donor.updateDonor(a, req.params.id, req.body ?? {}) });
  }),
);

/** Delete a donor (org-scoped). */
router.delete(
  "/donors/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await donor.deleteDonor(a, req.params.id);
    res.status(204).end();
  }),
);

// ---- donations -------------------------------------------------------------

/** List the actor org's donations. */
router.get(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ donations: await donor.listDonations(a) });
  }),
);

/**
 * Record a donation. Updates the donor rollup (repo) and notifies: a generic
 * donationReceived to the org, plus a tax-deductible donorReceipt to the donor
 * when an email is on file.
 */
router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const body = req.body ?? {};
    const donation = await donor.createDonation(a, body);
    const amount = `$${Number(donation.amount ?? 0).toLocaleString("en-US")}`;
    const orgTo = a.user.email ?? a.org?.name ?? "nonprofit";
    void notify.donationReceived(orgTo, amount, {
      donationId: donation.id,
      orgName: a.org?.name ?? null,
    });
    if (donation.donor_id) {
      const d = await donor.getDonor(a, donation.donor_id).catch(() => null);
      if (d?.email) {
        void notify.donorReceipt(d.email, amount, {
          donationId: donation.id,
          orgName: a.org?.name ?? null,
        });
      }
    }
    res.status(201).json({ donation });
  }),
);

/** Patch a donation (org-scoped). */
router.patch(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ donation: await donor.updateDonation(a, req.params.id, req.body ?? {}) });
  }),
);

/** Delete a donation (org-scoped). */
router.delete(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await donor.deleteDonation(a, req.params.id);
    res.status(204).end();
  }),
);

export default router;
