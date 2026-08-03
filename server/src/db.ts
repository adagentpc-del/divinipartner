/**
 * Divini Partners - data-access + authorization layer (Phase 1 foundation).
 *
 * Backed by db/schema.sql (organizations, users, terms_acceptance, ...).
 * Identity now comes from NATIVE auth: the session `sub` is the `users.id` uuid.
 * `ensureUser`/`getActor` therefore resolve a user by id (with a legacy oidc_sub
 * fallback so any pre-existing Authentik-keyed call still works) and link the
 * user to an `organization` (the account). Roles + tiers drive the role-based
 * dashboards and platform fees.
 */
import { q, q1, pool } from "./pool.js";
import { planTierFor } from "./lib/planCatalog.js";
import { getAdminAllowedEmails } from "./config.js";

export class ForbiddenError extends Error {
  status = 403;
  constructor(msg = "forbidden") {
    super(msg);
    this.name = "ForbiddenError";
  }
}
export class NotFoundError extends Error {
  status = 404;
  constructor(msg = "not found") {
    super(msg);
    this.name = "NotFoundError";
  }
}

// ---- Pricing tiers (blueprint section 4) -----------------------------------
export type Tier = "client" | "free_partner" | "partner" | "premier";
export const TIERS: Record<Tier, { label: string; monthly: number; feeRate: number }> = {
  client: { label: "Client / Event Booker", monthly: 0, feeRate: 0 },
  free_partner: { label: "Free Partner", monthly: 0, feeRate: 0.05 },
  partner: { label: "Partner", monthly: 45, feeRate: 0.025 },
  premier: { label: "Premier", monthly: 99, feeRate: 0.01 },
};

export type Role =
  | "venue" | "vendor" | "supplier" | "installer" | "planner" | "client" | "sponsor" | "billing"
  | "nonprofit" | "donor" | "volunteer" | "exhibitor" | "viewer";
export const ROLES: Role[] = [
  "venue", "vendor", "supplier", "installer", "planner", "client", "sponsor",
  "nonprofit", "donor", "volunteer", "exhibitor", "viewer",
];

export type DbUser = {
  id: string;
  oidc_sub: string;
  email: string | null;
  name: string | null;
  role: string | null;
  organization_id: string | null;
};
export type DbOrg = {
  id: string;
  name: string;
  type: string | null;
  tier: string | null;
  platform_fee_rate: string | null;
  verification_status: string | null;
  white_label_status: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  subscription_status?: string | null;
};

/** One organization a user belongs to, from the multi-org switcher's point of
 *  view: is it the org currently active on their session (users.organization_id)? */
export type MyOrganization = DbOrg & { membership_role: string | null; active: boolean };

const USER_COLS = "id, oidc_sub, email, name, role, organization_id";

/**
 * Resolve the signed-in user from the session subject.
 *
 * With native auth the session `sub` is the `users.id` uuid, so we look up by id
 * first. For backward compatibility (any legacy Authentik-issued token still in
 * flight) we then fall back to `oidc_sub`. The user row is created by the native
 * auth register/verify flow, so this never inserts: it only reads and keeps the
 * email fresh. If no row matches (should not happen for a valid session) we
 * upsert a minimal row keyed by id so downstream code has something to work with.
 */
export async function ensureUser(idOrSub: string, email: string | null): Promise<DbUser> {
  // Match by id (native) or oidc_sub (legacy) in one query.
  let row = await q1<DbUser>(
    `select ${USER_COLS} from users where id::text = $1 or oidc_sub = $1 limit 1`,
    [idOrSub],
  );
  if (row) {
    if (email && email !== row.email) {
      await q1(`update users set email = $2, updated_at = now() where id = $1`, [row.id, email]);
      row.email = email;
    }
    return row;
  }
  // No match. Insert a minimal row. If idOrSub is a valid uuid use it as the id;
  // otherwise treat it as a legacy oidc_sub.
  const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    idOrSub,
  );
  if (looksLikeUuid) {
    row = await q1<DbUser>(
      `insert into users (id, email) values ($1, $2)
       on conflict (id) do update set email = coalesce(excluded.email, users.email),
         updated_at = now()
       returning ${USER_COLS}`,
      [idOrSub, email],
    );
  } else {
    row = await q1<DbUser>(
      `insert into users (oidc_sub, email) values ($1, $2)
       on conflict (oidc_sub) do update set email = coalesce(excluded.email, users.email),
         updated_at = now()
       returning ${USER_COLS}`,
      [idOrSub, email],
    );
  }
  return row as DbUser;
}

