/**
 * Divini Pipeline - the shared CRM engine (docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md
 * section 6, build-order slice 1). Deterministic: no LLM, no fabricated
 * recommendations. One engine shared by all 7 roles (spec constraint 10),
 * not duplicated per profile.
 *
 * Every write is org-scoped (organization_id on every row, every query
 * filters by it) and the opportunity stage change history is append-only
 * (spec constraint 9: preserve revision history, never overwrite it).
 */
import { pool, q, q1 } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";

// ---- Default stage template (spec section 6 "Default pipeline stages") ----
const DEFAULT_STAGES: { key: string; label: string; isClosedWon?: boolean; isClosedLost?: boolean }[] = [
  { key: "new", label: "New" },
  { key: "reviewing", label: "Reviewing" },
  { key: "qualified", label: "Qualified" },
  { key: "info_needed", label: "Information needed" },
  { key: "quote_requested", label: "Quote requested" },
  { key: "quote_in_progress", label: "Quote in progress" },
  { key: "proposal_sent", label: "Proposal sent" },
  { key: "negotiation", label: "Negotiation" },
  { key: "contract_sent", label: "Contract sent" },
  { key: "deposit_pending", label: "Deposit pending" },
  { key: "booked", label: "Booked" },
  { key: "in_delivery", label: "In delivery" },
  { key: "completed", label: "Completed", isClosedWon: true },
  { key: "lost", label: "Lost", isClosedLost: true },
  { key: "canceled", label: "Canceled", isClosedLost: true },
];

export type StageRow = {
  id: string;
  organization_id: string;
  key: string;
  label: string;
  sort_order: number;
  is_closed_won: boolean;
  is_closed_lost: boolean;
  created_at: string;
};

/** Every org gets the default 15-stage template the first time Pipeline is
 *  opened. Idempotent: re-running never duplicates rows (unique on key). */
