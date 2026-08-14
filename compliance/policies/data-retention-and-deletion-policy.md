# Data Retention and Deletion Policy (DRAFT)

**Status:** DRAFT -- not approved, not in effect. Requires counsel review
before relying on this for GDPR/CCPA or similar claims.
**Maps to:** SOC 2 Privacy criteria (if in scope); ISO/IEC 27001:2022 A.5.34;
GDPR Art. 17 ("right to erasure") / CCPA-adjacent, applicability not yet
formally assessed.
**Version:** 0.1 (draft) **Effective date:** _not yet effective_
**Owner:** _unassigned -- fill in before approval_
**Review cadence:** _to be set_

## 1. Purpose

States what data Divini Partners keeps, for how long, and what actually
happens when a user asks for it to be deleted -- written directly from the
implemented behavior (`server/src/db.ts`'s `deleteAccount()` and
`server/src/routes/compliance-privacy.ts`'s data-subject-request workflow),
not from an aspirational policy that does not match the code.

## 2. Categories of data held

| Category | Examples | Where |
|---|---|---|
| Account/identity | email, name, phone, password hash | `users` table |
| Organization/business | org profile, quotes, invoices, events, bids | `organizations` and ~130 related tables |
| Financial | platform fees, payouts, venue revenue share | `platform_revenue`, `venue_revenue_share`, payout tables |
| Uploaded documents | vendor rate sheets, floor plans, contracts | local disk or S3-compatible storage (`objectStorage.ts`) |
| Audit trail | who did what, when | `audit_logs` |
| Consent / privacy requests | consent grants/withdrawals, data-subject request history | `db/compliancePrivacy.ts` tables |

## 3. Retention principle

Financial and audit records are retained even after an individual user
deletes their own account, because:

- Multiple people at the SAME organization may depend on shared records
  (a quote one team member created is still needed by their teammates and
  by the counterparty organization).
- Financial/audit-record integrity is itself a control this policy and
  `information-security-policy.md` commit to (see objective 2 there) --
  hard-deleting a user who was party to a paid transaction would break the
  financial trail for everyone else involved, not just that user.
- This mirrors standard practice at payment processors and most B2B SaaS:
  deleting a PERSON's login and personal data is not the same operation as
  deleting a BUSINESS RECORD they were once a party to.

_The organization should set explicit retention PERIODS (e.g. "financial
records retained 7 years") once a real accounting/tax review has happened;
this draft does not invent a number that has not been reviewed._ The
`retention_policy.set` audit action and the retention-policy table in
`db/compliancePrivacy.ts` already support recording a real, admin-set
retention period per data category once one is decided -- the mechanism
exists, the actual numbers do not yet.

## 4. What "delete my account" actually does (implemented 2026-08-03)

Reachable at Profile -> Account -> "Delete account" (also required for
Apple Guideline 5.1.1(v) -- see `AI_PROJECT_OS/52_COMPLIANCE.md`). Requires
the user's current password as re-confirmation. On success
(`server/src/db.ts`'s `deleteAccount()`):

- The user's email is overwritten with a unique, non-routable placeholder
  (`deleted+<id>@deleted.invalid`), freeing their real email address for
  reuse.
- Name and phone are cleared; notification preferences are dropped.
- The password hash is replaced with a hash of a random, never-communicated
  32-byte token -- a validly-formatted hash no real password can ever
  produce, permanently locking the account out.
- Any live email-verification or password-reset tokens are cleared.
- The user's organization memberships and their `team_seats` rows (keyed by
  their pre-deletion email) are removed, so they no longer appear as an
  active member anywhere.
- `status` is set to `'deleted'` and `deleted_at` is stamped.
- A confirmation email is sent to the user's ORIGINAL address (captured
  before anonymization), and an `account.deleted` audit-log entry is
  written.
- Any still-valid session token for the deleted account is rejected on its
  next use (`AccountDeletedError`, checked in `ensureUser()`), even before
  it would naturally expire.

**What is deliberately NOT deleted:** the underlying `users` row (kept,
anonymized); the organizations, quotes, invoices, and other records that
reference the user's id; `audit_logs` entries naming the user. See section 3
for why.

**What is not yet built:** an automated purge of the anonymized row after
some retention period, or a full data-export (machine-readable copy) tied
directly to the self-service delete button. The formal data-subject-request
workflow (`compliance-privacy.ts`, reachable at
`src/pages/ComplianceCenter.tsx`) supports export/access/correction requests
separately and IS built, but is admin-processed rather than instant --
appropriate for requests that need human review, not a substitute for the
instant self-service deletion above.

## 5. Data-subject request workflow (separate from self-service deletion)

For requests beyond simple account deletion -- data export, access,
correction -- users can submit a formal request via
`src/pages/ComplianceCenter.tsx` (backed by
`server/src/routes/compliance-privacy.ts`). Every request is audit-logged
and triggers an admin notification. An admin advances the request through
`received -> in_progress -> completed | rejected`, with a resolution note.
_This draft does not commit to a specific response-time SLA (e.g. GDPR's 30
days) until counsel confirms which regulations actually apply to this
product's user base._

## 6. Backups and deletion

An automated backup mechanism now exists (`server/src/scripts/
backup-db.ts`/`restore-db.ts`, built 2026-08-03): scheduled, retention-
pruned (`BACKUP_RETENTION_DAYS`, default 14 days), and live-verified
including a full restore. This means a deleted/anonymized user's
PRE-deletion data can persist in a backup for up to the configured
retention window before that backup ages out and is pruned. This policy
can now state a bound: once the cron job is installed on the server (the
one remaining operator step -- see `AI_PROJECT_OS/23_DEPLOYMENT.md`),
deleted data is fully purged from backups within `BACKUP_RETENTION_DAYS`
of the deletion, not indefinitely.

## 7. Consistency with the public Privacy Policy (found + fixed 2026-08-03)

Drafting this document surfaced a real discrepancy: `src/pages/Privacy.tsx`
already referenced the "Profile -> Delete account" feature (written before
the feature existed) and claimed deletion would remove "its associated data
(projects, packages, bids, files)" when the user's organization had no
other members. That is not what the shipped implementation does -- it never
cascade-deletes organization/business records, for the reasons in section 3.
Fixed by correcting the public policy text to match actual behavior (kept
login/personal-data removal, corrected the business-records claim) rather
than building a cascade-delete to match the old text, since cascade-deleting
shared transaction records would itself break other parties' retained
records and contradicts the anonymize-not-hard-delete principle used
everywhere else in this codebase. Counsel should re-review the corrected
Privacy Policy text alongside this document.

## 8. Related documents

- `access-control-policy.md`
- `information-security-policy.md`
- `AI_PROJECT_OS/53_SOC2_ISO27001_AUDIT.md`
- `AI_PROJECT_OS/52_COMPLIANCE.md`
- `src/pages/Privacy.tsx` (the user-facing Privacy Policy this internal document should stay consistent with)
