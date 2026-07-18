/**
 * Foundation routes: identity, registration, pricing. Mounted at /api.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { TIERS, ROLES } from "../db.js";
import * as invites from "../db/invites.js";
import { notify } from "../lib/notify.js";
import { PRICING_V2 } from "../config.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();

router.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "divini-partners", ts: Date.now() });
});

router.get("/pricing", (_req, res) => {
  res.json({ tiers: TIERS, roles: ROLES, pricingV2: PRICING_V2 });
});

router.get(
  "/me",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const user = await db.ensureUser(auth.userId!, auth.email);
    const org = await db.getMyOrg(user.id);
    res.json({
      user: { id: user.id, email: auth.email },
      isAdmin: auth.isAdmin,
      company: org
        ? {
            id: org.id,
            kind: org.type,
            name: org.name,
            tier: org.tier,
            verification_status: org.verification_status,
            white_label_status: org.white_label_status,
          }
        : null,
    });
  }),
);

// Current policy versions recorded with each user's terms acceptance. Bump these
// when the Terms / Privacy effective dates change so re-acceptance is tracked.
const TERMS_VERSION = "2026-06-24";   // Terms of Service effective date
const PRIVACY_VERSION = "2026-06-08"; // Privacy Policy effective date

router.post(
  "/register",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const { role, orgName, tier, name, phone, invite } = req.body ?? {};
    if (!role || !ROLES.includes(role)) {
      return res.status(400).json({ error: "valid role required" });
    }
    if (!orgName || typeof orgName !== "string") {
      return res.status(400).json({ error: "orgName required" });
    }
    const ip =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      null;

    // Pricing V2: no membership tiers. Everyone registers FREE (1 seat). A
    // client registers client-like; every other role registers as the free
    // partner account. The tier picker is ignored entirely when the flag is on,
    // so no paid tier can be created. Legacy behavior (honor the picker, default
    // free_partner) is kept when the flag is off.
    // Under Pricing V2 the CLIENT pays the platform fee, so a client may choose a
    // paid membership plan that lowers their fee % (Free=client, Plus=partner,
    // Pro=premier). Non-clients register free (their monetization is visibility /
    // Featured, not a fee tier). Legacy path unchanged.
    const CLIENT_PLAN_TIERS = ["client", "partner", "premier"];
    const effectiveTier: db.Tier = PRICING_V2
      ? role === "client"
        ? (CLIENT_PLAN_TIERS.includes(tier) ? (tier as db.Tier) : "client")
        : "free_partner"
      : TIERS[tier as db.Tier]
        ? (tier as db.Tier)
        : "free_partner";
    const org = await db.registerOrganization(auth.userId!, auth.email, {
      role,
      orgName,
      tier: effectiveTier,
      name,
      phone,
      agreementVersion: TERMS_VERSION,
      policyVersion: PRIVACY_VERSION,
      ip,
    });
    // Attribution: if this registration came from a platform invite, mark it
    // accepted against the new org. Best-effort so it never blocks registration.
    if (invite && typeof invite === "string") {
      await invites.acceptInvite(invite, org.id).catch(() => undefined);
    }

    // Registration + terms-acceptance confirmation. Best-effort: never block
    // or fail registration on the email send.
    if (auth.email) {
      await notify.welcome(auth.email, org.name).catch(() => undefined);
    }

    res.status(201).json({ id: org.id, kind: org.type, name: org.name, tier: org.tier });
  }),
);

export default router;
