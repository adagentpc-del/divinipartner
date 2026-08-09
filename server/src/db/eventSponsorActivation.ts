/**
 * Event Sponsor Activation (live-ops phase, Part 23-24, 2026-08-09).
 *
 * Distinct from the pre-existing nonprofit fundraising sponsor system
 * (db/sponsor-purchases and friends, scoped to fundraising_events -- a
 * different domain from this system's `events` table). This tracks the
 * live, day-of activation checklist for a sponsor already attached to
 * THIS event: booth setup, banner placement, signage, and similar
 * physical deliverables, checked off as they actually happen.
 *
 * Visibility is enforced server-side via lib/sponsorActivationVisibility.ts
 * -- full/venue coordinate every sponsor's activation; a sponsor sees only
 * their own org's items ("Sponsor own activation only") -- never a
 * client-selectable filter.
 *
 * Zero em dashes.
 */
import { q, q1 } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { getEvent, canManageEvent } from "./events.js";
import { getEventRole } from "./eventMembers.js";
import { audienceForRole } from "../lib/packetProjection.js";
import { recordActivity } from "./eventActivity.js";
import {
  filterSponsorActivationsForAudience,
  isSponsorActivationVisible,
  SPONSOR_ACTIVATION_STATUSES,
  summarizeActivations,
  type SponsorActivationRow as VisibilityRow,
  type SponsorActivationSummary,
  type SponsorActivationStatus,
} from "../lib/sponsorActivationVisibility.js";

export { SPONSOR_ACTIVATION_STATUSES, type SponsorActivationSummary, type SponsorActivationStatus };

export type SponsorActivationRow = {
  id: string;
  event_id: string;
  sponsor_org_id: string;
  label: string;
  location_id: string | null;
  status: string;
  notes: string | null;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateActivationInput = {
  sponsor_org_id: string;
  label: string;
  location_id?: string | null;
  notes?: string | null;
};

/** Owner/planner only -- pre-building the activation checklist is event
 *  planning work, same tier as adding an inventory item or a location. */
export async function createActivationItem(
  actor: Actor,
  eventId: string,
  input: CreateActivationInput,
): Promise<SponsorActivationRow> {
  if (!(await canManageEvent(actor, eventId))) {
    throw new ForbiddenError("only the event owner or planner can add a sponsor activation item");
  }
  if (!input.sponsor_org_id) throw new ForbiddenError("sponsor_org_id is required");
  if (!input.label?.trim()) throw new ForbiddenError("activation label is required");
  const row = await q1<SponsorActivationRow>(
    `insert into event_sponsor_activations (event_id, sponsor_org_id, label, location_id, notes)
     values ($1,$2,$3,$4,$5)
     returning *`,
    [eventId, input.sponsor_org_id, input.label.trim(), input.location_id ?? null, input.notes ?? null],
  );
  return row as SponsorActivationRow;
}

/** Role-scoped activation list -- backend-enforced visibility (Part 24),
 *  never a client-selectable filter. */
export async function listActivations(actor: Actor, eventId: string): Promise<SponsorActivationRow[]> {
  await getEvent(actor, eventId);
  const role = (await getEventRole(actor, eventId)) ?? "read_only";
  const audience = audienceForRole(role);
  const rows = await q<SponsorActivationRow>(
    `select * from event_sponsor_activations where event_id = $1 order by created_at asc`,
    [eventId],
  );
  return filterSponsorActivationsForAudience(rows as VisibilityRow[], audience, actor.org?.id ?? null) as SponsorActivationRow[];
}

/** Command center summary counters, scoped by the SAME visibility rule as
 *  listActivations -- a sponsor caller's summary only ever reflects their
 *  own org's items, matching "Sponsor own activation only." */
export async function activationSummary(actor: Actor, eventId: string): Promise<SponsorActivationSummary> {
  const visible = await listActivations(actor, eventId);
  return summarizeActivations(visible as VisibilityRow[]);
}

async function canUpdateActivation(actor: Actor, eventId: string, item: SponsorActivationRow): Promise<boolean> {
  if (await canManageEvent(actor, eventId)) return true;
  const role = await getEventRole(actor, eventId);
  return role === "sponsor" && !!actor.org?.id && actor.org.id === item.sponsor_org_id;
}

export type UpdateActivationInput = {
  status?: SponsorActivationStatus;
  notes?: string | null;
};

export async function updateActivationStatus(
  actor: Actor,
  eventId: string,
  itemId: string,
  input: UpdateActivationInput,
): Promise<SponsorActivationRow> {
  await getEvent(actor, eventId);
  const existing = await q1<SponsorActivationRow>(
    `select * from event_sponsor_activations where id = $1 and event_id = $2`,
    [itemId, eventId],
  );
  // 404, not 403 -- matches getIncident's not-found-not-forbidden pattern,
  // so a sponsor org cannot probe for another sponsor's activation items.
  const role = (await getEventRole(actor, eventId)) ?? "read_only";
  const audience = audienceForRole(role);
  if (!existing || !isSponsorActivationVisible(existing as VisibilityRow, audience, actor.org?.id ?? null)) {
    throw new NotFoundError("sponsor activation item not found");
  }
  if (!(await canUpdateActivation(actor, eventId, existing))) {
    throw new ForbiddenError("only the event owner, planner, or the sponsor's own org can update this activation item");
  }
  const status = input.status ?? existing.status;
  if (input.status && !SPONSOR_ACTIVATION_STATUSES.includes(input.status)) {
    throw new ForbiddenError("invalid activation status");
  }
  const row = await q1<SponsorActivationRow>(
    `update event_sponsor_activations set
       status = $2,
       notes = coalesce($3, notes),
       completed_by = case when $2 = 'complete' then $4 else completed_by end,
       completed_at = case when $2 = 'complete' then coalesce(completed_at, now()) else null end,
       updated_at = now()
     where id = $1
     returning *`,
    [itemId, status, input.notes ?? null, actor.user.id],
  );
  const updated = row as SponsorActivationRow;

  if (status !== existing.status) {
    await recordActivity(actor, eventId, {
      category: "sponsor",
      message: `Sponsor activation ${status.replace(/_/g, " ")}: ${existing.label}`,
      relatedEntityType: "sponsor_activation",
      relatedEntityId: itemId,
      severity: status === "issue" ? "warning" : "info",
    });
  }

  return updated;
}