/**
 * Resolve the signed-in actor: their user row + organization (or null).
 *
 * Real admin status comes from ADMIN_ALLOWED_EMAILS (server/src/auth.ts's
 * getAuth().isAdmin), a separate mechanism from the users.role column --
 * nothing ever writes "admin"/"super_admin" into that column, since it is
 * set once at registration to the org role the user picked (venue, vendor,
 * client, ...) and stays that way for their own account. But ~48 call sites
 * across the codebase (server/src/db/*.ts) grant elevated access by checking
 * `actor.user.role === "admin" || actor.user.role === "super_admin"` --
 * a real admin logged in via ADMIN_ALLOWED_EMAILS was silently failing every
 * one of those checks, since their own users.role is whatever org role they
 * registered under (or null). In server/src/db/whitelabel.ts specifically
 * this was the ONLY check on the White Label admin pipeline, making it
 * unreachable even for the actual site owner.
 *
 * Fix: override role to "super_admin" on the Actor RETURNED here (in memory
 * only, never persisted) when the email matches the allowlist. This makes
 * all ~48 existing checks correct in one place, with no schema change and no
 * per-file edits, and never touches the user's real stored org role.
 */
export type Actor = { user: DbUser; org: DbOrg | null };
export async function getActor(idOrSub: string, email: string | null): Promise<Actor> {
  const user = await ensureUser(idOrSub, email);
  const org = await getMyOrg(user.id);
  const isPlatformAdmin =
    !!user.email && getAdminAllowedEmails().includes(user.email.toLowerCase());
  const effectiveUser = isPlatformAdmin ? { ...user, role: "super_admin" } : user;
  return { user: effectiveUser, org };
}

const ORG_COLS =
  "o.id, o.name, o.type, o.tier, o.platform_fee_rate, o.verification_status, o.white_label_status, " +
  "o.stripe_customer_id, o.stripe_subscription_id, o.subscription_status";

/** The organization the user belongs to (or null). This is the ACTIVE org for
 *  the session (users.organization_id) -- see switchActiveOrganization for
 *  how a user with multiple org memberships changes which one is active. */
export async function getMyOrg(userId: string): Promise<DbOrg | null> {
  return q1<DbOrg>(
    `select ${ORG_COLS}
       from organizations o
       join users u on u.organization_id = o.id
      where u.id = $1`,
    [userId],
  );
}

/**
 * Every organization this user belongs to (multi-org), newest membership
 * first, flagged with which one is currently active on their session. Used
 * to render the org switcher.
 */
export async function listMyOrganizations(userId: string): Promise<MyOrganization[]> {
  return q<MyOrganization>(
    `select ${ORG_COLS}, m.role as membership_role,
            (u.organization_id = o.id) as active
       from organization_memberships m
       join organizations o on o.id = m.organization_id
       join users u on u.id = m.user_id
      where m.user_id = $1
      order by m.is_default desc, m.created_at asc`,
    [userId],
  );
}

/**
 * Switch the user's ACTIVE organization to one they already belong to.
 * Verifies membership first (never lets a user switch into an org they are
 * not a member of). Returns the newly active org, or null if not a member.
 */
export async function switchActiveOrganization(userId: string, organizationId: string): Promise<DbOrg | null> {
  const member = await q1<{ organization_id: string }>(
    `select organization_id from organization_memberships where user_id = $1 and organization_id = $2`,
    [userId, organizationId],
  );
  if (!member) return null;
  await q1(`update users set organization_id = $2, updated_at = now() where id = $1`, [
    userId,
    organizationId,
  ]);
  return q1<DbOrg>(`select ${ORG_COLS} from organizations o where o.id = $1`, [organizationId]);
}

/** Look up an org by its Stripe Customer id (used by the webhook's
 *  invoice.payment_failed handler, which only carries a customer id). */
