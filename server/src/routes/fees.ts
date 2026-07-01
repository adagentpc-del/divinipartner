/**
 * Fee Transparency (Module 3) routes. Mount base: /api/fees.
 *
 * The "show the full breakdown BEFORE the transaction completes" endpoint. It
 * resolves the plan from the actor's own org by default, or honours an explicit
 * `plan` query param (so a checkout can preview a specific tier). The processing
 * fee is ALWAYS labelled an estimate (Stripe-style 2.9% + 30c); the response
 * carries processingFeeIsEstimate: true.
 *
 *   GET /preview?amount=<cents>&plan=<free|partner|premier|enterprise>
 *       -> { amountCents, plan, platformFeeCents, feeRate, capCents, capApplied,
 *            processingFeeCents, processingFeeIsEstimate, totalDeductedCents, payoutCents }
 *
 * requireUser gates the endpoint; the breakdown is pure compute (no writes).
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { buildFeeBreakdown, type FeeOrg } from "../lib/fees.js";
import type { PlanKey } from "../lib/platformFees.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function getActor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

/** Map an explicit plan key (from the query) to a synthetic org tier/rate. */
const PLAN_TO_ORG: Record<PlanKey, FeeOrg> = {
  free: { tier: "free_partner" },
  partner: { tier: "partner" },
  premier: { tier: "premier" },
  enterprise: { tier: "white_label" },
};

function parsePlan(raw: unknown): PlanKey | null {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "free" || v === "partner" || v === "premier" || v === "enterprise" ? v : null;
}

function parseAmount(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

const router = Router();
router.use(requireUser);

/**
 * Full fee-transparency breakdown for a transaction amount (in cents). Resolves
 * the plan from the actor's own org unless `plan` is given.
 */
router.get(
  "/preview",
  h(async (req, res) => {
    const actor = await getActor(req);
    const amountCents = parseAmount(req.query.amount);
    const explicit = parsePlan(req.query.plan);

    const org: FeeOrg = explicit
      ? PLAN_TO_ORG[explicit]
      : {
          tier: actor.org?.tier ?? null,
          platform_fee_rate:
            actor.org?.platform_fee_rate != null ? Number(actor.org.platform_fee_rate) : null,
        };

    res.json(buildFeeBreakdown(amountCents, org));
  }),
);

export default router;
