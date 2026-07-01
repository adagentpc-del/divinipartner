/**
 * Workstream C - Sponsor Purchases + Fulfillment routes.
 * Mount base: /api/sponsor-purchases.
 *
 *   GET    /                         purchases for the actor (sponsor: own;
 *                                     nonprofit: against its packages)
 *   POST   /                         express interest in a package
 *   GET    /:id                      one purchase (IDOR-scoped)
 *   POST   /:id/agreement            attach a signed-agreement document, -> agreed
 *   POST   /:id/checkout             initiate a payment for the sponsorship
 *   POST   /:id/paid                 record a completed payment, -> paid + seed tasks
 *   POST   /:id/assets               store logo / ad url (notify if missing near event)
 *   PATCH  /:id/status               nonprofit advances fulfilled / cancelled
 *   GET    /:id/guests               sponsor guest names for this purchase
 *   POST   /:id/guests               add a guest name (up to the allotment)
 *   GET    /:id/tasks                fulfillment tasks for this purchase
 *   POST   /:id/tasks                add a fulfillment task (nonprofit)
 *   PATCH  /tasks/:taskId            update a fulfillment task status
 *
 * Auth model: every route requires a signed-in user with an org. A sponsor sees
 * and drives their own purchases; the nonprofit that owns a package sees those
 * purchases and works fulfillment. IDOR enforcement lives in the data layer
 * (getPurchaseScoped / actorIsNonprofitOwner / actorIsSponsor).
 *
 * Payment initiation REUSES the existing processor/checkout flow (lib/processors
 * createCheckout), exactly as server/src/routes/payments.ts does: it creates a
 * hosted Stripe/PayPal checkout session and returns the redirect_url. No money is
 * auto-charged here; the purchase is marked paid only after the client returns
 * and the payment is recorded via the existing /api/payments/capture flow, which
 * this route's POST /:id/paid links to the purchase.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { q1 } from "../pool.js";
import * as repo from "../db/sponsor-purchases.js";
import { autoCloseSponsorPurchase } from "../db/lifecycle.js";
import {
  seedFulfillment,
  notifyInterest,
  notifyPurchased,
  notifyMissingAssetsIfAny,
  notifyFulfillmentDue,
} from "../lib/sponsorFulfillment.js";
import { enabledProcessors, createCheckout, type Processor } from "../lib/processors.js";
import { PUBLIC_APP_URL, BASE_PATH } from "../config.js";
import { validateUrlUpload } from "../lib/uploadGuard.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

function appBaseUrl(req: Request): string {
  if (PUBLIC_APP_URL) return PUBLIC_APP_URL + BASE_PATH;
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
  const host = req.headers.host || "localhost";
  return `${proto}://${host}${BASE_PATH}`;
}

const router = Router();
router.use(requireUser);

/**
 * List purchases for the actor. A sponsor org gets its own purchases; the same
 * call also returns purchases made against packages the actor's org owns
 * (nonprofit side), so a nonprofit user sees its incoming sponsorships. The two
 * sets are merged and de-duplicated by id.
 */
router.get(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    if (!a.org) return res.json({ purchases: [] });
    const [asSponsor, asNonprofit] = await Promise.all([
      repo.listForSponsor(a.org.id),
      repo.listForNonprofit(a.org.id),
    ]);
    const byId = new Map<string, repo.SponsorPurchase>();
    for (const p of [...asSponsor, ...asNonprofit]) byId.set(p.id, p);
    res.json({ purchases: [...byId.values()] });
  }),
);

/** Express interest in a sponsorship package (sponsor side). */
router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    if (!a.org) return res.status(400).json({ error: "register an organization first" });
    const body = req.body ?? {};
    const packageId = body.sponsorship_package_id;
    if (!packageId || typeof packageId !== "string") {
      return res.status(400).json({ error: "sponsorship_package_id required" });
    }
    const purchase = await repo.createInterest(a.org.id, packageId);
    // Notify the nonprofit that owns the package (best-effort).
    void notifyInterest(purchase);
    res.status(201).json({ purchase });
  }),
);

/** One purchase, with its tasks and guests, IDOR-scoped. */
router.get(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    const purchase = await repo.getPurchaseScoped(a, req.params.id);
    const [tasks, guests, guestCount] = await Promise.all([
      repo.listTasks(purchase.id),
      repo.listSponsorGuests(purchase.id),
      repo.sponsorGuestCount(purchase.id),
    ]);
    res.json({ purchase, tasks, guests, guest_count: guestCount });
  }),
);

/**
 * Attach a signed sponsorship agreement. The sponsor either passes an existing
 * agreement_doc_id, or a file_url we wrap in a documents row (related to the
 * purchase). Advances interested -> agreed.
 */
