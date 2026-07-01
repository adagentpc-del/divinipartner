/**
 * Quote Approval routes (Phase 1, Workstream A). Mount base: /api/quote-approvals.
 *
 * The internal Sales -> PM -> Vendor approval chain that wraps AROUND a
 * quote_drafts row. This layer NEVER edits quote_drafts; it gates readiness so the
 * existing quote_drafts vendor_approved/client_delivered flow can proceed once the
 * chain is complete. Endpoints:
 *   GET  /draft/:draftId          the chain + summary for a draft (seeds if empty)
 *   POST /draft/:draftId/seed     ensure the three stages exist (pending)
 *   POST /draft/:draftId/decision submit an approve/reject for a stage
 *
 * A stage decision is gated by the acting user's vendor sub-role: the sales stage
 * needs approve_sales, the pm stage needs approve_pm, the final vendor stage needs
 * edit_quote (admins always pass). Stages must be decided in order. As stages
 * advance, the matching notify kind fires (quoteNeedsReview / pmApprovalNeeded /
 * clientApprovedQuote). Every read/write is IDOR-gated on the actor's org owning
 * the draft's vendor. Mirrors the h() wrapper + getActor patterns.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { q1 } from "../pool.js";
import * as repo from "../db/vendor-team.js";
import { requireVendorPermission } from "../lib/vendorTeam.js";
import {
  summarize,
  permissionForStage,
  canDecideStage,
  isComplete,
  STAGE_ORDER,
  type ChainSummary,
} from "../lib/quoteApprovalFlow.js";
import type { ApprovalStage } from "../db/vendor-team.js";
import { notify } from "../lib/notify.js";
import { recipients } from "../lib/recipients.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

const VALID_STAGES = new Set<string>(STAGE_ORDER);

/** Resolve a readable event name for a draft's event, for notification subjects. */
async function draftEventName(draftId: string): Promise<string> {
  const row = await q1<{ event_id: string | null }>(
    `select event_id from quote_drafts where id = $1`,
    [draftId],
  ).catch(() => null);
  if (!row?.event_id) return "a quote";
  const name = await recipients.eventName(row.event_id).catch(() => null);
  return name ?? "a quote";
}

/** The event's vendor-side + owner-side emails, for routing approval notices. */
async function draftAudiences(
  draftId: string,
): Promise<{ vendor: string[]; owner: string[] }> {
  const row = await q1<{ event_id: string | null }>(
    `select event_id from quote_drafts where id = $1`,
    [draftId],
  ).catch(() => null);
  if (!row?.event_id) return { vendor: [], owner: [] };
  const [vendor, owner] = await Promise.all([
    recipients.eventVendorEmails(row.event_id).catch(() => [] as string[]),
    recipients.eventOwnerEmails(row.event_id).catch(() => [] as string[]),
  ]);
  return { vendor, owner };
}

/**
 * Fire the appropriate notification for the stage that just advanced. Best
 * effort: failures never block the decision.
 *   sales approved -> PM approval needed (vendor side)
 *   pm approved    -> quote needs (final vendor) review (vendor side)
 *   vendor approved + chain complete -> client approved-quote ready (owner side)
 */
async function notifyForAdvance(
  draftId: string,
  stage: ApprovalStage,
  status: "approved" | "rejected",
  complete: boolean,
): Promise<void> {
  if (status !== "approved") return;
  const eventName = await draftEventName(draftId);
  const aud = await draftAudiences(draftId);
  const ctx = { quote_draft_id: draftId };
  if (stage === "sales" && aud.vendor.length) {
    await notify.pmApprovalNeeded(aud.vendor, eventName, ctx).catch(() => null);
  } else if (stage === "pm" && aud.vendor.length) {
    await notify.quoteNeedsReview(aud.vendor, eventName, ctx).catch(() => null);
  } else if (stage === "vendor" && complete && aud.owner.length) {
    await notify.clientApprovedQuote(aud.owner, eventName, ctx).catch(() => null);
  }
}

const router = Router();
router.use(requireUser);

/** The chain + summary for a draft. Seeds the three stages if none exist yet. */
router.get(
  "/draft/:draftId",
  h(async (req, res) => {
    const a = await actor(req);
    let chain = await repo.chainForDraft(a, req.params.draftId);
    if (chain.length === 0) {
      chain = await repo.ensureChain(a, req.params.draftId);
    }
    res.json({ chain, summary: summarize(chain) });
  }),
);

/** Ensure the three approval stages exist (pending) for a draft. */
router.post(
  "/draft/:draftId/seed",
  h(async (req, res) => {
    const a = await actor(req);
    const chain = await repo.ensureChain(a, req.params.draftId);
    res.status(201).json({ chain, summary: summarize(chain) });
  }),
);

/**
 * Submit a decision (approve | reject) for a stage. Gated by the stage's vendor
 * permission and by ordered-approval (earlier stages must be approved first).
 */
router.post(
  "/draft/:draftId/decision",
  h(async (req, res) => {
    const a = await actor(req);
    const draftId = req.params.draftId;
    const { stage, status, note } = req.body ?? {};
    if (!stage || !VALID_STAGES.has(stage)) {
      return res.status(400).json({ error: "valid stage required (sales|pm|vendor)" });
    }
    if (status !== "approved" && status !== "rejected") {
      return res.status(400).json({ error: "status must be approved or rejected" });
    }
    const decisionStage = stage as ApprovalStage;

    // Permission gate for this stage (also asserts draft vendor access first so a
    // forged id never reaches the permission check path).
    await repo.assertDraftVendorAccess(a, draftId);
    await requireVendorPermission(a, permissionForStage(decisionStage));

    // Make sure the chain exists, then enforce ordered approval.
    let chain = await repo.ensureChain(a, draftId);
    if (status === "approved" && !canDecideStage(chain, decisionStage)) {
      return res
        .status(400)
        .json({ error: "earlier approval stages must be approved first" });
    }

    const member = await repo.actingMember(a);
    await repo.recordDecision(
      a,
      draftId,
      decisionStage,
      status,
      member?.id ?? null,
      typeof note === "string" ? note : null,
    );

    chain = await repo.chainForDraft(a, draftId);
    const complete = isComplete(chain);
    await notifyForAdvance(draftId, decisionStage, status, complete).catch(() => null);

    const summary: ChainSummary = summarize(chain);
    res.json({ chain, summary, ready: complete });
  }),
);

export default router;
