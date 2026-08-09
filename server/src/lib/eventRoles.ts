/**
 * Event-level RBAC role vocabulary (Divini Partners 63-section Event
 * Operations spec, Phase A items 2-3, 2026-08-09). Pure, no DB, no config --
 * matches the lib/pricingMath.ts / lib/quoteMath.ts pattern so this stays
 * independently unit-testable and is the single source of truth for the role
 * set shared by db/eventMembers.ts and db/eventInvitations.ts.
 *
 * Zero em dashes.
 */
export type EventRole =
  | "event_owner"
  | "planner"
  | "finance"
  | "venue"
  | "vendor_owner"
  | "vendor_staff"
  | "sponsor"
  | "event_staff"
  | "guest_manager"
  | "read_only";

export const EVENT_ROLES: EventRole[] = [
  "event_owner",
  "planner",
  "finance",
  "venue",
  "vendor_owner",
  "vendor_staff",
  "sponsor",
  "event_staff",
  "guest_manager",
  "read_only",
];

/** Roles that may be granted through an invitation. event_owner is implicit
 *  from event creation and can never be handed out via invite. */
export const INVITABLE_EVENT_ROLES: EventRole[] = EVENT_ROLES.filter(
  (r) => r !== "event_owner",
);

const ROLE_SET = new Set<string>(EVENT_ROLES);
export function isEventRole(v: unknown): v is EventRole {
  return typeof v === "string" && ROLE_SET.has(v);
}

const INVITABLE_ROLE_SET = new Set<string>(INVITABLE_EVENT_ROLES);
export function isInvitableEventRole(v: unknown): v is EventRole {
  return typeof v === "string" && INVITABLE_ROLE_SET.has(v);
}

export type RecipientMatchInput = {
  actorUserId: string;
  actorEmail: string | null;
  recipientUserId: string | null;
  recipientEmail: string;
};

/**
 * True when the signed-in actor is who an invitation was actually sent to.
 * Deliberately never matches on email alone once the invite already resolved
 * to a specific recipientUserId at send time -- that would let a stale
 * invite be hijacked by a different account that later registers, or
 * re-registers, the same address. For an external invite where no account
 * existed yet (recipientUserId null at send time), email match against the
 * now-signed-in actor is the only option and is intentional (the lightweight
 * external join flow).
 */
export function isInvitationRecipient(input: RecipientMatchInput): boolean {
  const idMatches = !!input.recipientUserId && input.recipientUserId === input.actorUserId;
  const emailMatches =
    !input.recipientUserId &&
    !!input.actorEmail &&
    input.actorEmail.trim().toLowerCase() === input.recipientEmail.trim().toLowerCase();
  return idMatches || emailMatches;
}

/** True when a still-pending invitation's expires_at (ISO string) has passed. */
export function isInvitationExpired(expiresAtIso: string, nowMs: number = Date.now()): boolean {
  return new Date(expiresAtIso).getTime() < nowMs;
}