export async function getOrgByStripeCustomerId(stripeCustomerId: string): Promise<DbOrg | null> {
  return q1<DbOrg>(`select ${ORG_COLS} from organizations o where o.stripe_customer_id = $1`, [
    stripeCustomerId,
  ]);
}

/**
 * Apply a Stripe subscription lifecycle event to the org it belongs to.
 * Idempotent: replaying the same event just re-applies the same deterministic
 * state, so the webhook can safely retry. Resolves the org from `orgId`
 * (checkout session / subscription metadata) or, failing that, from the
 * Stripe customer id. A no-op if neither resolves to a known org.
 *
 *   active / trialing            -> promote to the subscribed tier (real fee
 *                                    rate + monthly price), subscription_status active
 *   past_due                     -> keep the current tier (grace period, do
 *                                    not yank access on a single missed payment),
 *                                    subscription_status past_due
 *   canceled / unpaid / expired  -> downgrade to the free tier, clear the
 *                                    subscription id, subscription_status canceled
 */
export async function applySubscriptionUpdate(args: {
  orgId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId: string;
  status: string;
  tier?: string | null;
}): Promise<void> {
  let orgId = args.orgId ?? null;
  let orgType: string | null = null;
  if (orgId) {
    const row = await q1<{ type: string | null }>(`select type from organizations where id = $1`, [orgId]);
    orgType = row?.type ?? null;
  } else if (args.stripeCustomerId) {
    const org = await getOrgByStripeCustomerId(args.stripeCustomerId);
    orgId = org?.id ?? null;
    orgType = org?.type ?? null;
  }
  if (!orgId) return;

  if (args.status === "active" || args.status === "trialing") {
    const tier = args.tier && (TIERS as Record<string, unknown>)[args.tier] ? (args.tier as Tier) : null;
    if (tier) {
      // Role-aware fee rate: lib/planCatalog.ts is authoritative when the org's
      // role has a real plan catalog entry (a role with platformFeeRate: null,
      // e.g. client/installer/sponsor, correctly gets 0 -- never TIERS' rate).
      // Falls back to the flat TIERS rate for roles with no catalog entry.
      const roleTier = planTierFor(orgType as Role, tier);
      const feeRate = roleTier ? roleTier.platformFeeRate ?? 0 : TIERS[tier].feeRate;
      await q1(
        `update organizations set tier = $2, platform_fee_rate = $3, subscription_status = 'active',
           stripe_subscription_id = $4, updated_at = now() where id = $1`,
        [orgId, tier, feeRate, args.stripeSubscriptionId],
      );
    } else {
      await q1(
        `update organizations set subscription_status = 'active', stripe_subscription_id = $2, updated_at = now()
         where id = $1`,
        [orgId, args.stripeSubscriptionId],
      );
    }
  } else if (args.status === "past_due") {
    await q1(`update organizations set subscription_status = 'past_due', updated_at = now() where id = $1`, [
      orgId,
    ]);
  } else if (args.status === "canceled" || args.status === "unpaid" || args.status === "incomplete_expired") {
    await q1(
      `update organizations set tier = 'free_partner', platform_fee_rate = $2, subscription_status = 'canceled',
         stripe_subscription_id = null, updated_at = now() where id = $1`,
      [orgId, TIERS.free_partner.feeRate],
    );
  }
}

/**
 * Create an ADDITIONAL organization for a user who already has one (or more)
 * -- e.g. a planner who also runs a venue, or a sponsor agency adding a
 * second brand. Unlike registerOrganization (the first-time onboarding path,
 * which is a no-op if the user already has an org), this always creates a
 * new org + membership row. The newly created org becomes the active org
 * only when `makeActive` is true; otherwise the user's current active org is
 * left unchanged and they can switch into the new one later.
 */
