/**
 * Contract Pricing Partnership routes (blueprint section 22).
 * Mounted at /api/contract-pricing. Premier-tier gated for create/approve.
 *
 *   GET    /api/contract-pricing            list partnerships for the org
 *   GET    /api/contract-pricing/meta       partner types, pricing types, statuses
 *   POST   /api/contract-pricing            create a partnership (Premier only)
 *   GET    /api/contract-pricing/:id        single partnership
 *   PATCH  /api/contract-pricing/:id/status set approval status (Premier only)
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import {
  createContract,
  listContracts,
  getContract,
  setApprovalStatus,
  PARTNER_TYPES,
  PRICING_TYPES,
  APPROVAL_STATUSES,
  type PartnerType,
  type PricingType,
  type ApprovalStatus,
} from "../db/contracts.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();

const PREMIER = new Set(["premier", "white_label"]);
function isPremier(tier: string | null | undefined): boolean {
  return !!tier && PREMIER.has(tier);
}

router.get("/meta", (_req, res) => {
  res.json({ partner_types: PARTNER_TYPES, pricing_types: PRICING_TYPES, approval_statuses: APPROVAL_STATUSES });
});

router.get(
  "/",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.json({ contracts: [], premier: false });
    const rows = await listContracts(actor.org.id, {
      approval_status: typeof req.query.approval_status === "string" ? req.query.approval_status : undefined,
    });
    res.json({ contracts: rows, premier: isPremier(actor.org.tier) });
  }),
);

router.post(
  "/",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.status(400).json({ error: "register an organization first" });
    if (!isPremier(actor.org.tier)) {
      return res.status(403).json({ error: "Contract pricing partnerships are a Premier feature" });
    }
    const b = req.body ?? {};
    if (!b.partner_b_org) return res.status(400).json({ error: "partner_b_org required" });
    if (!b.partner_type || !PARTNER_TYPES.includes(b.partner_type)) {
      return res.status(400).json({ error: "valid partner_type required" });
    }
    if (!b.pricing_type || !PRICING_TYPES.includes(b.pricing_type)) {
      return res.status(400).json({ error: "valid pricing_type required" });
    }
    const row = await createContract(actor.org.id, actor.user.id, {
      name: b.name ?? null,
      partner_b_org: b.partner_b_org,
      partner_type: b.partner_type as PartnerType,
      pricing_type: b.pricing_type as PricingType,
      discount_pct: b.discount_pct != null ? Number(b.discount_pct) : null,
      fixed_rate: b.fixed_rate != null ? Number(b.fixed_rate) : null,
      volume_tier: b.volume_tier ?? null,
      volume_threshold: b.volume_threshold != null ? Number(b.volume_threshold) : null,
      start_date: b.start_date ?? null,
      end_date: b.end_date ?? null,
      auto_renewal: !!b.auto_renewal,
      applicable_categories: Array.isArray(b.applicable_categories) ? b.applicable_categories : [],
      applicable_venues: Array.isArray(b.applicable_venues) ? b.applicable_venues : [],
      terms: b.terms ?? null,
    });
    res.status(201).json({ contract: row });
  }),
);

router.get(
  "/:id",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.status(404).json({ error: "not found" });
    const row = await getContract(actor.org.id, req.params.id);
    if (!row) return res.status(404).json({ error: "not found" });
    res.json({ contract: row });
  }),
);

router.patch(
  "/:id/status",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.status(404).json({ error: "not found" });
    if (!isPremier(actor.org.tier)) {
      return res.status(403).json({ error: "Contract pricing partnerships are a Premier feature" });
    }
    const status = (req.body ?? {}).status as ApprovalStatus;
    if (!status) return res.status(400).json({ error: "status required" });
    try {
      const row = await setApprovalStatus(actor.org.id, req.params.id, status, actor.user.id);
      if (!row) return res.status(404).json({ error: "not found" });
      res.json({ contract: row });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }),
);

export default router;
