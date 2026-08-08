# Operator Actions

Actions requiring credentials, vendor consoles, legal review, business
decisions, or production access — things this pack (or any AI agent working
in this repository) cannot complete unilaterally. Bootstrapped at Section
01 from what discovery surfaced; most of these were already tracked
individually in `AI_PROJECT_OS/` before this pack existed.

| Action | Why it's an operator action | Tracked elsewhere | Priority |
|---|---|---|---|
| Install the automated-backup cron job on the production server | Requires SSH/production server access | `AI_PROJECT_OS/23_DEPLOYMENT.md` §"Automated database backups" | P1 |
| Point `ERROR_MONITORING_WEBHOOK_URL` at a real destination | Requires choosing/configuring a real alerting destination | `AI_PROJECT_OS/51_SECURITY.md` §"Operator actions required before production" | P1 |
| Counsel review of Terms + 5 policies, including the v1/v2 Stripe Connect money-flow framing | Legal judgment, not a code question | `AI_PROJECT_OS/12_TASK_QUEUE.md` T8 | P0 (blocks real money) |
| Counsel/tax review of money-transmission exposure, marketplace-facilitator sales tax, and 1099 reporting duties | Legal/tax judgment | `AI_PROJECT_OS/12_TASK_QUEUE.md` T7; `docs/platform-standard/applicability-register.md` §D | P0 (blocks real money) |
| Set `STRIPE_SECRET_KEY` (and PayPal keys) to real, live values | Business decision gated on the above legal review | `AI_PROJECT_OS/12_TASK_QUEUE.md` T7 | P0 (deliberately deferred) |
| Determine current CCPA/CPRA and other state-privacy-law applicability (user volume/revenue thresholds) | Requires real business metrics only the owner has | `docs/platform-standard/applicability-register.md` §D | P1 |
| Confirm exact Stripe Checkout integration mode (hosted redirect vs. embedded) to finalize PCI SAQ level | Requires a decision about final checkout UX, then processor/QSA confirmation | `docs/platform-standard/applicability-register.md` §D (PCI DSS row) | P1 |
| Commission an independent third-party penetration test | Requires budget/vendor selection | `docs/platform-standard/risk-register.md` R-04 | P1, before real money or first enterprise deal |
| Decide SOC 2 / ISO 27001 formal-certification timing and budget, name an ISMS owner | Business decision | `AI_PROJECT_OS/52_COMPLIANCE.md` | P2 |
| Review and approve (or redline) the DRAFT policies in `compliance/policies/` | Requires a named, accountable owner signing off | `compliance/policies/README.md` | P1 |
| Add an age-affirmation step at registration | Small product decision + build, listed here because it needs an explicit "yes, do this" from the owner before a Section 02+ pass implements it | `docs/platform-standard/risk-register.md` R-01 | P2 |
| Confirm branch protection on the default branch (require PR review + passing CI before merge) | GitHub repo-settings UI, admin-only, not visible or settable from repo contents | `docs/platform-standard/section-03-repo-supply-chain.md` | P2 |
| Push the `v0.1.0` tag (`git push origin v0.1.0`) | Created locally this session; the push was rejected with a 403 — this session's push access covers branch refs, not tag refs | `docs/platform-standard/section-03-repo-supply-chain.md` | P2 |
| Verify `npm audit fix --force` against a real iOS/Android build before applying it to `package.json` | Needs Xcode/Android Studio, unavailable in this environment | `AI_PROJECT_OS/12_TASK_QUEUE.md` T19 | P2 |