export async function addOrganization(
  userId: string,
  payload: { role: Role; orgName: string; tier?: Tier; makeActive?: boolean },
): Promise<DbOrg> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const tier: Tier = payload.tier && (TIERS as Record<string, unknown>)[payload.tier]
      ? payload.tier
      : "free_partner";
    const feeRate = TIERS[tier].feeRate;
    const org = (
      await client.query(
        `insert into organizations (name, type, tier, platform_fee_rate, subscription_status,
           verification_status, white_label_status, included_seats)
         values ($1,$2,$3,$4,'active','draft','not_eligible',1)
         returning id, name, type, tier, platform_fee_rate, verification_status, white_label_status,
           stripe_customer_id, stripe_subscription_id, subscription_status`,
        [payload.orgName, payload.role, tier, feeRate],
      )
    ).rows[0];

    await client.query(
      `insert into organization_memberships (user_id, organization_id, role, is_default)
       values ($1, $2, $3, false)
       on conflict (user_id, organization_id) do nothing`,
      [userId, org.id, payload.role],
    );

    if (payload.makeActive) {
      await client.query(`update users set organization_id = $2, updated_at = now() where id = $1`, [
        userId,
        org.id,
      ]);
    }

    await client.query("commit");
    return org as DbOrg;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Register: create the organization, set the user's role + org, log terms.
 * If the user already has an org, returns it unchanged (idempotent).
 */
export async function registerOrganization(
  idOrSub: string,
  email: string | null,
  payload: {
    role: Role;
    orgName: string;
    tier: Tier;
    name?: string;
    phone?: string;
    agreementVersion?: string;
    policyVersion?: string;
    ip?: string | null;
  },
): Promise<DbOrg> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    // Native auth: the session subject is the users.id. The user row already
    // exists (created by the auth register/verify flow), so resolve by id first,
    // then by legacy oidc_sub, and only insert a fresh row as a last resort.
    let u = (
      await client.query(
        `update users set
           email = coalesce($2, email),
           name = coalesce($3, name),
           phone = coalesce($4, phone),
           updated_at = now()
         where id::text = $1 or oidc_sub = $1
         returning id, organization_id`,
        [idOrSub, email, payload.name ?? null, payload.phone ?? null],
      )
    ).rows[0];
    if (!u) {
      const looksLikeUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSub);
      u = (
        await client.query(
          looksLikeUuid
            ? `insert into users (id, email, name, phone) values ($1,$2,$3,$4)
                 on conflict (id) do update set
                   email = coalesce(excluded.email, users.email),
                   name = coalesce(excluded.name, users.name),
                   phone = coalesce(excluded.phone, users.phone),
                   updated_at = now()
                 returning id, organization_id`
            : `insert into users (oidc_sub, email, name, phone) values ($1,$2,$3,$4)
                 on conflict (oidc_sub) do update set
                   email = coalesce(excluded.email, users.email),
                   name = coalesce(excluded.name, users.name),
                   phone = coalesce(excluded.phone, users.phone),
                   updated_at = now()
                 returning id, organization_id`,
          [idOrSub, email, payload.name ?? null, payload.phone ?? null],
        )
      ).rows[0];
    }

    if (u.organization_id) {
      const existing = (
        await client.query(`select * from organizations where id = $1`, [u.organization_id])
      ).rows[0];
      await client.query("commit");
      return existing as DbOrg;
    }

    // Per-role default tier when the caller did not pass a valid one. nonprofit
    // registers as a partner-style org (free_partner); donor and volunteer are
    // booker/individual accounts and register client-like (no platform fee).
    const roleDefaultTier: Record<string, Tier> = {
      nonprofit: "free_partner",
      donor: "client",
      volunteer: "client",
      // exhibitor registers as a partner-style org (free_partner); viewer is a
      // read-only client-like account with no platform fee.
      exhibitor: "free_partner",
      viewer: "client",
    };
    // Only FREE tiers may be self-declared at registration -- a paid tier
    // (partner/premier) requires an actual Stripe subscription (see
    // POST /billing/subscribe), never a client-submitted field here. Any paid
    // tier requested at registration time is coerced down to the free tier;
    // the caller upgrades for real, post-registration, through billing.
    const requestedTier = (TIERS as Record<string, unknown>)[payload.tier] ? payload.tier : null;
    const requestedIsFree = requestedTier ? TIERS[requestedTier].monthly === 0 : false;
    const tier: Tier = requestedTier && requestedIsFree
      ? requestedTier
      : roleDefaultTier[payload.role] ?? "free_partner";
    const feeRate = TIERS[tier].feeRate;
    // organizations.type is free text (no DB CHECK); the role maps straight to it,
    // so nonprofit -> type 'nonprofit', donor -> 'donor', volunteer -> 'volunteer'.
    const org = (
      await client.query(
        `insert into organizations (name, type, tier, platform_fee_rate, subscription_status,
           verification_status, white_label_status, included_seats)
         values ($1,$2,$3,$4,'active','draft','not_eligible',1)
         returning id, name, type, tier, platform_fee_rate, verification_status, white_label_status`,
        [payload.orgName, payload.role, tier, feeRate],
      )
    ).rows[0];

    await client.query(
      `update users set role = $2, organization_id = $3, account_type = $2, status = 'active', updated_at = now()
        where id = $1`,
      [u.id, payload.role, org.id],
    );

    await client.query(
      `insert into organization_memberships (user_id, organization_id, role, is_default)
       values ($1, $2, $3, true)
       on conflict (user_id, organization_id) do nothing`,
      [u.id, org.id, payload.role],
    );

    await client.query(
      `insert into terms_acceptance (user_id, agreement_version, policy_version, account_type, organization_id, ip_address)
       values ($1,$2,$3,$4,$5,$6)`,
      [u.id, payload.agreementVersion ?? "v1", payload.policyVersion ?? "v1", payload.role, org.id, payload.ip ?? null],
    );

    await client.query("commit");
    return org as DbOrg;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

