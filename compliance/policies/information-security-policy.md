# Information Security Policy (DRAFT)

**Status:** DRAFT -- not approved, not in effect. Requires a named owner and
executive sign-off before use.
**Applies to:** Divini Partners (the product and the organization operating it).
**Maps to:** SOC 2 Common Criteria (CC1.1-CC5.3); ISO/IEC 27001:2022 clause 5
("Leadership"), clause 6 ("Planning"), Annex A.5.1 ("Policies for information
security").
**Version:** 0.1 (draft) **Effective date:** _not yet effective_
**Owner:** _unassigned -- fill in before approval_
**Review cadence:** _to be set (recommend annual, or on material change)_

## 1. Purpose

This policy states the organization's commitment to protecting the
confidentiality, integrity, and availability of the data it holds --
customer/partner business data (organizations, events, quotes, invoices,
uploaded documents), platform users' personal information, and the
platform's own operational data -- and establishes the framework the more
specific policies in this folder (`access-control-policy.md`,
`data-retention-and-deletion-policy.md`, `incident-response-plan.md`,
`subprocessors.md`) implement.

## 2. Scope

Applies to the Divini Partners application (web SPA + Express/Postgres
backend), its hosting infrastructure, and everyone with administrative or
operational access to it. Does not currently apply to a native mobile app
codebase (the iOS/Android builds wrap the same hosted web app via
Capacitor -- see `AI_PROJECT_OS/52_COMPLIANCE.md`).

## 3. Roles and responsibilities

_To be filled in with real names/titles before this policy is approved._
At minimum, define:

- **ISMS owner** -- accountable for this policy and its children existing,
  being followed, and being reviewed on schedule.
- **Incident commander** (may be the same person) -- see
  `incident-response-plan.md`.
- **Access approver** -- who grants/revokes `ADMIN_ALLOWED_EMAILS` and any
  other privileged access. See `access-control-policy.md`.

## 4. Security objectives (what the organization commits to)

1. Protect the confidentiality of customer and user data against
   unauthorized access, whether external (an attacker) or internal (an
   employee/contractor exceeding their need-to-know).
2. Maintain the integrity of financial records (quotes, invoices, platform
   fee ledgers, payouts) -- see the anonymize-not-hard-delete approach in
   `data-retention-and-deletion-policy.md`, which exists specifically to
   preserve this integrity even when a user deletes their account.
3. Maintain the availability of the platform for legitimate use, within the
   limits of a single-region deployment (no documented multi-region
   failover as of this draft).
4. Detect and respond to security incidents in a timely, documented way
   (see `incident-response-plan.md`).
5. Meet applicable legal, regulatory, and contractual obligations regarding
   data protection (governing law: Florida, per the product's Terms of
   Service; applicability of GDPR/CCPA depends on actual user geography and
   has not been formally assessed as of this draft).

## 5. Current technical control baseline

This policy is backed by real, code-level controls, not aspirational ones.
The authoritative, continuously-maintained inventory of what is actually
implemented lives in `AI_PROJECT_OS/53_SOC2_ISO27001_AUDIT.md` -- this
policy summarizes it and should be re-synced with that document whenever it
changes materially. As of the 2026-08-03 audit: native authentication with
hashed passwords, role-based + allowlist-based access control, CSRF
protection, rate limiting, security response headers, parameterized SQL
throughout, optional encryption at rest for stored objects, TLS in transit
(edge-terminated), and audit logging on 45+ sensitive-action call sites.
Known, currently-open gaps: no MFA anywhere, no automated/scheduled
backups, no structured logging or error-monitoring service. See the audit
document for the full, ranked list -- do not let this policy imply those
gaps are closed.

## 6. Enforcement and exceptions

_To be defined by the organization._ At minimum, state what happens when
this policy or its children are violated, and how a documented, approved
exception (e.g. a temporary access grant outside normal process) is
requested and recorded.

## 7. Related documents

- `access-control-policy.md`
- `data-retention-and-deletion-policy.md`
- `incident-response-plan.md`
- `subprocessors.md`
- `AI_PROJECT_OS/51_SECURITY.md` (technical security posture, developer-facing)
- `AI_PROJECT_OS/53_SOC2_ISO27001_AUDIT.md` (the control audit this policy summarizes)
- `AI_PROJECT_OS/52_COMPLIANCE.md` (product compliance status, including Apple App Store)
