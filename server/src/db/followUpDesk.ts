/**
 * Divini Follow-Up Desk (docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md, build-order
 * slice 4). Prevents leads and proposals from being forgotten. Deterministic
 * rule-based tasks derived from real Pipeline and Proposal Studio data, plus
 * manual tasks a user adds directly. No LLM, no generated urgency -- every
 * system task traces to a real stale field or a real deadline (spec
 * constraint 6/8).
 *
 * Rules are reconciled on every list call (cheap at this scale, no cron
 * worker needed): a task is created when its condition first matches, and
 * auto-dismissed (not "done" -- the user did not act) the moment the
 * underlying record no longer matches, so the list never shows a stale
 * warning next to a record that has already moved on.
 */
import { pool, q, q1 } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";

function assertOrgAccess(actor: Actor): string {
  if (!actor.org) throw new ForbiddenError("register an organization first");
  return actor.org.id;
}

// ---- Deterministic thresholds (real, fixed rules -- not fabricated) -------
const STALE_ACTIVITY_DAYS = 10;
const PROPOSAL_UNRESPONDED_DAYS = 5;
const PROPOSAL_EXPIRING_WITHIN_DAYS = 3;

export type TaskRow = {
  id: string;
  organization_id: string;
  opportunity_id: string | null;
  proposal_id: string | null;
  source: "manual" | "system";
  rule_key: string | null;
  title: string;
  note: string | null;
  due_at: string | null;
  status: "open" | "done" | "snoozed" | "dismissed";
  snoozed_until: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

/** Upsert a system task keyed on (org, opportunity, rule). */
async function upsertOpportunityTask(orgId: string, opportunityId: string, ruleKey: string, title: string, dueAt: string | null): Promise<void> {
  await q(
    `insert into follow_up_tasks (organization_id, opportunity_id, source, rule_key, title, due_at)
     values ($1,$2,'system',$3,$4,$5)
     on conflict (organization_id, opportunity_id, rule_key) where source = 'system' and opportunity_id is not null and status = 'open'
       do update set title = excluded.title, due_at = excluded.due_at, updated_at = now()`,
    [orgId, opportunityId, ruleKey, title, dueAt],
  );
}

/** Upsert a system task keyed on (org, proposal, rule). */
async function upsertProposalTask(orgId: string, proposalId: string, ruleKey: string, title: string, dueAt: string | null): Promise<void> {
  await q(
    `insert into follow_up_tasks (organization_id, proposal_id, source, rule_key, title, due_at)
     values ($1,$2,'system',$3,$4,$5)
     on conflict (organization_id, proposal_id, rule_key) where source = 'system' and proposal_id is not null and status = 'open'
       do update set title = excluded.title, due_at = excluded.due_at, updated_at = now()`,
    [orgId, proposalId, ruleKey, title, dueAt],
  );
}

async function autoDismissWhere(orgId: string, ruleKey: string, notInIds: string[]): Promise<void> {
  if (notInIds.length === 0) {
    await q(
      `update follow_up_tasks set status = 'dismissed', resolved_at = now(), updated_at = now()
       where organization_id = $1 and source = 'system' and rule_key = $2 and status = 'open'`,
      [orgId, ruleKey],
    );
    return;
  }
  await q(
    `update follow_up_tasks set status = 'dismissed', resolved_at = now(), updated_at = now()
     where organization_id = $1 and source = 'system' and rule_key = $2 and status = 'open'
       and coalesce(opportunity_id::text, proposal_id::text) not in (${notInIds.map((_, i) => `$${i + 3}`).join(",")})`,
    [orgId, ruleKey, ...notInIds],
  );
}

/** Reconcile every system rule for this org: create/refresh tasks whose
 *  condition matches, dismiss ones that no longer do. Idempotent, safe to
 *  call on every list. */
async function reconcileSystemTasks(orgId: string): Promise<void> {
  // Auto-flip expired snoozes back to open.
  await q(
    `update follow_up_tasks set status = 'open', snoozed_until = null, updated_at = now()
     where organization_id = $1 and status = 'snoozed' and snoozed_until <= now()`,
    [orgId],
  );

  // Rule 1: open opportunity with an overdue next action.
  const overdue = await q<{ id: string; name: string; next_action_at: string }>(
    `select id, name, next_action_at from crm_opportunities
      where organization_id = $1 and status = 'open'
        and next_action_at is not null and next_action_at < now()`,
    [orgId],
  );
  for (const o of overdue) {
    await upsertOpportunityTask(orgId, o.id, "opportunity_next_action_overdue", `Follow up: ${o.name} (next action overdue)`, o.next_action_at);
  }
  await autoDismissWhere(orgId, "opportunity_next_action_overdue", overdue.map((o) => o.id));

  // Rule 2: open opportunity with no activity in STALE_ACTIVITY_DAYS.
  const stale = await q<{ id: string; name: string }>(
    `select o.id, o.name from crm_opportunities o
      where o.organization_id = $1 and o.status = 'open'
        and not exists (
          select 1 from crm_activities a
           where a.opportunity_id = o.id and a.created_at >= now() - ($2 || ' days')::interval
        )`,
    [orgId, STALE_ACTIVITY_DAYS],
  );
  for (const o of stale) {
    await upsertOpportunityTask(orgId, o.id, "opportunity_stale", `No activity in ${STALE_ACTIVITY_DAYS}+ days: ${o.name}`, null);
  }
  await autoDismissWhere(orgId, "opportunity_stale", stale.map((o) => o.id));

  // Rule 3: proposal sent/viewed with no response in PROPOSAL_UNRESPONDED_DAYS.
  const unresponded = await q<{ id: string; title: string; sent_at: string }>(
    `select id, title, sent_at from proposals
      where organization_id = $1 and status in ('sent','viewed')
        and sent_at is not null and sent_at < now() - ($2 || ' days')::interval`,
    [orgId, PROPOSAL_UNRESPONDED_DAYS],
  );
  for (const p of unresponded) {
    await upsertProposalTask(orgId, p.id, "proposal_unresponded", `No response yet: ${p.title}`, p.sent_at);
  }
  await autoDismissWhere(orgId, "proposal_unresponded", unresponded.map((p) => p.id));

  // Rule 4: proposal sent/viewed with valid_until within PROPOSAL_EXPIRING_WITHIN_DAYS.
  const expiring = await q<{ id: string; title: string; valid_until: string }>(
    `select id, title, valid_until from proposals
      where organization_id = $1 and status in ('sent','viewed')
        and valid_until is not null
        and valid_until <= (now() + ($2 || ' days')::interval)
        and valid_until >= now()`,
    [orgId, PROPOSAL_EXPIRING_WITHIN_DAYS],
  );
  for (const p of expiring) {
    await upsertProposalTask(orgId, p.id, "proposal_expiring", `Expiring soon: ${p.title}`, p.valid_until);
  }
  await autoDismissWhere(orgId, "proposal_expiring", expiring.map((p) => p.id));
}

export async function listTasks(actor: Actor, filters: { status?: string } = {}): Promise<TaskRow[]> {
  const orgId = assertOrgAccess(actor);
  await reconcileSystemTasks(orgId);
  const where: string[] = ["organization_id = $1"];
  const params: unknown[] = [orgId];
  if (filters.status) {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  } else {
    where.push(`status in ('open','snoozed')`);
  }
  return q<TaskRow>(
    `select * from follow_up_tasks where ${where.join(" and ")}
     order by (due_at is null), due_at asc, created_at desc limit 500`,
    params,
  );
}

async function assertTaskAccess(actor: Actor, id: string): Promise<TaskRow> {
  const orgId = assertOrgAccess(actor);
  const row = await q1<TaskRow>(`select * from follow_up_tasks where id = $1 and organization_id = $2`, [id, orgId]);
  if (!row) throw new NotFoundError("task not found");
  return row;
}

export type ManualTaskInput = {
  title: string;
  note?: string | null;
  due_at?: string | null;
  opportunity_id?: string | null;
  proposal_id?: string | null;
};

export async function createManualTask(actor: Actor, input: ManualTaskInput): Promise<TaskRow> {
  const orgId = assertOrgAccess(actor);
  const title = input.title.trim();
  if (!title) throw new Error("title is required");
  if (input.opportunity_id) {
    const opp = await q1<{ id: string }>(`select id from crm_opportunities where id = $1 and organization_id = $2`, [input.opportunity_id, orgId]);
    if (!opp) throw new NotFoundError("opportunity not found");
  }
  if (input.proposal_id) {
    const prop = await q1<{ id: string }>(`select id from proposals where id = $1 and organization_id = $2`, [input.proposal_id, orgId]);
    if (!prop) throw new NotFoundError("proposal not found");
  }
  return (await q1<TaskRow>(
    `insert into follow_up_tasks (organization_id, opportunity_id, proposal_id, source, title, note, due_at, created_by)
     values ($1,$2,$3,'manual',$4,$5,$6,$7)
     returning *`,
    [orgId, input.opportunity_id ?? null, input.proposal_id ?? null, title, input.note ?? null, input.due_at ?? null, actor.user.id],
  )) as TaskRow;
}

export async function setTaskStatus(
  actor: Actor,
  id: string,
  status: "done" | "dismissed" | "open" | "snoozed",
  snoozedUntil?: string | null,
): Promise<TaskRow> {
  const orgId = assertOrgAccess(actor);
  await assertTaskAccess(actor, id);
  if (status === "snoozed" && !snoozedUntil) {
    throw new Error("snoozed_until is required when snoozing a task");
  }
  const resolvedAt = status === "done" || status === "dismissed" ? new Date().toISOString() : null;
  return (await q1<TaskRow>(
    `update follow_up_tasks set status = $3, snoozed_until = $4, resolved_at = $5, updated_at = now()
     where id = $1 and organization_id = $2
     returning *`,
    [id, orgId, status, status === "snoozed" ? snoozedUntil : null, resolvedAt],
  )) as TaskRow;
}

export async function deleteManualTask(actor: Actor, id: string): Promise<void> {
  const orgId = assertOrgAccess(actor);
  const task = await assertTaskAccess(actor, id);
  if (task.source !== "manual") throw new ForbiddenError("only manual tasks can be deleted");
  await q(`delete from follow_up_tasks where id = $1 and organization_id = $2`, [id, orgId]);
}
