# Compliance policies (DRAFT)

Every document in this folder is a **DRAFT** written 2026-08-03 to support a
future SOC 2 and/or ISO/IEC 27001 effort. None of them are approved,
board/exec-signed, or in effect. Each one needs a named owner, a review by
counsel where noted, and a formal approval/sign-off before it is a real
policy an auditor can rely on.

What these drafts ARE: an honest starting point written directly from the
actual code and infrastructure this app runs today (cross-referenced against
`AI_PROJECT_OS/53_SOC2_ISO27001_AUDIT.md`, the control audit that preceded
these drafts), so the policy claims match reality rather than aspiration.

What these drafts ARE NOT: legal advice, a certification, or a substitute
for engaging a SOC 2 auditor / ISO 27001 certification body. See
`AI_PROJECT_OS/52_COMPLIANCE.md` for the product's overall compliance status
and `AI_PROJECT_OS/53_SOC2_ISO27001_AUDIT.md` for the technical-controls
audit these policies reference.

## Documents

- `information-security-policy.md` -- top-level ISMS policy (SOC 2 CC1-CC5; ISO 27001 clause 5, Annex A.5.1)
- `access-control-policy.md` -- who gets access to what, and how it is granted/revoked (SOC 2 CC6.1-CC6.3; ISO 27001 A.5.15-A.5.18)
- `data-retention-and-deletion-policy.md` -- how long data is kept, and how deletion works (SOC 2 Privacy criteria if in scope; ISO 27001 A.5.34; GDPR/CCPA-adjacent)
- `incident-response-plan.md` -- what happens when something goes wrong (SOC 2 CC7.4-CC7.5; ISO 27001 A.5.24-A.5.28)
- `subprocessors.md` -- every third party that touches user data, and why

## Before any of these are real

1. Assign a named owner for the ISMS (Information Security Management
   System) -- someone accountable for these policies existing, being
   followed, and being reviewed on a schedule.
2. Have counsel review `data-retention-and-deletion-policy.md` against
   applicable law (this product's Terms specify Florida governing law; GDPR/
   CCPA applicability depends on where users actually are).
3. Walk through `incident-response-plan.md` as a tabletop exercise at least
   once before relying on it -- an untested plan is not a control.
4. Confirm every entry in `subprocessors.md` against actual signed vendor
   agreements (DPAs where applicable) -- this draft lists what the CODE
   integrates with, not what has been legally reviewed.
5. Set review dates. A policy with no review cadence is not maintained.
