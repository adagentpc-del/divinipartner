/**
 * Module 2 - Referral data access (referral_codes + user_referrals).
 *
 * Backed by db/schema-rev-referral.sql. Every accessor is user-scoped by the
 * caller's users.id so a forged id cannot read or convert another user's
 * referrals (IDOR-safe at the route layer, which always passes the actor's id).
 *
 * Credit grants and the conversion side effects live in lib/credits.ts; this
 * module only owns the referral_codes + user_referrals tables.
 */
import { q, q1 } from "../pool.js";

export type ReferralCode = {
  id: string;
  user_id: string;
  code: string;
  created_at: string;
};

export type ReferralStatus = "pending" | "converted" | "expired";

export type UserReferral = {
  id: string;
  referrer_user_id: string;
  referred_user_id: string | null;
  referred_email: string | null;
  code: string | null;
  status: ReferralStatus;
  created_at: string;
  converted_at: string | null;
};

/** Generate a short, human-friendly, unambiguous referral code. */
function newCode(): string {
  // Avoid 0/O and 1/I/L ambiguity; 8 chars from a 30-symbol alphabet.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/**
 * Return the user's referral code, creating it on first call. One code per user
 * (referral_codes.user_id is unique). Retries on the (rare) code collision.
 */
export async function ensureReferralCode(userId: string): Promise<ReferralCode> {
  const existing = await q1<ReferralCode>(
    `select id, user_id, code, created_at from referral_codes where user_id = $1`,
    [userId],
  );
  if (existing) return existing;

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const row = await q1<ReferralCode>(
        `insert into referral_codes (user_id, code)
           values ($1, $2)
         on conflict (user_id) do update set user_id = excluded.user_id
         returning id, user_id, code, created_at`,
        [userId, newCode()],
      );
      if (row) return row;
    } catch {
      // Unique violation on `code` - try a fresh code.
    }
  }
  // Last resort: re-read (another request may have created it concurrently).
  const row = await q1<ReferralCode>(
    `select id, user_id, code, created_at from referral_codes where user_id = $1`,
    [userId],
  );
  if (!row) throw new Error("could not allocate a referral code");
  return row;
}

/** Look up the referral code row by its code (for attribution at signup). */
export async function findCode(code: string): Promise<ReferralCode | null> {
  return q1<ReferralCode>(
    `select id, user_id, code, created_at from referral_codes where code = $1`,
    [code],
  );
}

/**
 * Record a referral the user is sending (status 'pending'). Idempotent per
 * (referrer, referred_email) so re-sending the same invite does not duplicate.
 */
export async function trackReferral(
  referrerUserId: string,
  input: { code?: string | null; referredEmail?: string | null; referredUserId?: string | null },
): Promise<UserReferral> {
  const email = (input.referredEmail ?? "").trim().toLowerCase() || null;

  if (email) {
    const dup = await q1<UserReferral>(
      `select * from user_referrals
        where referrer_user_id = $1 and lower(referred_email) = $2
        order by created_at desc limit 1`,
      [referrerUserId, email],
    );
    if (dup) return dup;
  }

  const row = await q1<UserReferral>(
    `insert into user_referrals (referrer_user_id, referred_user_id, referred_email, code, status)
       values ($1, $2, $3, $4, 'pending')
     returning *`,
    [referrerUserId, input.referredUserId ?? null, email, input.code ?? null],
  );
  return row as UserReferral;
}

/** All referrals this user has sent, newest first (IDOR-scoped by referrer). */
export async function listReferrals(referrerUserId: string): Promise<UserReferral[]> {
  return q<UserReferral>(
    `select * from user_referrals where referrer_user_id = $1 order by created_at desc`,
    [referrerUserId],
  );
}

/** Sent + converted counts for the referrer (dashboard summary). */
export async function referralCounts(
  referrerUserId: string,
): Promise<{ sent: number; converted: number; pending: number }> {
  const row = await q1<{ sent: string; converted: string; pending: string }>(
    `select
       count(*)::int as sent,
       count(*) filter (where status = 'converted')::int as converted,
       count(*) filter (where status = 'pending')::int as pending
     from user_referrals where referrer_user_id = $1`,
    [referrerUserId],
  );
  return {
    sent: Number(row?.sent ?? 0),
    converted: Number(row?.converted ?? 0),
    pending: Number(row?.pending ?? 0),
  };
}

/**
 * Find the open referral to convert for a referred party. Resolution order:
 * explicit referral id, then code (latest pending), then referred email (latest
 * pending). Returns null when there is nothing to convert.
 */
export async function findConvertible(input: {
  referralId?: string | null;
  code?: string | null;
  referredEmail?: string | null;
  referredUserId?: string | null;
}): Promise<UserReferral | null> {
  if (input.referralId) {
    return q1<UserReferral>(`select * from user_referrals where id = $1`, [input.referralId]);
  }
  if (input.code) {
    const byCode = await q1<UserReferral>(
      `select * from user_referrals
        where code = $1 and status = 'pending'
        order by created_at desc limit 1`,
      [input.code],
    );
    if (byCode) return byCode;
    // No tracked row yet: synthesize from the code owner so a fresh signup with
    // a referral code still attributes and converts exactly once.
    const owner = await findCode(input.code);
    if (owner) {
      return trackReferral(owner.user_id, {
        code: input.code,
        referredEmail: input.referredEmail ?? null,
        referredUserId: input.referredUserId ?? null,
      });
    }
  }
  const email = (input.referredEmail ?? "").trim().toLowerCase() || null;
  if (email) {
    return q1<UserReferral>(
      `select * from user_referrals
        where lower(referred_email) = $1 and status = 'pending'
        order by created_at desc limit 1`,
      [email],
    );
  }
  return null;
}

/**
 * Mark a referral converted exactly once. Returns the updated row only when
 * THIS call performed the transition (the where status = 'pending' guard makes
 * conversion idempotent under concurrency). Returns null if already converted.
 */
export async function markConverted(
  referralId: string,
  referredUserId?: string | null,
): Promise<UserReferral | null> {
  return q1<UserReferral>(
    `update user_referrals
        set status = 'converted',
            converted_at = now(),
            referred_user_id = coalesce($2, referred_user_id)
      where id = $1 and status = 'pending'
      returning *`,
    [referralId, referredUserId ?? null],
  );
}
