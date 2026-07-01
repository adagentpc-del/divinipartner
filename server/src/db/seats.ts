/**
 * Team seats: extra seats an org buys beyond its included seat. Active seats are
 * billable at SEAT_PRICE_USD per seat per month. Backed by the team_seats table.
 * The /account/seats page manages these; /api/seats/checkout charges for them.
 */
import { q, q1 } from "../pool.js";
import { SEAT_PRICE_USD } from "../config.js";

export type SeatStatus = "active" | "invited" | "removed";

export interface TeamSeat {
  id: string;
  organization_id: string;
  member_email: string;
  member_name: string | null;
  status: SeatStatus;
  created_at: string;
  updated_at: string;
}

/** All seats for an org (newest first), excluding removed ones. */
export async function listSeats(orgId: string): Promise<TeamSeat[]> {
  return q<TeamSeat>(
    `select id, organization_id, member_email, member_name, status, created_at, updated_at
       from team_seats
      where organization_id = $1 and status <> 'removed'
      order by created_at asc`,
    [orgId],
  );
}

/**
 * Add (or re-activate) a seat by email. Idempotent on (org, email): a previously
 * removed seat is brought back to active and its name refreshed.
 */
export async function addSeat(orgId: string, email: string, name?: string | null): Promise<TeamSeat> {
  return (await q1<TeamSeat>(
    `insert into team_seats (organization_id, member_email, member_name, status)
       values ($1,$2,$3,'active')
     on conflict (organization_id, member_email) do update set
       member_name = coalesce(excluded.member_name, team_seats.member_name),
       status = 'active',
       updated_at = now()
     returning id, organization_id, member_email, member_name, status, created_at, updated_at`,
    [orgId, email.trim().toLowerCase(), name?.trim() || null],
  )) as TeamSeat;
}

/** Remove a seat (soft-delete to keep the audit trail). Returns the row or null. */
export async function removeSeat(orgId: string, id: string): Promise<TeamSeat | null> {
  return q1<TeamSeat>(
    `update team_seats
        set status = 'removed', updated_at = now()
      where organization_id = $1 and id = $2
      returning id, organization_id, member_email, member_name, status, created_at, updated_at`,
    [orgId, id],
  );
}

/** Count of billable (active) seats for an org. */
export async function countBillableSeats(orgId: string): Promise<number> {
  const row = await q1<{ n: string }>(
    `select count(*)::int as n from team_seats where organization_id = $1 and status = 'active'`,
    [orgId],
  );
  return Number(row?.n ?? 0);
}

/** Monthly cost (major units) for a given seat count at SEAT_PRICE_USD per seat. */
export function monthlyCost(count: number): number {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return Math.round(n * SEAT_PRICE_USD * 100) / 100;
}
