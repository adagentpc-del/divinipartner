# Incident Response Plan (DRAFT)

**Status:** DRAFT -- not approved, not in effect, and NOT YET TESTED. An
untested incident response plan is not a real control; run at least one
tabletop exercise before relying on this.
**Maps to:** SOC 2 CC7.4-CC7.5; ISO/IEC 27001:2022 A.5.24-A.5.28.
**Version:** 0.1 (draft) **Effective date:** _not yet effective_
**Owner:** _unassigned -- fill in before approval_
**Review cadence:** _to be set (recommend after every real incident, and at least annually otherwise)_

## 1. Purpose

Defines what happens when a security incident is suspected or confirmed --
who is notified, what gets done, and in what order -- so the response is
faster and more consistent than improvising under pressure.

## 2. Definitions

- **Security incident:** any event that actually or potentially compromises
  the confidentiality, integrity, or availability of Divini Partners data
  or systems. Examples: unauthorized access to an account or the database,
  a leaked `SESSION_SECRET`/`DOWNLOAD_URL_SECRET`/database credential, a
  successful injection or CSRF attack, a compromised admin account, a
  vendor/subprocessor breach affecting shared data, or credible evidence of
  any of the above (e.g. an unexplained spike in `audit_logs` admin
  actions, a user report of unauthorized changes to their account).
- **Data breach:** an incident confirmed to have resulted in unauthorized
  access to, or disclosure of, personal data.

## 3. Roles (to be assigned before this plan is effective)

- **Incident commander:** owns the response end to end; the single person
  who decides when the incident is contained and when it is closed.
  _Unassigned._
- **Technical responder:** investigates and remediates (may be the same
  person as the ISMS owner in `information-security-policy.md`).
  _Unassigned._
- **Communications lead:** owns any customer/user/regulator notification.
  _Unassigned._

## 4. Detection

Real, current detection capability, honestly stated:

- `audit_logs` (`server/src/lib/audit.ts`) records 45+ sensitive-action
  call sites with actor, action, before/after state, and IP -- but nothing
  actively monitors it for anomalies today. Detection currently depends on
  someone thinking to query it.
- Rate-limit 429 responses (`server/src/lib/rateLimit.ts`) throttle
  credential-stuffing attempts but do not alert anyone when they trigger.
- There is no error-monitoring or SIEM-style alerting integrated
  (`AI_PROJECT_OS/53_SOC2_ISO27001_AUDIT.md` gap #3). This is the single
  biggest reason this plan cannot yet promise a specific detection-to-
  response time.
- User reports (e.g. "I got a password-changed email I didn't request" --
  now possible to detect thanks to the 2026-08-03 password-reset
  notification fix) are, realistically, the most likely detection path
  today.

**Action required before this plan is fully credible:** build the
structured logging / monitoring already tracked in
`AI_PROJECT_OS/16_TECH_DEBT.md`, and set up at least basic alerting on
`audit_logs` anomalies and repeated 429s.

## 5. Response steps

1. **Triage.** Incident commander confirms this is a real incident (not a
   false alarm), classifies severity, and starts a timestamped incident
   log (who did what, when -- can be as simple as a shared doc for now).
2. **Contain.** Stop ongoing harm first. Depending on the incident this may
   mean: rotating `SESSION_SECRET` (invalidates ALL sessions app-wide --
   understand the blast radius before doing this), removing a compromised
   email from `ADMIN_ALLOWED_EMAILS` and restarting the server, revoking a
   leaked API key (Stripe, PayPal, email provider, S3), or taking a
   specific compromised account through the existing account-deletion path
   if appropriate.
3. **Investigate.** Determine scope: which accounts/records were affected,
   what data was exposed, how the incident occurred. Query `audit_logs` for
   the relevant time window and actor.
4. **Eradicate.** Fix the root cause (patch the vulnerability, rotate the
   credential, close the gap) -- not just the symptom.
5. **Recover.** Restore normal operation; verify the fix holds (re-test the
   specific attack path that was exploited, where practical).
6. **Notify.** See section 6.
7. **Post-incident review.** Within a set window after closure (recommend
   5 business days), document what happened, what worked, what did not,
   and update this plan and the relevant technical controls accordingly.
   Feed real findings back into
   `AI_PROJECT_OS/53_SOC2_ISO27001_AUDIT.md`.

## 6. Notification

_This section requires counsel input before it is real._ At minimum,
determine and document:

- Which regulations apply to this product's actual user base (GDPR, CCPA,
  state breach-notification laws) -- not yet formally assessed.
- Notification timelines those regulations require (e.g. GDPR's 72-hour
  supervisory-authority notification for a confirmed breach).
- Who is notified internally, and in what order, before any external
  notification goes out.
- Subprocessor incidents: see `subprocessors.md` -- if a subprocessor
  (Stripe, PayPal, the email provider, S3-compatible storage) has its own
  breach affecting Divini Partners data, this plan's notification
  obligations may be triggered by their notice to us, not just by an
  incident we detect ourselves.

## 7. Related documents

- `information-security-policy.md`
- `access-control-policy.md`
- `subprocessors.md`
- `AI_PROJECT_OS/53_SOC2_ISO27001_AUDIT.md`
