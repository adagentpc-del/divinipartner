/**
 * Divini AI COO (V2) - Automated Executive Tasks builder (pure layer).
 *
 * Deterministic, side-effect-free. Turns an already-assembled Briefing (see
 * cooBriefing.assembleBriefing) into ranked task rows ready to persist into the
 * coo_tasks table (db/schema-coo-tasks.sql). No DB work, no network, no AI.
 *
 * Each priority on the briefing becomes one task; its briefing impact (0..100)
 * carries over as the row's impact_score, and the action category maps onto the
 * task's action_type. Rows come back highest-impact first so the db layer can
 * insert them in rank order and the UI renders the most valuable work at the top.
 */
import { type Briefing, type BriefingPriority } from "./cooBriefing.js";

/** A task row ready to insert into coo_tasks (audience filled by the db layer). */
export type GeneratedTask = {
  title: string;
  action_type: string;
  detail: Record<string, unknown>;
  impact_score: number;
  source: string;
  due_at: string | null;
};

const ACTION_BY_CATEGORY: Record<BriefingPriority["category"], string> = {
  revenue: "capture_revenue",
  risk: "resolve_risk",
  approval: "review_approval",
  follow_up: "follow_up",
  contract: "renew_contract",
  partnership: "pursue_partnership",
  sponsorship: "sell_sponsorship",
};

const clampScore = (n: number): number => {
  const v = Math.round(Number(n) || 0);
  return v < 0 ? 0 : v > 100 ? 100 : v;
};

/**
 * Build ranked task rows from a briefing. Pure: same briefing -> same rows,
 * ordered by impact_score descending (ties broken by title for stability).
 */
export function buildTasksFromBriefing(briefing: Briefing): GeneratedTask[] {
  const tasks: GeneratedTask[] = (briefing.priorities ?? []).map((p) => ({
    title: p.title,
    action_type: ACTION_BY_CATEGORY[p.category] ?? "review",
    detail: {
      category: p.category,
      ...(p.detail ? { note: p.detail } : {}),
      ...(p.ref ? { ref: p.ref } : {}),
    },
    impact_score: clampScore(p.impact),
    source: "coo_briefing",
    // Contracts expiring carry a soft due date hint in the ref when known; the
    // pure layer leaves due_at null and lets the db layer set concrete dates.
    due_at: null,
  }));

  tasks.sort((a, b) => b.impact_score - a.impact_score || a.title.localeCompare(b.title));
  return tasks;
}
