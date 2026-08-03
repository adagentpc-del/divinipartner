# Access Control Policy (DRAFT)

**Status:** DRAFT -- not approved, not in effect.
**Maps to:** SOC 2 CC6.1-CC6.3; ISO/IEC 27001:2022 A.5.15-A.5.18, A.8.2-A.8.5.
**Version:** 0.1 (draft) **Effective date:** _not yet effective_
**Owner:** _unassigned -- fill in before approval_
**Review cadence:** _to be set (recommend annual, or on any access-model change)_

## 1. Purpose

Defines who gets access to what within Divini Partners -- both customer/
partner-facing access (organization roles) and internal/administrative
access (the platform admin allowlist and database/infrastructure access) --
and how access is granted, reviewed, and revoked.

## 2. Customer/partner-facing access model (as implemented)

- Every user authenticates with a verified email + password (native auth,
  scrypt-hashed, `server/src/lib/passwordHash.ts`). Email verification is
  required before first login.
- A user belongs to one or more organizations via
  `organization_memberships`, with one "active" organization at a time
  (`users.organization_id`). Data access is organization-scoped throughout
  the application: a user sees their own organization's quotes, invoices,
  events, and profile data, not other organizations' data, unless they are
  a platform admin.
- Roles (venue, vendor, supplier, installer, planner, client, sponsor,
  nonprofit, donor, volunteer, exhibitor, viewer, billing) determine which
  dashboards and features are available. Roles are self-selected at
  registration and are a product/UX construct, not a security boundary by
  themselves -- the organization-scoping described above is the actual
  data-isolation control.
- Team seats (`team_seats`, keyed by email within an organization) let an
  organization add additional members without those members owning the
  organization itself.

## 3. Administrative / privileged access model (as implemented)

- Platform admin authority is granted ONLY via the `ADMIN_ALLOWED_EMAILS`
  environment variable on the server -- a fixed allowlist of email
  addresses, evaluated server-side (`server/src/auth.ts`'s `getAuth()`),
  never trusted from client input. There is no in-product "make this user
  an admin" button; granting admin access requires editing server
  configuration and restarting the process.
- **Real, open gap (see `AI_PROJECT_OS/53_SOC2_ISO27001_AUDIT.md`): admin
  accounts have no MFA requirement.** A compromised password for an
  allowlisted email is sufficient for full admin access today. This policy
  cannot claim MFA-gated admin access is in effect until the MFA gap
  tracked as task T11 in `AI_PROJECT_OS/12_TASK_QUEUE.md` is actually
  built.
- Database/infrastructure access (direct Postgres access, server SSH,
  hosting-provider console access) is outside the application's own access
  control and is currently managed manually by whoever operates the
  DigitalOcean droplet described in `AI_PROJECT_OS/23_DEPLOYMENT.md`.
  _This draft cannot state a formal review cadence for infra access because
  none is documented anywhere in the repository as of 2026-08-03 -- the
  organization needs to define one._

## 4. Access provisioning and de-provisioning

- **Provisioning (customer/partner):** self-service via registration +
  email verification. No manual approval step.
- **Provisioning (admin):** manual -- add an email to
  `ADMIN_ALLOWED_EMAILS` and restart the server. _Recommend the
  organization document who is authorized to make this change and require
  a second approver, since it is currently a single-person action with no
  in-app record of who made it or when (the change itself is not
  audit-logged since it happens outside the application)._
- **De-provisioning (customer/partner):** a user can self-service delete
  their own account (Profile -> Account -> "Delete account", built
  2026-08-03; requires password re-confirmation). This anonymizes and
  deactivates the account rather than hard-deleting it -- see
  `data-retention-and-deletion-policy.md` for why. An organization admin
  can also remove a team member's seat (`team_seats`).
- **De-provisioning (admin):** remove the email from
  `ADMIN_ALLOWED_EMAILS` and restart. Same "no in-app record" caveat as
  provisioning above applies to removal.

## 5. Access review

_No periodic access review process exists today._ The organization should
define one -- at minimum, a scheduled (e.g. quarterly) review of the
`ADMIN_ALLOWED_EMAILS` list to confirm every entry is still an authorized,
current employee/operator, since this list is the single highest-privilege
access point in the system.

## 6. Password policy

- Minimum 8 characters, enforced server-side on registration and reset
  (`server/src/routes/auth-native.ts`). No composition (uppercase/number/
  symbol) requirement -- consistent with current NIST 800-63B guidance,
  which favors length over forced complexity.
- Passwords are hashed with scrypt (`server/src/lib/passwordHash.ts`),
  never stored or logged in plaintext.
- A successful password reset now (as of 2026-08-03) emails the account
  owner and writes an audit-log entry, so an unauthorized reset is visible
  rather than silent.

## 7. Session management

- Sessions are signed JWTs (`SESSION_SECRET`-keyed), 30-day fixed expiry,
  delivered as an httpOnly cookie plus a bearer-token fallback.
- **Gap:** no idle/inactivity timeout, and no general session-revocation
  mechanism -- a stolen token remains valid until it naturally expires,
  except for the one case fixed 2026-08-03 (a deleted account's token is
  now explicitly rejected). See
  `AI_PROJECT_OS/53_SOC2_ISO27001_AUDIT.md` gap #4 for the recommended fix
  (a session-epoch/denylist mechanism) -- not yet built.

## 8. Related documents

- `information-security-policy.md`
- `data-retention-and-deletion-policy.md`
- `AI_PROJECT_OS/53_SOC2_ISO27001_AUDIT.md`
- `AI_PROJECT_OS/51_SECURITY.md`
