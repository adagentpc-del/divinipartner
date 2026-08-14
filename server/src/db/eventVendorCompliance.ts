/**
 * Per-event vendor compliance gates (front-half completion pass, 2026-08-10).
 *
 * Fills a gap the architecture audit found: three pre-existing "requirements"
 * systems (vendor-compliance.ts's global per-vendor doc status,
 * vendor-requirements.ts's quote-intake field schema, and
 * vendor-event-requirements.ts's guest-list/deposit flags) cover three
 * unrelated concerns, and none let an organizer configure "insurance must be
 * verified before award" for a specific event. This module is deliberately
 * thin: it stores only the POLICY per event (event_vendor_compliance_gates);
 * it never duplicates the actual compliance status, which stays the single
 * source of truth in vendor_compliance (db/vendor-compliance.ts).
 *
 * Zero em dashes.
 */
import { q, q1 } from "../pool.js";
import { type Actor, ForbiddenError } from "../db.js";
import { getEvent, canManageEvent } from "./events.js";
import { isCarrierVerified } from "./carrierVerification.js";

export type ComplianceRequirementKey = "insurance" | "coi" | "w9" | "coi_carrier_verified";
export type CompliancePolicy = "before_bid" | "before_award" | "before_event" | "informational";

export const COMPLIANCE_REQUIREMENT_KEYS: ComplianceRequirementKey[] = [
  "insurance",
  "coi",
  "w9",
  "coi_carrier_verified",
];
export const COMPLIANCE_POLICIES: CompliancePolicy[] = [
  "before_bid",
  "before_award",
  "before_event",
  "informational",
];

export type ComplianceGateRow = {
  id: string;
  event_id: string;
  requirement_key: ComplianceRequirementKey;
  policy: CompliancePolicy;
  created_by: string | null;
  created_at: string;
};

function isRequirementKey(v: unknown): v is ComplianceRequirementKey {
  return COMPLIANCE_REQUIREMENT_KEYS.includes(v as ComplianceRequirementKey);
}
function isPolicy(v: unknown): v is CompliancePolicy {
  return COMPLIANCE_POLICIES.includes(v as CompliancePolicy);
}

/** Configure (or clear) the policy for one requirement on an event. Owner/planner only. */
export async function setComplianceGate(
  actor: Actor,
  eventId: string,
  requirementKey: string,
  policy: string | null,
): Promise<ComplianceGateRow | null> {
  await getEvent(actor, eventId);
  if (!(await canManageEvent(actor, eventId))) {
    throw new ForbiddenError("only the event owner or planner can configure compliance gates");
  }
  if (!isRequirementKey(requirementKey)) throw new ForbiddenError("invalid requirement key");
  if (policy === null) {
    await q1(`delete from event_vendor_compliance_gates where event_id = $1 and requirement_key = $2`, [
      eventId,
      requirementKey,
    ]);
    return null;
  }
  if (!isPolicy(policy)) throw new ForbiddenError("invalid compliance policy");
  return q1<ComplianceGateRow>(
    `insert into event_vendor_compliance_gates (event_id, requirement_key, policy, created_by)
       values ($1,$2,$3,$4)
     on conflict (event_id, requirement_key) do update set policy = excluded.policy, created_by = excluded.created_by
     returning *`,
    [eventId, requirementKey, policy, actor.user.id],
  );
}

export async function listComplianceGates(actor: Actor, eventId: string): Promise<ComplianceGateRow[]> {
  await getEvent(actor, eventId);
  return q<ComplianceGateRow>(
    `select * from event_vendor_compliance_gates where event_id = $1 order by requirement_key asc`,
    [eventId],
  );
}

export type ComplianceCheckResult = {
  requirement_key: ComplianceRequirementKey;
  policy: CompliancePolicy;
  status: string | null;
  met: boolean;
};

/**
 * Check a specific vendor's status against every 'before_award' gate on an
 * event. Used by db/awards.ts::awardQuote() to block (or, with an override,
 * warn-and-proceed) an award when a required document is missing/expired.
 * No actor/authorization here -- it is only ever called from within an
 * already-authorized award transaction, keyed on a real vendor_id.
 */
export async function checkBeforeAwardCompliance(
  eventId: string,
  vendorId: string | null,
): Promise<ComplianceCheckResult[]> {
  const gates = await q<ComplianceGateRow>(
    `select * from event_vendor_compliance_gates where event_id = $1 and policy = 'before_award'`,
    [eventId],
  );
  if (gates.length === 0) return [];
  const compliance = vendorId
    ? await q1<{ insurance_status: string | null; coi_status: string | null; w9_status: string | null }>(
        `select insurance_status, coi_status, w9_status from vendor_compliance where vendor_id = $1`,
        [vendorId],
      )
    : null;
  const statusFor = (key: ComplianceRequirementKey): string | null => {
    if (!compliance) return null;
    if (key === "insurance") return compliance.insurance_status;
    if (key === "coi") return compliance.coi_status;
    if (key === "w9") return compliance.w9_status;
    return null; // coi_carrier_verified is checked separately below, not from vendor_compliance
  };
  const results: ComplianceCheckResult[] = [];
  for (const g of gates) {
    if (g.requirement_key === "coi_carrier_verified") {
      // A real carrier-verification record, not the self-attested field --
      // see db/carrierVerification.ts. vendorId null (no bid vendor row yet)
      // can never satisfy this.
      const met = vendorId ? await isCarrierVerified(vendorId) : false;
      results.push({ requirement_key: g.requirement_key, policy: g.policy, status: met ? "verified" : "unverified", met });
      continue;
    }
    const status = statusFor(g.requirement_key);
    results.push({ requirement_key: g.requirement_key, policy: g.policy, status, met: status === "verified" });
  }
  return results;
}

/** Thrown by db/awards.ts::awardQuote() when a 'before_award' compliance
 *  gate is unmet and the caller did not pass override:true. Mirrors the
 *  ReadinessBlockedError / CloseoutBlockedError audited-override pattern
 *  already used across the live-ops lifecycle gates. */
export class ComplianceBlockedError extends Error {
  status = 409;
  blocking: ComplianceCheckResult[];
  constructor(blocking: ComplianceCheckResult[]) {
    super(`vendor is missing ${blocking.length} required compliance document(s) before award`);
    this.name = "ComplianceBlockedError";
    this.blocking = blocking;
  }
}
