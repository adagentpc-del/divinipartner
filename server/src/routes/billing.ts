/**
 * Real recurring subscription billing. Mounted by the parent at /api/billing.
 *
 *   GET  /api/billing/status      current tier + subscription status + whether
 *                                 Stripe subscription billing is configured
 *   POST /api/billing/subscribe   { tier } -> Stripe Checkout (mode: subscription)
 *                                 redirect_url for a paid tier upgrade
 *   POST /api/billing/cancel      cancel the org's active subscription
 *
 * The org's `tier` column is only ever promoted by the Stripe webhook (see
 * routes/payments.ts /webhook/stripe, customer.subscription.* handling) once
 * a real subscription confirms as active -- never by this router directly.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { TIERS, type Tier } from "../db.js";
import {
  isConfigured,
  resolveSubscriptionPlan,
  createSubscriptionCheckout,
  cancelSubscription,
  StripeNotConfigured,
} from "../lib/stripeBilling.js";
import { planCatalogForRole } from "../lib/planCatalog.js";
import { PUBLIC_APP_URL, BASE_PATH } from "../config.js";

/** The org's real, role-aware subscribable tiers (Plus/Pro-equivalent, with a
 *  flat monthly price) -- from planCatalog.ts when the role has a catalog
 *  entry, otherwise the flat TIERS table (Phase 1 fallback). */
function subscribableTiersFor(orgType: string | null): { key: Tier; label: string; monthly: number; feeRate: number }[] {
  const catalog = planCatalogForRole(orgType as any);
  if (catalog) {
    const tierKeys: Tier[] = ["partner", "premier"];
    return tierKeys
      .map((key, i) => {
        const t = catalog.tiers[i + 1]; // [0]=free, [1]=plus, [2]=pro
        if (!t || t.monthlyUsd == null) return null;
        return { key, label: t.label, monthly: t.monthlyUsd, feeRate: t.platformFeeRate ?? 0 };
      })
      .filter((v): v is { key: Tier; label: string; monthly: number; feeRate: number } => v != null);
  }
  return (["partner", "premier"] as Tier[])
    .filter((t) => TIERS[t].monthly > 0)
    .map((t) => ({ key: t, label: TIERS[t].label, monthly: TIERS[t].monthly, feeRate: TIERS[t].feeRate }));
}

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();

function appBaseUrl(req: Request): string {
  if (PUBLIC_APP_URL) return PUBLIC_APP_URL + BASE_PATH;
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
  const host = req.headers.host || "localhost";
  return `${proto}://${host}${BASE_PATH}`;
}

router.get(
  "/status",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.json({ configured: isConfigured(), organization: null });
    res.json({
      configured: isConfigured(),
      subscribable_tiers: subscribableTiersFor(actor.org.type),
      organization: {
        id: actor.org.id,
        tier: actor.org.tier,
        subscription_status: actor.org.subscription_status ?? null,
        has_stripe_customer: !!actor.org.stripe_customer_id,
        has_active_subscription: !!actor.org.stripe_subscription_id,
      },
    });
  }),
);

router.post(
  "/subscribe",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.status(400).json({ error: "register an organization first" });

    const tier = String(req.body?.tier || "") as Tier;
    const plan = resolveSubscriptionPlan(actor.org.type, tier);
    if (!plan) {
      const options = subscribableTiersFor(actor.org.type).map((t) => t.key);
      return res.status(400).json({ error: `tier must be one of: ${options.join(", ")}` });
    }
    if (!isConfigured()) {
      return res.status(503).json({ error: "subscription billing is not configured yet" });
    }

    const base = appBaseUrl(req);
    try {
      const checkout = await createSubscriptionCheckout({
        org: actor.org,
        email: actor.user.email,
        tier,
        successUrl: `${base}/account/billing?subscribed=1`,
        cancelUrl: `${base}/account/billing?subscribed=cancelled`,
      });
      res.status(201).json({ redirect_url: checkout.redirect_url });
    } catch (e) {
      if (e instanceof StripeNotConfigured) {
        return res.status(503).json({ error: e.message });
      }
      throw e;
    }
  }),
);

router.post(
  "/cancel",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org?.stripe_subscription_id) {
      return res.status(400).json({ error: "no active subscription to cancel" });
    }
    await cancelSubscription(actor.org.stripe_subscription_id);
    res.json({ cancelling: true });
  }),
);

export default router;