export async function ensureDefaultStages(orgId: string): Promise<StageRow[]> {
  const existing = await q<StageRow>(
    `select * from crm_pipeline_stages where organization_id = $1 order by sort_order asc`,
    [orgId],
  );
  if (existing.length > 0) return existing;

  const client = await pool.connect();
  try {
    await client.query("begin");
    for (let i = 0; i < DEFAULT_STAGES.length; i++) {
      const s = DEFAULT_STAGES[i];
      await client.query(
        `insert into crm_pipeline_stages (organization_id, key, label, sort_order, is_closed_won, is_closed_lost)
         values ($1,$2,$3,$4,$5,$6)
         on conflict (organization_id, key) do nothing`,
        [orgId, s.key, s.label, i, !!s.isClosedWon, !!s.isClosedLost],
      );
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
  return q<StageRow>(`select * from crm_pipeline_stages where organization_id = $1 order by sort_order asc`, [orgId]);
}

export async function listStages(orgId: string): Promise<StageRow[]> {
  return ensureDefaultStages(orgId);
}

/** Add a custom stage beyond the default template, appended to the end. */
export async function addStage(orgId: string, key: string, label: string): Promise<StageRow> {
  const existing = await listStages(orgId);
  const nextOrder = existing.length > 0 ? Math.max(...existing.map((s) => s.sort_order)) + 1 : 0;
  return (await q1<StageRow>(
    `insert into crm_pipeline_stages (organization_id, key, label, sort_order)
       values ($1,$2,$3,$4)
     on conflict (organization_id, key) do update set label = excluded.label
     returning *`,
    [orgId, key, label, nextOrder],
  )) as StageRow;
}

export type OpportunityRow = {
  id: string;
  organization_id: string;
  owner_user_id: string | null;
  stage_id: string;
  event_id: string | null;
  name: string;
  category: string | null;
  source: string | null;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  decision_maker_name: string | null;
  estimated_value_cents: string | null;
  event_date: string | null;
  expected_close_at: string | null;
  next_action_note: string | null;
  next_action_at: string | null;
  status: "open" | "won" | "lost";
  loss_reason: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OpportunityInput = {
  name: string;
  stage_id?: string | null;
  event_id?: string | null;
  category?: string | null;
  source?: string | null;
  client_name?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  decision_maker_name?: string | null;
  estimated_value_cents?: number | null;
  event_date?: string | null;
  expected_close_at?: string | null;
  next_action_note?: string | null;
  next_action_at?: string | null;
};

async function assertOrgAccess(actor: Actor): Promise<string> {
  if (!actor.org) throw new ForbiddenError("register an organization first");
  return actor.org.id;
}

export async function listOpportunities(
  actor: Actor,
  filters: { stageId?: string; status?: string } = {},
): Promise<OpportunityRow[]> {
  const orgId = await assertOrgAccess(actor);
  const where: string[] = ["organization_id = $1"];
  const params: unknown[] = [orgId];
  if (filters.stageId) {
    params.push(filters.stageId);
    where.push(`stage_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }
  return q<OpportunityRow>(
    `select * from crm_opportunities where ${where.join(" and ")} order by updated_at desc limit 500`,
    params,
  );
}

export async function getOpportunity(actor: Actor, id: string): Promise<OpportunityRow> {
  const orgId = await assertOrgAccess(actor);
  const row = await q1<OpportunityRow>(
    `select * from crm_opportunities where id = $1 and organization_id = $2`,
    [id, orgId],
  );
  if (!row) throw new NotFoundError("opportunity not found");
  return row;
}

export async function createOpportunity(actor: Actor, input: OpportunityInput): Promise<OpportunityRow> {
  const orgId = await assertOrgAccess(actor);
  let stageId = input.stage_id ?? null;
  if (!stageId) {
    const stages = await ensureDefaultStages(orgId);
    stageId = stages[0]?.id ?? null;
  }
  if (!stageId) throw new Error("no pipeline stage available");

  const row = (await q1<OpportunityRow>(
    `insert into crm_opportunities
       (organization_id, owner_user_id, stage_id, event_id, name, category, source,
        client_name, client_email, client_phone, decision_maker_name,
        estimated_value_cents, event_date, expected_close_at, next_action_note, next_action_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     returning *`,
    [
      orgId,
      actor.user.id,
      stageId,
      input.event_id ?? null,
      input.name,
      input.category ?? null,
      input.source ?? null,
      input.client_name ?? null,
      input.client_email ?? null,
      input.client_phone ?? null,
      input.decision_maker_name ?? null,
      input.estimated_value_cents ?? null,
      input.event_date ?? null,
      input.expected_close_at ?? null,
      input.next_action_note ?? null,
      input.next_action_at ?? null,
    ],
  )) as OpportunityRow;

  await logActivity(orgId, row.id, actor.user.id, "system", "Opportunity created");
  return row;
}

export async function updateOpportunity(
  actor: Actor,
  id: string,
  patch: Partial<OpportunityInput>,
): Promise<OpportunityRow> {
  await getOpportunity(actor, id); // 404/org-scope check
  const orgId = await assertOrgAccess(actor);
  const row = await q1<OpportunityRow>(
    `update crm_opportunities set
       name = coalesce($3, name),
       category = coalesce($4, category),
       source = coalesce($5, source),
       client_name = coalesce($6, client_name),
       client_email = coalesce($7, client_email),
       client_phone = coalesce($8, client_phone),
       decision_maker_name = coalesce($9, decision_maker_name),
       estimated_value_cents = coalesce($10, estimated_value_cents),
       event_date = coalesce($11, event_date),
       expected_close_at = coalesce($12, expected_close_at),
       next_action_note = coalesce($13, next_action_note),
       next_action_at = coalesce($14, next_action_at),
       event_id = coalesce($15, event_id),
       updated_at = now()
     where id = $1 and organization_id = $2
     returning *`,
    [
      id,
      orgId,
      patch.name ?? null,
      patch.category ?? null,
      patch.source ?? null,
      patch.client_name ?? null,
      patch.client_email ?? null,
      patch.client_phone ?? null,
      patch.decision_maker_name ?? null,
      patch.estimated_value_cents ?? null,
      patch.event_date ?? null,
      patch.expected_close_at ?? null,
      patch.next_action_note ?? null,
      patch.next_action_at ?? null,
      patch.event_id ?? null,
    ],
  );
  if (!row) throw new NotFoundError("opportunity not found");
  return row;
}

/** Move an opportunity to a new stage. Records append-only history (spec
 *  constraint 9). Setting a closed_won/closed_lost stage sets status + closed_at. */
export async function moveStage(
  actor: Actor,
  id: string,
  toStageId: string,
  lossReason?: string | null,
): Promise<OpportunityRow> {
  const orgId = await assertOrgAccess(actor);
  const opp = await getOpportunity(actor, id);
  const targetStage = await q1<StageRow>(
    `select * from crm_pipeline_stages where id = $1 and organization_id = $2`,
    [toStageId, orgId],
  );
  if (!targetStage) throw new NotFoundError("stage not found");

  const client = await pool.connect();
  try {
    await client.query("begin");
    const status = targetStage.is_closed_won ? "won" : targetStage.is_closed_lost ? "lost" : "open";
    const closedAt = targetStage.is_closed_won || targetStage.is_closed_lost ? new Date().toISOString() : null;
    const updated = (
      await client.query(
        `update crm_opportunities set
           stage_id = $3, status = $4, closed_at = $5,
           loss_reason = coalesce($6, loss_reason), updated_at = now()
         where id = $1 and organization_id = $2
         returning *`,
        [id, orgId, toStageId, status, closedAt, targetStage.is_closed_lost ? lossReason ?? null : null],
      )
    ).rows[0] as OpportunityRow;
    await client.query(
      `insert into crm_opportunity_stage_history (opportunity_id, from_stage_id, to_stage_id, changed_by)
       values ($1,$2,$3,$4)`,
      [id, opp.stage_id, toStageId, actor.user.id],
    );
    await client.query(
      `insert into crm_activities (opportunity_id, organization_id, actor_user_id, activity_type, body)
       values ($1,$2,$3,'stage_change',$4)`,
      [id, orgId, actor.user.id, `Moved to ${targetStage.label}`],
    );
    await client.query("commit");
    return updated;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

export type ActivityRow = {
  id: string;
  opportunity_id: string;
  organization_id: string;
  actor_user_id: string | null;
  activity_type: string;
  body: string | null;
  created_at: string;
};

async function logActivity(
  orgId: string,
  opportunityId: string,
  actorUserId: string,
  type: string,
  body: string,
): Promise<void> {
  await q1(
    `insert into crm_activities (opportunity_id, organization_id, actor_user_id, activity_type, body)
     values ($1,$2,$3,$4,$5)`,
    [opportunityId, orgId, actorUserId, type, body],
  );
}

export async function addActivity(
  actor: Actor,
  opportunityId: string,
  type: string,
  body: string,
): Promise<ActivityRow> {
  await getOpportunity(actor, opportunityId); // org-scope check
  const orgId = await assertOrgAccess(actor);
  return (await q1<ActivityRow>(
    `insert into crm_activities (opportunity_id, organization_id, actor_user_id, activity_type, body)
     values ($1,$2,$3,$4,$5)
     returning *`,
    [opportunityId, orgId, actor.user.id, type, body],
  )) as ActivityRow;
}

export async function listActivities(actor: Actor, opportunityId: string): Promise<ActivityRow[]> {
  await getOpportunity(actor, opportunityId); // org-scope check
  return q<ActivityRow>(
    `select * from crm_activities where opportunity_id = $1 order by created_at desc limit 200`,
    [opportunityId],
  );
}

// ---- Readiness score (spec section 6: deterministic, explainable, never a
// "prediction" label) --------------------------------------------------------

export type ReadinessFactor = { key: string; label: string; points: number; met: boolean };
export type ReadinessScore = { score: number; max: number; factors: ReadinessFactor[] };

/** Deterministic 0-100 readiness score from fields that actually exist on the
 *  opportunity + its recent activity -- never a fabricated "AI prediction".
 *  Every point is traceable to a specific field or record (spec constraint 8). */
export async function getReadinessScore(actor: Actor, opportunityId: string): Promise<ReadinessScore> {
  const opp = await getOpportunity(actor, opportunityId);
  const recentActivity = await q1<{ id: string }>(
    `select id from crm_activities
      where opportunity_id = $1 and created_at >= now() - interval '7 days'
      limit 1`,
    [opportunityId],
  );

  const factors: ReadinessFactor[] = [
    { key: "budget", label: "Budget confirmed", points: 20, met: opp.estimated_value_cents != null && Number(opp.estimated_value_cents) > 0 },
    { key: "event_date", label: "Event date confirmed", points: 20, met: !!opp.event_date },
    { key: "decision_maker", label: "Decision maker identified", points: 15, met: !!opp.decision_maker_name },
    { key: "next_action", label: "Next action scheduled", points: 15, met: !!opp.next_action_at },
    { key: "contact_info", label: "Contact info on file", points: 15, met: !!(opp.client_email || opp.client_phone) },
    { key: "recent_activity", label: "Active in the last 7 days", points: 15, met: !!recentActivity },
  ];
  const score = factors.reduce((sum, f) => sum + (f.met ? f.points : 0), 0);
  const max = factors.reduce((sum, f) => sum + f.points, 0);
  return { score, max, factors };
}
