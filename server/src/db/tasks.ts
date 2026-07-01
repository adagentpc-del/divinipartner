/**
 * Phase 6 - Tasks + Timeline (blueprint 33).
 *
 * Org-scoped CRUD over the `tasks` table (db/schema.sql + db/schema-phase6.sql).
 * Read access follows the event; mutation requires event ownership. Tasks carry
 * a category, status, priority, optional due/start dates, milestone flag and a
 * template_key. A small set of event workflow templates can be seeded onto an
 * event in one call. A timeline view groups tasks by month for the Timeline tab.
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { getEvent } from "./events.js";

async function canSee(actor: Actor, eventId: string): Promise<void> {
  await getEvent(actor, eventId);
}
async function owns(actor: Actor, eventId: string): Promise<boolean> {
  if (actor.user.role === "super_admin" || actor.user.role === "admin") return true;
  const row = await q1<{ ok: boolean }>(
    `select true as ok from events
      where id = $1
        and (($2::uuid is not null and organization_id = $2)
             or client_id = $3 or planner_id = $3)
      limit 1`,
    [eventId, actor.org?.id ?? null, actor.user.id],
  );
  return !!row?.ok;
}
async function requireOwner(actor: Actor, eventId: string): Promise<void> {
  await canSee(actor, eventId);
  if (!(await owns(actor, eventId))) {
    throw new ForbiddenError("only the event owner can edit tasks");
  }
}

// ---- Reference data --------------------------------------------------------
export const TASK_CATEGORIES: { key: string; label: string }[] = [
  { key: "planning", label: "Planning" },
  { key: "venue", label: "Venue" },
  { key: "vendor", label: "Vendor coordination" },
  { key: "design", label: "Design and decor" },
  { key: "catering", label: "Catering" },
  { key: "logistics", label: "Logistics" },
  { key: "guest", label: "Guest management" },
  { key: "payments", label: "Payments" },
  { key: "documents", label: "Documents" },
  { key: "day_of", label: "Day-of" },
  { key: "post_event", label: "Post-event" },
];
const CATEGORY_KEYS = new Set(TASK_CATEGORIES.map((c) => c.key));

export const TASK_STATUSES: { key: string; label: string }[] = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "blocked", label: "Blocked" },
  { key: "done", label: "Done" },
  { key: "cancelled", label: "Cancelled" },
];
const STATUS_KEYS = new Set(TASK_STATUSES.map((s) => s.key));

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"];

// ---- Workflow templates (blueprint 33) -------------------------------------
// Seed list of standard event tasks; offset_days is relative to the event date
// (negative = before the event). The seeder turns these into rows.
export type WorkflowTemplateTask = {
  template_key: string;
  name: string;
  category: string;
  priority: string;
  offset_days: number;
  milestone?: boolean;
  assigned_role?: string;
};

export const EVENT_WORKFLOW_TEMPLATE: WorkflowTemplateTask[] = [
  { template_key: "kickoff", name: "Confirm event brief and goals", category: "planning", priority: "high", offset_days: -90, milestone: true, assigned_role: "planner" },
  { template_key: "venue_hold", name: "Place venue hold", category: "venue", priority: "high", offset_days: -84, milestone: true, assigned_role: "venue" },
  { template_key: "budget", name: "Lock event budget", category: "planning", priority: "high", offset_days: -80, assigned_role: "client" },
  { template_key: "vendor_shortlist", name: "Shortlist and invite vendors", category: "vendor", priority: "high", offset_days: -70, assigned_role: "planner" },
  { template_key: "quotes_review", name: "Review quotes and award vendors", category: "vendor", priority: "high", offset_days: -56, milestone: true, assigned_role: "client" },
  { template_key: "deposits", name: "Pay vendor deposits", category: "payments", priority: "high", offset_days: -49, assigned_role: "client" },
  { template_key: "design_signoff", name: "Finalize design and decor", category: "design", priority: "medium", offset_days: -42, assigned_role: "planner" },
  { template_key: "menu_tasting", name: "Confirm menu and tasting", category: "catering", priority: "medium", offset_days: -35, assigned_role: "vendor" },
  { template_key: "guest_invites", name: "Send guest invitations", category: "guest", priority: "medium", offset_days: -45, assigned_role: "client" },
  { template_key: "rsvp_followup", name: "Follow up on RSVPs", category: "guest", priority: "medium", offset_days: -14, assigned_role: "planner" },
  { template_key: "floorplan", name: "Finalize floorplan and seating", category: "logistics", priority: "high", offset_days: -10, milestone: true, assigned_role: "planner" },
  { template_key: "coi", name: "Collect vendor COIs and contracts", category: "documents", priority: "high", offset_days: -14, assigned_role: "venue" },
  { template_key: "balances", name: "Pay outstanding vendor balances", category: "payments", priority: "high", offset_days: -7, assigned_role: "client" },
  { template_key: "load_in_plan", name: "Confirm load-in and install schedule", category: "logistics", priority: "high", offset_days: -3, assigned_role: "installer" },
  { template_key: "final_headcount", name: "Submit final guest headcount", category: "catering", priority: "high", offset_days: -5, assigned_role: "client" },
  { template_key: "day_of_run", name: "Run-of-show and day-of coordination", category: "day_of", priority: "urgent", offset_days: 0, milestone: true, assigned_role: "planner" },
  { template_key: "load_out", name: "Confirm breakdown and load-out", category: "day_of", priority: "high", offset_days: 0, assigned_role: "installer" },
  { template_key: "final_invoice", name: "Reconcile and settle final invoice", category: "payments", priority: "medium", offset_days: 7, assigned_role: "client" },
  { template_key: "reviews", name: "Request reviews and capture feedback", category: "post_event", priority: "low", offset_days: 10, assigned_role: "planner" },
];

export type TaskRow = {
  id: string;
  event_id: string;
  organization_id: string | null;
  name: string | null;
  description: string | null;
  category: string | null;
  assigned_to: string | null;
  assigned_role: string | null;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  priority: string | null;
  status: string | null;
  milestone: boolean | null;
  template_key: string | null;
  sort_order: number | null;
  related_document_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};

export async function listTasks(actor: Actor, eventId: string): Promise<TaskRow[]> {
  await canSee(actor, eventId);
  return q<TaskRow>(
    `select * from tasks where event_id = $1
      order by coalesce(due_date, 'infinity'::timestamptz) asc, sort_order asc, created_at asc`,
    [eventId],
  );
}

export type TaskInput = {
  name?: string | null;
  description?: string | null;
  category?: string | null;
  assigned_to?: string | null;
  assigned_role?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  priority?: string | null;
  status?: string | null;
  milestone?: boolean | null;
  sort_order?: number | null;
  notes?: string | null;
};

function normCategory(v: string | null | undefined): string | null {
  if (v == null) return null;
  return CATEGORY_KEYS.has(v) ? v : null;
}
function normStatus(v: string | null | undefined): string | null {
  if (v == null) return null;
  return STATUS_KEYS.has(v) ? v : null;
}

export async function addTask(actor: Actor, eventId: string, input: TaskInput): Promise<TaskRow> {
  await requireOwner(actor, eventId);
  const row = await q1<TaskRow>(
    `insert into tasks
       (event_id, organization_id, name, description, category, assigned_to, assigned_role,
        start_date, due_date, priority, status, milestone, sort_order, notes, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     returning *`,
    [
      eventId,
      actor.org?.id ?? null,
      input.name ?? "Task",
      input.description ?? null,
      normCategory(input.category) ?? "planning",
      input.assigned_to ?? null,
      input.assigned_role ?? null,
      input.start_date ?? null,
      input.due_date ?? null,
      input.priority ?? "medium",
      normStatus(input.status) ?? "todo",
      input.milestone ?? false,
      input.sort_order ?? 0,
      input.notes ?? null,
      actor.user.id,
    ],
  );
  return row as TaskRow;
}

async function loadTaskEvent(taskId: string): Promise<string> {
  const t = await q1<{ event_id: string }>(`select event_id from tasks where id = $1`, [taskId]);
  if (!t) throw new NotFoundError("task not found");
  return t.event_id;
}

export async function updateTask(actor: Actor, taskId: string, patch: TaskInput): Promise<TaskRow> {
  const eventId = await loadTaskEvent(taskId);
  await requireOwner(actor, eventId);
  const row = await q1<TaskRow>(
    `update tasks set
        name = coalesce($2, name),
        description = coalesce($3, description),
        category = coalesce($4, category),
        assigned_to = coalesce($5, assigned_to),
        assigned_role = coalesce($6, assigned_role),
        start_date = coalesce($7, start_date),
        due_date = coalesce($8, due_date),
        priority = coalesce($9, priority),
        status = coalesce($10, status),
        milestone = coalesce($11, milestone),
        sort_order = coalesce($12, sort_order),
        notes = coalesce($13, notes),
        completed_at = case when $10 = 'done' then now()
                            when $10 is not null then null
                            else completed_at end,
        updated_at = now()
      where id = $1 returning *`,
    [
      taskId,
      patch.name ?? null,
      patch.description ?? null,
      normCategory(patch.category),
      patch.assigned_to ?? null,
      patch.assigned_role ?? null,
      patch.start_date ?? null,
      patch.due_date ?? null,
      patch.priority ?? null,
      normStatus(patch.status),
      patch.milestone ?? null,
      patch.sort_order ?? null,
      patch.notes ?? null,
    ],
  );
  return row as TaskRow;
}

/** Quick status set (owner only). */
export async function setTaskStatus(actor: Actor, taskId: string, status: string): Promise<TaskRow> {
  const eventId = await loadTaskEvent(taskId);
  await requireOwner(actor, eventId);
  if (!STATUS_KEYS.has(status)) throw new ForbiddenError("invalid task status");
  const row = await q1<TaskRow>(
    `update tasks set status = $2,
        completed_at = case when $2 = 'done' then now() else null end,
        updated_at = now()
      where id = $1 returning *`,
    [taskId, status],
  );
  return row as TaskRow;
}

