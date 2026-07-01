/**
 * Intake Routing (Phase 1, Workstream A).
 *
 * Given an intake context (a venue, client org, and/or event the lead concerns),
 * deterministically resolve which vendor team members own it: prefer the explicit
 * vendor_account_assignments for the most specific subject (event, then venue,
 * then client), ordered owner -> backup -> collaborator; if no assignment exists
 * for any subject, fall back to the vendor org's admin team members.
 *
 * The result is a routed set of members (with emails) plus the matched subject.
 * `routeIntake` is pure resolution; the route layer persists and notifies. The
 * notification fan-out uses lib/recipients-style cleaning (valid emails only).
 *
 * Deterministic, IDOR-safe: callers pass the actor's own org id; this module
 * never reads across orgs.
 *
 * Zero em dashes.
 */
import type { Actor } from "../db.js";
import {
  assignmentsForSubject,
  adminMembers,
  type SubjectType,
  type VendorTeamMemberRow,
} from "../db/vendor-team.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type IntakeContext = {
  venue_id?: string | null;
  client_org_id?: string | null;
  event_id?: string | null;
  services?: string[] | null;
};

export type RoutedMember = {
  member_id: string;
  name: string | null;
  email: string | null;
  vendor_role: string | null;
  role: string; // owner | backup | collaborator | admin_fallback
};

export type RoutingResult = {
  matched_subject: { type: SubjectType; id: string } | null;
  fallback: boolean;
  members: RoutedMember[];
  emails: string[];
};

/** Clean a list of emails: trim, lowercase, dedupe, valid-looking only. */
function cleanEmails(values: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    const e = String(v).trim().toLowerCase();
    if (EMAIL_RE.test(e)) out.add(e);
  }
  return [...out];
}

/** Build the subject search order from a context: event, then venue, then client. */
function subjectOrder(ctx: IntakeContext): Array<{ type: SubjectType; id: string }> {
  const order: Array<{ type: SubjectType; id: string }> = [];
  if (ctx.event_id) order.push({ type: "event", id: ctx.event_id });
  if (ctx.venue_id) order.push({ type: "venue", id: ctx.venue_id });
  if (ctx.client_org_id) order.push({ type: "client", id: ctx.client_org_id });
  return order;
}

function toRoutedMember(member: VendorTeamMemberRow, role: string): RoutedMember {
  return {
    member_id: member.id,
    name: member.name,
    email: member.email,
    vendor_role: member.vendor_role,
    role,
  };
}

/**
 * Resolve the routed members for an intake context within the actor's org.
 * Walks the subject order; the first subject with any assignment wins. If none
 * match, falls back to the org's admin members.
 */
export async function routeIntake(actor: Actor, ctx: IntakeContext): Promise<RoutingResult> {
  const orgId = actor.org?.id ?? null;
  if (!orgId) {
    return { matched_subject: null, fallback: true, members: [], emails: [] };
  }

  for (const subject of subjectOrder(ctx)) {
    const assignments = await assignmentsForSubject(orgId, subject.type, subject.id);
    if (assignments.length > 0) {
      const members: RoutedMember[] = assignments
        .filter((a) => a.member)
        .map((a) => toRoutedMember(a.member as VendorTeamMemberRow, a.role ?? "collaborator"));
      return {
        matched_subject: subject,
        fallback: false,
        members,
        emails: cleanEmails(members.map((m) => m.email)),
      };
    }
  }

  // Fallback: route to the vendor org's admin team members.
  const admins = await adminMembers(orgId);
  const members = admins.map((m) => toRoutedMember(m, "admin_fallback"));
  return {
    matched_subject: null,
    fallback: true,
    members,
    emails: cleanEmails(members.map((m) => m.email)),
  };
}
