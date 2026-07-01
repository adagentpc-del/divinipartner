/**
 * Intelligence Moat - F2 Event Playbook Engine (pure helpers).
 *
 * Two pure-ish transforms sit between an event (plus its child rows) and a
 * reusable playbook payload:
 *
 *   buildPayloadFromEvent(eventData)  -> PlaybookPayload  (event => playbook)
 *   clonePlanFromPayload(payload, ..) -> ClonePlan        (playbook => new event)
 *
 * Nothing here touches the database; the db layer (server/src/db/playbooks.ts)
 * reads the event + children, hands the shaped data to buildPayloadFromEvent,
 * and later feeds a stored payload back through clonePlanFromPayload to produce
 * a CreateEventInput-compatible object plus the child rows to recreate.
 *
 * The payload is intentionally a superset of the existing event_templates scope
 * (Phase 7) so playbooks COMPLEMENT templates without conflicting: a playbook
 * is the full, clone-ready blueprint of one real event.
 *
 * No fabrication: every section is derived from the supplied event data, and
 * absent data is stored as an empty section rather than invented.
 */

import type { CreateEventInput } from "../db/events.js";

// ---------------------------------------------------------------------------
// Shapes of the event + child rows the builder consumes. These mirror the
// repo row types loosely (only the fields the playbook needs) so this module
// stays decoupled and unit-testable without a database.
// ---------------------------------------------------------------------------
export type PlaybookEventInput = {
  id?: string | null;
  name?: string | null;
  type?: string | null;
  guest_count?: number | null;
  budget?: number | string | null;
  event_goals?: string | null;
  required_services?: string[] | null;
  venue_id?: string | null;
  branding_opportunity_id?: string | null;
  status?: string | null;
};

export type PlaybookVendorInput = {
  organization_id?: string | null;
  vendor_id?: string | null;
  role?: string | null;
  status?: string | null;
};

export type PlaybookTimelineInput = {
  title?: string | null;
  description?: string | null;
  category?: string | null;
  owner_role?: string | null;
  owner_label?: string | null;
  /** Minutes relative to the event start (negative = before). Optional. */
  offset_minutes?: number | null;
  duration_minutes?: number | null;
  location?: string | null;
};

export type PlaybookTaskInput = {
  name?: string | null;
  description?: string | null;
  category?: string | null;
  priority?: string | null;
  assigned_role?: string | null;
  milestone?: boolean | null;
  /** Days relative to the event date (negative = before). Optional. */
  offset_days?: number | null;
  template_key?: string | null;
};

export type PlaybookDocumentInput = {
  label?: string | null;
  kind?: string | null;
  required?: boolean | null;
};

export type PlaybookSourceData = {
  event: PlaybookEventInput;
  venue?: { name?: string | null; city?: string | null; region?: string | null; capacity?: number | null } | null;
  vendors?: PlaybookVendorInput[];
  timeline?: PlaybookTimelineInput[];
  tasks?: PlaybookTaskInput[];
  documents?: PlaybookDocumentInput[];
  /** Free-form sponsor / guest-experience / comms scopes if available. */
  sponsorPackage?: unknown;
  guestExperience?: unknown;
  communications?: unknown;
  guestFlows?: unknown;
  approvalWorkflow?: unknown;
};

// ---------------------------------------------------------------------------
// The persisted payload (jsonb). Each named section the spec calls for.
// ---------------------------------------------------------------------------
export type PlaybookPayload = {
  version: 1;
  built_at: string;
  source_event_id: string | null;
  event_meta: {
    name: string | null;
    type: string | null;
    guest_count: number | null;
    budget: number | null;
    goals: string | null;
    required_services: string[];
    has_branding: boolean;
  };
  venue_setup: {
    venue_id: string | null;
    name: string | null;
    city: string | null;
    region: string | null;
    capacity: number | null;
  };
  vendor_stack: Array<{
    organization_id: string | null;
    vendor_id: string | null;
    role: string | null;
  }>;
  sponsor_package: unknown;
  guest_experience: unknown;
  timeline: PlaybookTimelineInput[];
  budget_structure: {
    total: number | null;
    required_services: string[];
  };
  approval_workflow: unknown;
  tasks: PlaybookTaskInput[];
  documents: PlaybookDocumentInput[];
  communications: unknown;
  guest_flows: unknown;
};

