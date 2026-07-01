/**
 * Intelligence Moat - Feature 9: Approval Graph Engine pure helpers.
 *
 * Deterministic, side-effect-free functions used by server/src/db/approvals.ts.
 * No database, no notifications, no clock state beyond an injectable `now` so
 * the escalation check is testable. Zero em dashes.
 *
 *   - pickContactForType: choose the best approval_contact for a given approval
 *     type. A venue-scoped contact (one with a venue_id) is preferred over an
 *     org-wide one, and a contact with an email beats one without, so routing
 *     lands on the most specific reachable owner. Returns null when nothing
 *     matches the type.
 *   - buildEscalationCheck: decide whether a request has stalled past N days
 *     without a decision, returning the age in days and the threshold so the
 *     caller can explain why it escalated.
 */

export type ApprovalType =
  | "venue"
  | "branding"
  | "sponsor"
  | "engineering"
  | "insurance"
  | "legal"
  | "finance";

export const APPROVAL_TYPES: ApprovalType[] = [
  "venue",
  "branding",
  "sponsor",
  "engineering",
  "insurance",
  "legal",
  "finance",
];

const APPROVAL_TYPE_SET = new Set<string>(APPROVAL_TYPES);
export function isApprovalType(v: unknown): v is ApprovalType {
  return typeof v === "string" && APPROVAL_TYPE_SET.has(v);
}

/** Statuses that count as "still open" (no final decision recorded). */
export const OPEN_STATUSES = ["submitted", "pending", "requires_revision"] as const;
export type ApprovalStatus =
  | "submitted"
  | "pending"
  | "approved"
  | "rejected"
  | "requires_revision";

const STATUS_SET = new Set<string>([
  "submitted",
  "pending",
  "approved",
  "rejected",
  "requires_revision",
]);
export function isApprovalStatus(v: unknown): v is ApprovalStatus {
  return typeof v === "string" && STATUS_SET.has(v);
}

/** Minimal shape of an approval contact needed for routing. */
export interface ContactLike {
  id: string;
  approval_type: string;
  venue_id?: string | null;
  email?: string | null;
}

/**
 * Pick the best contact for an approval type from a candidate list.
 *
 * Preference order, highest first:
 *   1. matches the requested type AND is venue-scoped AND has an email
 *   2. matches the type AND has an email (org-wide reachable owner)
 *   3. matches the type AND is venue-scoped (specific, even without email)
 *   4. matches the type (any)
 * Returns null when no contact matches the type.
 */
export function pickContactForType<T extends ContactLike>(
  contacts: readonly T[],
  type: string,
): T | null {
  if (!Array.isArray(contacts) || contacts.length === 0) return null;
  const matches = contacts.filter((c) => c && c.approval_type === type);
  if (matches.length === 0) return null;

  const score = (c: T): number => {
    const hasEmail = typeof c.email === "string" && c.email.trim() !== "";
    const venueScoped = !!c.venue_id;
    return (venueScoped ? 2 : 0) + (hasEmail ? 1 : 0);
  };

  let best = matches[0];
  let bestScore = score(best);
  for (let i = 1; i < matches.length; i += 1) {
    const s = score(matches[i]);
    if (s > bestScore) {
      best = matches[i];
      bestScore = s;
    }
  }
  return best;
}

/** Minimal shape of a request needed for the stall/escalation check. */
export interface RequestLike {
  status?: string | null;
  submitted_at?: string | Date | null;
  decided_at?: string | Date | null;
  escalated?: boolean | null;
}

export interface EscalationCheck {
  /** True when the request is open and older than the threshold. */
  shouldEscalate: boolean;
  /** Whole days since submission (0 when unknown). */
  ageDays: number;
  /** The threshold in days that was applied. */
  thresholdDays: number;
  /** True when the request has no final decision yet. */
  isOpen: boolean;
  /** True when the request was already escalated. */
  alreadyEscalated: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toTime(v: string | Date | null | undefined): number | null {
  if (v == null) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Decide whether an approval request has stalled past `thresholdDays` without a
 * decision. A request is "open" when its status is submitted / pending /
 * requires_revision and it has no decided_at. `now` is injectable for tests.
 */
export function buildEscalationCheck(
  request: RequestLike,
  thresholdDays = 3,
  now: Date = new Date(),
): EscalationCheck {
  const status = request?.status ?? "submitted";
  const decided = toTime(request?.decided_at ?? null);
  const isOpen =
    decided == null &&
    (OPEN_STATUSES as readonly string[]).includes(String(status));
  const alreadyEscalated = !!request?.escalated;

  const submitted = toTime(request?.submitted_at ?? null);
  const ageDays =
    submitted == null ? 0 : Math.floor(Math.max(0, now.getTime() - submitted) / MS_PER_DAY);

  const shouldEscalate = isOpen && !alreadyEscalated && ageDays >= thresholdDays;

  return { shouldEscalate, ageDays, thresholdDays, isOpen, alreadyEscalated };
}
