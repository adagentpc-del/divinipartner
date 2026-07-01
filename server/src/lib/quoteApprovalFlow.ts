/**
 * Quote Approval Flow (Phase 1, Workstream A).
 *
 * The internal Sales -> PM -> Vendor approval chain that wraps AROUND the
 * existing quote_drafts lifecycle. This module is the pure, deterministic logic
 * over a chain of quote_approvals rows: which stage is next, whether the chain is
 * complete, and which vendor permission a stage decision requires. The route
 * layer persists decisions (db/vendor-team.ts) and notifies; quote_drafts itself
 * is never edited here. When all three stages are approved the chain is complete
 * and the existing quote_drafts vendor_approved/client_delivered flow may proceed.
 *
 * Zero em dashes.
 */
import type { ApprovalStage, QuoteApprovalRow } from "../db/vendor-team.js";

export const STAGE_ORDER: ApprovalStage[] = ["sales", "pm", "vendor"];

/** The vendor permission required to decide a stage. */
export function permissionForStage(stage: ApprovalStage): string {
  switch (stage) {
    case "sales":
      return "approve_sales";
    case "pm":
      return "approve_pm";
    case "vendor":
      // Final vendor sign-off rides on edit_quote (held by sales managers / AEs /
      // admin); admins always pass the gate regardless.
      return "edit_quote";
    default:
      return "manage_team";
  }
}

/** Map the chain rows to a stage -> status lookup. */
function statusByStage(chain: QuoteApprovalRow[]): Record<ApprovalStage, QuoteApprovalRow["status"]> {
  const out: Record<string, QuoteApprovalRow["status"]> = {};
  for (const row of chain) {
    if (row.stage) out[row.stage] = row.status;
  }
  return out as Record<ApprovalStage, QuoteApprovalRow["status"]>;
}

/**
 * The next stage awaiting a decision, in Sales -> PM -> Vendor order. Returns
 * null when every stage is approved (chain complete) or any stage is rejected
 * (chain blocked). A rejected stage stops the walk.
 */
export function nextStage(chain: QuoteApprovalRow[]): ApprovalStage | null {
  const by = statusByStage(chain);
  for (const stage of STAGE_ORDER) {
    const s = by[stage];
    if (s === "rejected") return null;
    if (s !== "approved") return stage;
  }
  return null;
}

/** True when all three stages are approved. */
export function isComplete(chain: QuoteApprovalRow[]): boolean {
  const by = statusByStage(chain);
  return STAGE_ORDER.every((stage) => by[stage] === "approved");
}

/** True when any stage was rejected (the chain is blocked). */
export function isRejected(chain: QuoteApprovalRow[]): boolean {
  return chain.some((r) => r.status === "rejected");
}

/**
 * A guard for ordered approval: a stage may only be decided when every earlier
 * stage is already approved. Returns true when the stage is the current
 * front-of-line (next) stage. Prevents approving PM before Sales, etc.
 */
export function canDecideStage(chain: QuoteApprovalRow[], stage: ApprovalStage): boolean {
  if (isRejected(chain)) return false;
  const by = statusByStage(chain);
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx < 0) return false;
  for (let i = 0; i < idx; i++) {
    if (by[STAGE_ORDER[i]] !== "approved") return false;
  }
  return true;
}

export type ChainSummary = {
  stages: Array<{ stage: ApprovalStage; status: QuoteApprovalRow["status"] }>;
  next_stage: ApprovalStage | null;
  complete: boolean;
  rejected: boolean;
};

/** A compact summary of the chain for the API + UI. */
export function summarize(chain: QuoteApprovalRow[]): ChainSummary {
  const by = statusByStage(chain);
  return {
    stages: STAGE_ORDER.map((stage) => ({ stage, status: by[stage] ?? "pending" })),
    next_stage: nextStage(chain),
    complete: isComplete(chain),
    rejected: isRejected(chain),
  };
}