function toNumberOrNull(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build a reusable playbook payload from an event and its loaded children.
 * Pure: no I/O, deterministic for a given input.
 */
export function buildPayloadFromEvent(data: PlaybookSourceData): PlaybookPayload {
  const ev = data.event ?? {};
  const services = Array.isArray(ev.required_services) ? ev.required_services.filter(Boolean) : [];
  const budget = toNumberOrNull(ev.budget);

  const vendor_stack = (data.vendors ?? []).map((v) => ({
    organization_id: v.organization_id ?? null,
    vendor_id: v.vendor_id ?? null,
    role: v.role ?? null,
  }));

  return {
    version: 1,
    built_at: new Date().toISOString(),
    source_event_id: ev.id ?? null,
    event_meta: {
      name: ev.name ?? null,
      type: ev.type ?? null,
      guest_count: ev.guest_count ?? null,
      budget,
      goals: ev.event_goals ?? null,
      required_services: services,
      has_branding: !!ev.branding_opportunity_id,
    },
    venue_setup: {
      venue_id: ev.venue_id ?? null,
      name: data.venue?.name ?? null,
      city: data.venue?.city ?? null,
      region: data.venue?.region ?? null,
      capacity: data.venue?.capacity ?? null,
    },
    vendor_stack,
    sponsor_package: data.sponsorPackage ?? null,
    guest_experience: data.guestExperience ?? null,
    timeline: data.timeline ?? [],
    budget_structure: {
      total: budget,
      required_services: services,
    },
    approval_workflow: data.approvalWorkflow ?? null,
    tasks: data.tasks ?? [],
    documents: data.documents ?? [],
    communications: data.communications ?? null,
    guest_flows: data.guestFlows ?? null,
  };
}

// ---------------------------------------------------------------------------
// Clone: payload -> a CreateEventInput-compatible object + child rows to make.
// ---------------------------------------------------------------------------
export type CloneOverrides = {
  name?: string | null;
  type?: string | null;
  date_time?: string | null;
  guest_count?: number | null;
  budget?: number | null;
  venue_id?: string | null;
  branding_opportunity_id?: string | null;
  /** When false, do not carry over the vendor stack. Default true. */
  include_vendors?: boolean;
  /** When false, do not carry over the timeline. Default true. */
  include_timeline?: boolean;
  /** When false, do not carry over the tasks. Default true. */
  include_tasks?: boolean;
};

/** A timeline item with a concrete (or null) timestamp ready for itinerary_items. */
export type ClonedTimelineItem = {
  title: string;
  description: string | null;
  category: string;
  owner_role: string;
  owner_label: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  location: string | null;
};

/** A task with a concrete (or null) due_date ready for the tasks table. */
export type ClonedTask = {
  name: string;
  description: string | null;
  category: string | null;
  priority: string;
  assigned_role: string | null;
  milestone: boolean;
  template_key: string | null;
  due_date: string | null;
};

export type ClonedVendor = {
  organization_id: string;
  vendor_id: string | null;
  role: string | null;
};

export type ClonePlan = {
  /** Feeds directly into events.createEvent(actor, createEvent). */
  createEvent: CreateEventInput;
  vendors: ClonedVendor[];
  timeline: ClonedTimelineItem[];
  tasks: ClonedTask[];
};

function addMinutesIso(base: Date | null, minutes: number | null | undefined): string | null {
  if (!base || minutes == null) return null;
  const t = base.getTime() + minutes * 60_000;
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

function addDaysIso(base: Date | null, days: number | null | undefined): string | null {
  if (!base || days == null) return null;
  const t = base.getTime() + days * 86_400_000;
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

/**
 * Turn a stored payload + clone overrides into a CreateEventInput plus the
 * child rows the db layer will recreate. Pure: no I/O.
 *
 * Timeline offsets (relative to the new event start) and task offsets (relative
 * to the new event date) are resolved here against the override date_time. If
 * no date_time is provided, timed rows get null timestamps (the workspace
 * surfaces these as unscheduled, matching the itinerary builder's behaviour).
 */
export function clonePlanFromPayload(
  payload: PlaybookPayload,
  overrides: CloneOverrides = {},
): ClonePlan {
  const meta = payload.event_meta ?? ({} as PlaybookPayload["event_meta"]);
  const dateTime = overrides.date_time ?? null;
  const base = dateTime ? new Date(dateTime) : null;
  const usableBase = base && !Number.isNaN(base.getTime()) ? base : null;

  const createEvent: CreateEventInput = {
    name: (overrides.name ?? meta.name ?? "Cloned event").toString(),
    type: overrides.type ?? meta.type ?? null,
    date_time: dateTime,
    guest_count: overrides.guest_count ?? meta.guest_count ?? null,
    budget: overrides.budget ?? meta.budget ?? null,
    event_goals: meta.goals ?? null,
    required_services: meta.required_services?.length ? meta.required_services : null,
    venue_id: overrides.venue_id ?? payload.venue_setup?.venue_id ?? null,
    branding_opportunity_id: overrides.branding_opportunity_id ?? null,
  };

  const includeVendors = overrides.include_vendors !== false;
  const includeTimeline = overrides.include_timeline !== false;
  const includeTasks = overrides.include_tasks !== false;

  const vendors: ClonedVendor[] = includeVendors
    ? (payload.vendor_stack ?? [])
        .filter((v) => !!v.organization_id)
        .map((v) => ({
          organization_id: String(v.organization_id),
          vendor_id: v.vendor_id ?? null,
          role: v.role ?? null,
        }))
    : [];

  const timeline: ClonedTimelineItem[] = includeTimeline
    ? (payload.timeline ?? []).map((t) => {
        const start = addMinutesIso(usableBase, t.offset_minutes ?? null);
        const end =
          start && t.duration_minutes != null
            ? addMinutesIso(new Date(start), t.duration_minutes)
            : null;
        return {
          title: (t.title ?? "Itinerary item").toString(),
          description: t.description ?? null,
          category: t.category ?? "program",
          owner_role: t.owner_role ?? "all",
          owner_label: t.owner_label ?? null,
          start_time: start,
          end_time: end,
          duration_minutes: t.duration_minutes ?? null,
          location: t.location ?? null,
        };
      })
    : [];

  const tasks: ClonedTask[] = includeTasks
    ? (payload.tasks ?? []).map((t) => ({
        name: (t.name ?? "Task").toString(),
        description: t.description ?? null,
        category: t.category ?? null,
        priority: t.priority ?? "medium",
        assigned_role: t.assigned_role ?? null,
        milestone: !!t.milestone,
        template_key: t.template_key ?? null,
        due_date: addDaysIso(usableBase, t.offset_days ?? null),
      }))
    : [];

  return { createEvent, vendors, timeline, tasks };
}