router.post(
  "/:id/agreement",
  h(async (req, res) => {
    const a = await actor(req);
    const purchase = await repo.getPurchaseScoped(a, req.params.id);
    if (!repo.actorIsSponsor(a, purchase)) {
      return res.status(403).json({ error: "only the sponsor can sign the agreement" });
    }
    const body = req.body ?? {};
    let docId: string | null = typeof body.agreement_doc_id === "string" ? body.agreement_doc_id : null;
    if (!docId && typeof body.file_url === "string" && body.file_url) {
      const check = validateUrlUpload(body.file_url.trim(), { allow: "documents" });
      if (!check.ok) return res.status(400).json({ error: check.reason });
      const doc = await q1<{ id: string }>(
        `insert into documents
           (owner_id, organization_id, related_object_type, related_object_id,
            document_type, file_url, approval_status)
         values ($1,$2,'sponsor_purchase',$3,'sponsorship_agreement',$4,'pending')
         returning id`,
        [a.user.id, a.org?.id ?? null, purchase.id, body.file_url],
      );
      docId = doc?.id ?? null;
    }
    if (!docId) {
      return res.status(400).json({ error: "agreement_doc_id or file_url required" });
    }
    const updated = await repo.markAgreed(purchase.id, docId);
    res.json({ purchase: updated });
  }),
);

/**
 * Initiate a hosted checkout for the sponsorship amount. REUSES the existing
 * processor flow (lib/processors createCheckout), mirroring
 * POST /api/payments/checkout. Returns a redirect_url; no money moves here. When
 * no processor is configured, returns record_only so the client can fall back to
 * the manual paid confirmation. The purchase is only marked paid via /:id/paid
 * after the client returns through the existing capture flow.
 */
router.post(
  "/:id/checkout",
  h(async (req, res) => {
    const a = await actor(req);
    if (!a.org) return res.status(400).json({ error: "register an organization first" });
    const purchase = await repo.getPurchaseScoped(a, req.params.id);
    if (!repo.actorIsSponsor(a, purchase)) {
      return res.status(403).json({ error: "only the sponsor can pay for this sponsorship" });
    }
    const body = req.body ?? {};
    const processor = body.processor as Processor;
    if (processor !== "stripe" && processor !== "paypal") {
      return res.status(400).json({ error: "processor must be 'stripe' or 'paypal'" });
    }
    const en = enabledProcessors();
    if ((processor === "stripe" && !en.stripe) || (processor === "paypal" && !en.paypal)) {
      // Not configured: caller falls back to record-only (POST /:id/paid).
      return res.status(200).json({ record_only: true });
    }
    const amount = Number(body.amount ?? purchase.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "positive amount required" });
    }
    const base = appBaseUrl(req);
    const successUrl =
      `${base}/pay/return?processor=${processor}&flow=client_to_vendor&kind=full` +
      (processor === "stripe" ? "&session_ref={CHECKOUT_SESSION_ID}" : "");
    const cancelUrl = `${base}/pay/return?status=cancel`;
    const checkout = await createCheckout({
      processor,
      amount,
      label: `Sponsorship: ${purchase.id}`,
      successUrl,
      cancelUrl,
      metadata: {
        org_id: a.org.id,
        event_id: purchase.fundraising_event_id ?? "",
        flow: "client_to_vendor",
        kind: "full",
        recorded_by: a.user.id,
        sponsor_purchase_id: purchase.id,
      },
    });
    res.status(201).json(checkout);
  }),
);

/**
 * Mark a purchase paid. Links the payment id (from the existing capture flow, or
 * a record-only payment) to the purchase, advances to 'paid', seeds the
 * fulfillment checklist from the package, and notifies the nonprofit. Also flags
 * any brand asset the sponsor still owes.
 */
router.post(
  "/:id/paid",
  h(async (req, res) => {
    const a = await actor(req);
    const purchase = await repo.getPurchaseScoped(a, req.params.id);
    if (!repo.actorIsSponsor(a, purchase)) {
      return res.status(403).json({ error: "only the sponsor can confirm payment" });
    }
    const body = req.body ?? {};
    const paymentId = typeof body.payment_id === "string" ? body.payment_id : null;
    const amount = body.amount != null ? Number(body.amount) : null;
    const updated = await repo.markPaid(purchase.id, paymentId, amount);
    // Terminal event: payment recorded closes the sponsorship deal. Stamp
    // closed_at idempotently and incrementally refresh the relationship graph
    // (sponsor <-> nonprofit) once. Best-effort, never blocks the response.
    await autoCloseSponsorPurchase(purchase.id);
    const tasks = await seedFulfillment(updated);
    void notifyPurchased(updated);
    const missing = await notifyMissingAssetsIfAny(updated);
    res.json({ purchase: updated, tasks, missing_assets: missing });
  }),
);

/**
 * Store a brand asset url (logo or ad). Field is `logo` or `ad`. After saving,
 * re-checks for any still-missing asset and notifies the sponsor when one
 * remains (best-effort).
 */