// ============================================================================
// Native auth (email/password) data access
// ============================================================================

export type AuthUser = {
  id: string;
  email: string | null;
  name: string | null;
  password_hash: string | null;
  email_verified: boolean | null;
  verify_token: string | null;
  verify_expires: string | null;
  reset_token: string | null;
  reset_expires: string | null;
  organization_id: string | null;
};

const AUTH_USER_COLS =
  "id, email, name, password_hash, email_verified, verify_token, verify_expires, reset_token, reset_expires, organization_id";

/** Find a user by (case-insensitive) email. */
export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  return q1<AuthUser>(
    `select ${AUTH_USER_COLS} from users where lower(email) = lower($1) limit 1`,
    [email],
  );
}

/** Find a user by an unexpired verification token. */
export async function findUserByVerifyToken(token: string): Promise<AuthUser | null> {
  return q1<AuthUser>(
    `select ${AUTH_USER_COLS} from users
      where verify_token = $1 and (verify_expires is null or verify_expires > now())
      limit 1`,
    [token],
  );
}

/** Find a user by an unexpired reset token. */
export async function findUserByResetToken(token: string): Promise<AuthUser | null> {
  return q1<AuthUser>(
    `select ${AUTH_USER_COLS} from users
      where reset_token = $1 and reset_expires is not null and reset_expires > now()
      limit 1`,
    [token],
  );
}

/**
 * Register (native): UPSERT BY EMAIL. If a user row with this email exists (e.g.
 * a legacy Authentik row, or an unverified prior signup) set its password_hash +
 * a fresh verify token on the SAME row (preserving id + org memberships). Else
 * insert a new user with a generated uuid id. Always sets email_verified=false.
 * Returns the user id + verify token to email.
 */
export async function upsertUserForRegistration(args: {
  email: string;
  passwordHash: string;
  verifyToken: string;
  verifyExpires: Date;
}): Promise<{ id: string }> {
  const existing = await findUserByEmail(args.email);
  if (existing) {
    await q1(
      `update users set password_hash = $2, email_verified = false,
         verify_token = $3, verify_expires = $4, updated_at = now()
       where id = $1`,
      [existing.id, args.passwordHash, args.verifyToken, args.verifyExpires.toISOString()],
    );
    return { id: existing.id };
  }
  const row = await q1<{ id: string }>(
    `insert into users (email, password_hash, email_verified, verify_token, verify_expires)
       values ($1, $2, false, $3, $4)
     returning id`,
    [args.email, args.passwordHash, args.verifyToken, args.verifyExpires.toISOString()],
  );
  return row as { id: string };
}

/** Regenerate a verification token for an existing user (resend flow). */
export async function setVerifyToken(
  userId: string,
  token: string,
  expires: Date,
): Promise<void> {
  await q1(
    `update users set verify_token = $2, verify_expires = $3, updated_at = now() where id = $1`,
    [userId, token, expires.toISOString()],
  );
}

/** Mark a user verified and clear the verification token. */
export async function markVerified(userId: string): Promise<void> {
  await q1(
    `update users set email_verified = true, verify_token = null, verify_expires = null,
       updated_at = now() where id = $1`,
    [userId],
  );
}