export async function deleteTask(actor: Actor, taskId: string): Promise<void> {
  const eventId = await loadTaskEvent(taskId);
  await requireOwner(actor, eventId);
  await pool.query(`delete from tasks where id = $1`, [taskId]);
}

/**
 * Seed the standard event workflow template onto an event (owner only).
 * Skips template tasks already present (by template_key). due_date is computed
 * from the event date + offset_days; if the event has no date, due_date is null.
 */
export async function seedWorkflow(
  actor: Actor,
  eventId: string,
): Promise<{ added: number; tasks: TaskRow[] }> {
  await requireOwner(actor, eventId);
  const ev = await getEvent(actor, eventId);
  const base = ev.date_time ? new Date(ev.date_time) : null;
  const existing = await q<{ template_key: string | null }>(
    `select template_key from tasks where event_id = $1 and template_key is not null`,
    [eventId],
  );
  const have = new Set(existing.map((r) => r.template_key));
  const client = await pool.connect();
  const out: TaskRow[] = [];
  try {
    await client.query("begin");
    let order = 0;
    for (const t of EVENT_WORKFLOW_TEMPLATE) {
      if (have.has(t.template_key)) continue;
      const due =
        base && !Number.isNaN(base.getTime())
          ? new Date(base.getTime() + t.offset_days * 86_400_000).toISOString()
          : null;
      const r = await client.query<TaskRow>(
        `insert into tasks
           (event_id, organization_id, name, category, priority, status, milestone,
            assigned_role, due_date, template_key, sort_order, created_by)
         values ($1,$2,$3,$4,$5,'todo',$6,$7,$8,$9,$10,$11)
         returning *`,
        [
          eventId,
          actor.org?.id ?? null,
          t.name,
          t.category,
          t.priority,
          t.milestone ?? false,
          t.assigned_role ?? null,
          due,
          t.template_key,
          order++,
          actor.user.id,
        ],
      );
      if (r.rows[0]) out.push(r.rows[0]);
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
  return { added: out.length, tasks: out };
}

export type TimelineGroup = { key: string; label: string; tasks: TaskRow[] };
export type Timeline = {
  groups: TimelineGroup[];
  undated: TaskRow[];
  milestones: TaskRow[];
  counts: { total: number; done: number; overdue: number; by_status: Record<string, number> };
};

/** Group tasks by month into a timeline view, plus milestone + progress rollups. */
export async function buildTimeline(actor: Actor, eventId: string): Promise<Timeline> {
  const tasks = await listTasks(actor, eventId);
  const now = Date.now();
  const groupsMap = new Map<string, TaskRow[]>();
  const undated: TaskRow[] = [];
  const counts = { total: tasks.length, done: 0, overdue: 0, by_status: {} as Record<string, number> };
  for (const s of TASK_STATUSES) counts.by_status[s.key] = 0;

  for (const t of tasks) {
    counts.by_status[t.status ?? "todo"] = (counts.by_status[t.status ?? "todo"] ?? 0) + 1;
    if (t.status === "done") counts.done += 1;
    if (t.due_date && t.status !== "done" && t.status !== "cancelled") {
      if (new Date(t.due_date).getTime() < now) counts.overdue += 1;
    }
    if (!t.due_date) {
      undated.push(t);
      continue;
    }
    const d = new Date(t.due_date);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key)!.push(t);
  }

  const groups: TimelineGroup[] = [...groupsMap.keys()]
    .sort()
    .map((key) => {
      const [y, m] = key.split("-");
      const label = new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-US", {
        month: "long",
        year: "numeric",
      });
      return { key, label, tasks: groupsMap.get(key)! };
    });

  return {
    groups,
    undated,
    milestones: tasks.filter((t) => t.milestone),
    counts,
  };
}