router.post(
  "/:id/assets",
  h(async (req, res) => {
    const a = await actor(req);
    const purchase = await repo.getPurchaseScoped(a, req.params.id);
    if (!repo.actorIsSponsor(a, purchase)) {
      return res.status(403).json({ error: "only the sponsor can upload assets" });
    }
    const body = req.body ?? {};
    const kind = body.kind === "ad" ? "ad" : body.kind === "logo" ? "logo" : null;
    if (!kind) return res.status(400).json({ error: "kind must be 'logo' or 'ad'" });
    const url = typeof body.url === "string" ? body.url : null;
    if (!url) return res.status(400).json({ error: "url required" });
    const check = validateUrlUpload(url.trim(), { allow: "images" });
    if (!check.ok) return res.status(400).json({ error: check.reason });
    const field = kind === "ad" ? "ad_file_url" : "logo_url";
    const updated = await repo.setAsset(purchase.id, field, url);
    const missing = await notifyMissingAssetsIfAny(updated);
    res.json({ purchase: updated, missing_assets: missing });
  }),
);

/**
 * Nonprofit advances the purchase status (fulfilled / cancelled). Only the
 * nonprofit that owns the package may do this.
 */
router.patch(
  "/:id/status",
  h(async (req, res) => {
    const a = await actor(req);
    const purchase = await repo.getPurchaseScoped(a, req.params.id);
    const owner = await repo.actorIsNonprofitOwner(a, purchase.id);
    if (!owner) {
      return res.status(403).json({ error: "only the nonprofit can change fulfillment status" });
    }
    const status = (req.body ?? {}).status;
    if (status !== "fulfilled" && status !== "cancelled") {
      return res.status(400).json({ error: "status must be 'fulfilled' or 'cancelled'" });
    }
    const updated = await repo.setStatus(purchase.id, status);
    res.json({ purchase: updated });
  }),
);

/** List the sponsor's guest names for this purchase. */
router.get(
  "/:id/guests",
  h(async (req, res) => {
    const a = await actor(req);
    const purchase = await repo.getPurchaseScoped(a, req.params.id);
    const [guests, count] = await Promise.all([
      repo.listSponsorGuests(purchase.id),
      repo.sponsorGuestCount(purchase.id),
    ]);
    res.json({ guests, guest_count: count, guest_allotment: purchase.guest_allotment ?? 0 });
  }),
);

/** Add a guest name (sponsor only), up to the allotment. */
router.post(
  "/:id/guests",
  h(async (req, res) => {
    const a = await actor(req);
    const purchase = await repo.getPurchaseScoped(a, req.params.id);
    if (!repo.actorIsSponsor(a, purchase)) {
      return res.status(403).json({ error: "only the sponsor can add guests" });
    }
    const body = req.body ?? {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return res.status(400).json({ error: "name required" });
    const email = typeof body.email === "string" ? body.email : null;
    const guest = await repo.addSponsorGuest(purchase, a.user.id, name, email);
    res.status(201).json({ guest });
  }),
);

/** Fulfillment tasks for a purchase (either party may view). */
router.get(
  "/:id/tasks",
  h(async (req, res) => {
    const a = await actor(req);
    const purchase = await repo.getPurchaseScoped(a, req.params.id);
    res.json({ tasks: await repo.listTasks(purchase.id) });
  }),
);

/**
 * Add a fulfillment task (nonprofit only). When the task carries a due_date, both
 * sides are notified that a deliverable is due (best-effort).
 */
router.post(
  "/:id/tasks",
  h(async (req, res) => {
    const a = await actor(req);
    const purchase = await repo.getPurchaseScoped(a, req.params.id);
    const owner = await repo.actorIsNonprofitOwner(a, purchase.id);
    if (!owner) {
      return res.status(403).json({ error: "only the nonprofit can add fulfillment tasks" });
    }
    const body = req.body ?? {};
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label) return res.status(400).json({ error: "label required" });
    const dueDate = typeof body.due_date === "string" ? body.due_date : null;
    const task = await repo.addTask(purchase.id, label, dueDate);
    if (dueDate) void notifyFulfillmentDue(purchase, task);
    res.status(201).json({ task });
  }),
);

/**
 * Update a fulfillment task's status (nonprofit only). The task is authorized via
 * its parent purchase. When moved into a due-bearing state with a due_date, the
 * due notification fires (best-effort).
 */
router.patch(
  "/tasks/:taskId",
  h(async (req, res) => {
    const a = await actor(req);
    const task = await repo.getTask(req.params.taskId);
    if (!task || !task.sponsor_purchase_id) {
      return res.status(404).json({ error: "fulfillment task not found" });
    }
    const purchase = await repo.getPurchaseScoped(a, task.sponsor_purchase_id);
    const owner = await repo.actorIsNonprofitOwner(a, purchase.id);
    if (!owner) {
      return res.status(403).json({ error: "only the nonprofit can update fulfillment tasks" });
    }
    const status = (req.body ?? {}).status as repo.FulfillmentStatus;
    if (!repo.FULFILLMENT_STATUSES.includes(status)) {
      return res.status(400).json({ error: "valid status required" });
    }
    const updated = await repo.updateTaskStatus(task.id, status);
    if (status === "in_progress" && updated.due_date) {
      void notifyFulfillmentDue(purchase, updated);
    }
    res.json({ task: updated });
  }),
);

export default router;