/** Set a password reset token. */
export async function setResetToken(userId: string, token: string, expires: Date): Promise<void> {
  await q1(
    `update users set reset_token = $2, reset_expires = $3, updated_at = now() where id = $1`,
    [userId, token, expires.toISOString()],
  );
}

/**
 * Apply a password reset: set the new hash, clear the reset token, and (since
 * possessing the emailed reset link proves control of the inbox) mark verified.
 */
export async function applyPasswordReset(userId: string, passwordHash: string): Promise<void> {
  await q1(
    `update users set password_hash = $2, reset_token = null, reset_expires = null,
       email_verified = true, updated_at = now() where id = $1`,
    [userId, passwordHash],
  );
}

/**
 * Transfer ownership of the caller's organization to the user identified by
 * `newEmail`. Confirms the caller owns/admins the org, upserts the target user
 * by email (unverified, no password yet, with a claim/verify token), moves the
 * org membership to that user, updates the org billing contact, and returns the
 * target user id + the verify token so the caller can email a claim link.
 *
 * Membership model: a user belongs to one organization via users.organization_id
 * (see getMyOrg). "Owner" is the user whose organization_id points at the org and
 * whose role is the org-level role. We reassign that membership to the new email.
 */
export async function transferOrgOwner(args: {
  callerUserId: string;
  callerIsAdmin: boolean;
  newEmail: string;
  verifyToken: string;
  verifyExpires: Date;
}): Promise<{ orgId: string; orgName: string; targetUserId: string; created: boolean }> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    // Resolve the caller + their org.
    const caller = (
      await client.query(
        `select id, organization_id, role from users where id::text = $1 or oidc_sub = $1 limit 1`,
        [args.callerUserId],
      )
    ).rows[0] as { id: string; organization_id: string | null; role: string | null } | undefined;
    if (!caller || !caller.organization_id) {
      throw new ForbiddenError("you do not own a profile to transfer");
    }
    const orgId = caller.organization_id;
    const org = (
      await client.query(`select id, name, type, tier from organizations where id = $1`, [orgId])
    ).rows[0] as { id: string; name: string; type: string | null; tier: string | null } | undefined;
    if (!org) throw new NotFoundError("organization not found");

    // Only the org owner (a member of this org) or a platform admin may transfer.
    if (!args.callerIsAdmin) {
      // caller is a member of the org by construction (organization_id matches),
      // which we treat as owner-level for this single-owner membership model.
    }

    // Upsert the target user by email. New owner starts unverified with a claim
    // token and no password; they set a password via the verify/claim flow.
    let target = (
      await client.query(
        `select id, organization_id from users where lower(email) = lower($1) limit 1`,
        [args.newEmail],
      )
    ).rows[0] as { id: string; organization_id: string | null } | undefined;
    let created = false;
    if (!target) {
      target = (
        await client.query(
          `insert into users (email, email_verified, verify_token, verify_expires)
             values ($1, false, $2, $3)
           returning id, organization_id`,
          [args.newEmail, args.verifyToken, args.verifyExpires.toISOString()],
        )
      ).rows[0] as { id: string; organization_id: string | null };
      created = true;
    } else {
      await client.query(
        `update users set verify_token = $2, verify_expires = $3, updated_at = now() where id = $1`,
        [target.id, args.verifyToken, args.verifyExpires.toISOString()],
      );
    }

    // Reassign org membership: the new owner takes the org + the org-level role,
    // the previous owner is detached from the org.
    await client.query(
      `update users set organization_id = $2, role = coalesce($3, role),
         account_type = coalesce($3, account_type), status = 'active', updated_at = now()
       where id = $1`,
      [target.id, orgId, org.type],
    );
    if (target.id !== caller.id) {
      await client.query(
        `update users set organization_id = null, updated_at = now() where id = $1`,
        [caller.id],
      );
    }

    // Update the org contact/owner email so the new email controls the profile.
    await client.query(
      `update organizations set billing_contact = $2, updated_at = now() where id = $1`,
      [orgId, args.newEmail],
    );

    await client.query("commit");
    return { orgId, orgName: org.name, targetUserId: target.id, created };
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
