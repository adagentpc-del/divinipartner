/**
 * MFA / 2FA (TOTP) data access. Backed by db/schema-mfa.sql:
 *   - users.totp_secret / totp_enabled / totp_enabled_at
 *   - mfa_backup_codes (hashed one-time recovery codes)
 *
 * See server/src/lib/totp.ts for the TOTP algorithm itself and
 * server/src/routes/mfa.ts for the enrollment/verify/disable flow. Backup
 * codes are stored hashed (scrypt, via the same passwordHash.ts used for
 * account passwords) and are single-use: a successful consume marks the row
 * used_at rather than deleting it, so "was this code ever valid" stays
 * auditable.
 */
import { q, q1, pool } from "../pool.js";
import { hashPassword, verifyPassword } from "../lib/session.js";

export type MfaUserRow = {
  id: string;
  email: string | null;
  totp_secret: string | null;
  totp_enabled: boolean;
};

export async function getMfaUser(userId: string): Promise<MfaUserRow | null> {
  return q1<MfaUserRow>(
    `select id, email, totp_secret, totp_enabled from users where id = $1 limit 1`,
    [userId],
  );
}

/** Store a PENDING secret (enrollment started, not yet confirmed). */
export async function setPendingTotpSecret(userId: string, secret: string): Promise<void> {
  await q1(
    `update users set totp_secret = $2, totp_enabled = false, totp_enabled_at = null,
       updated_at = now() where id = $1`,
    [userId, secret],
  );
}

/** Confirm enrollment: flip totp_enabled true and stamp totp_enabled_at. */
export async function confirmTotpEnrollment(userId: string): Promise<void> {
  await q1(
    `update users set totp_enabled = true, totp_enabled_at = now(), updated_at = now() where id = $1`,
    [userId],
  );
}

/** Fully disable MFA: clear the secret and every backup code. */
export async function disableMfa(userId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `update users set totp_secret = null, totp_enabled = false, totp_enabled_at = null,
         updated_at = now() where id = $1`,
      [userId],
    );
    await client.query(`delete from mfa_backup_codes where user_id = $1`, [userId]);
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

/** Replace all backup codes with a freshly generated set (hashed at rest). */
export async function replaceBackupCodes(userId: string, plainCodes: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`delete from mfa_backup_codes where user_id = $1`, [userId]);
    for (const code of plainCodes) {
      await client.query(
        `insert into mfa_backup_codes (user_id, code_hash) values ($1, $2)`,
        [userId, hashPassword(code)],
      );
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Try to consume a backup code: if a matching, unused hash exists, mark it
 * used and return true. Single-use by design -- a used code is checked
 * against but can never succeed twice.
 */
export async function consumeBackupCode(userId: string, plainCode: string): Promise<boolean> {
  const rows = await q<{ id: string; code_hash: string }>(
    `select id, code_hash from mfa_backup_codes where user_id = $1 and used_at is null`,
    [userId],
  );
  for (const row of rows) {
    if (verifyPassword(plainCode, row.code_hash)) {
      await q1(`update mfa_backup_codes set used_at = now() where id = $1`, [row.id]);
      return true;
    }
  }
  return false;
}

export async function remainingBackupCodeCount(userId: string): Promise<number> {
  const row = await q1<{ count: string }>(
    `select count(*)::text as count from mfa_backup_codes where user_id = $1 and used_at is null`,
    [userId],
  );
  return row ? Number(row.count) : 0;
}
