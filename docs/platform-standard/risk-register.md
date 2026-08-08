# Risk Register

Unresolved risks, severity, owner, mitigation, target state. Bootstrapped at
Section 01 from findings surfaced during discovery; will grow with each
later section.

| Risk ID | Description | Severity | Owner | Current Mitigation | Target State | Section |
|---|---|---|---|---|---|---|
| R-01 | No age-affirmation step at registration | Low | Owner | None today | Add an age-affirmation field/checkbox | 01 (COPPA hygiene row) |
| R-02 | `audit_logs` retention period not centrally defined | Low | Owner | Table exists and is actively written; no automatic purge/retention policy found | Define retention in the data-retention matrix (Section 02) and enforce it | 01 → 02/06 |
| R-03 | Money-transmission / marketplace-facilitator sales-tax / 1099 exposure not yet resolved by counsel | Medium (blocks T7, not a current live-money risk since Stripe is unconfigured) | Owner + counsel | `STRIPE_SECRET_KEY` intentionally unset — no real money moves today | Counsel review before T7 unblocks | 01 → 09/17 (already tracked as T7/T8 in `AI_PROJECT_OS/12_TASK_QUEUE.md`) |
| R-04 | No independent penetration test performed | Medium | Owner | Internal adversarial testing exists for several controls (CSRF, IDOR-style checks noted in `AI_PROJECT_OS/51_SECURITY.md`) but no third-party pen test | Commission an independent pen test before T7 (real money) or first enterprise deal | 01 → 15/18 |
| R-05 | No formal SOC 2 / ISO 27001 certification (technical controls only) | Low (market-driven, not legally required today) | Owner | Technical-controls audit complete and gaps closed (`AI_PROJECT_OS/53_SOC2_ISO27001_AUDIT.md`) | Formal engagement once there's a customer/contract driver | 01 → 18 |
| R-06 | No separate staging environment | Low–Medium | Owner | Local dev + production only; CI runs typecheck/tests before merge | Consider a staging environment before major schema/payment changes ship directly to production | 01 → 03 |
| R-07 | Backup cron job not yet installed on the production server; error-monitoring webhook not yet pointed at a real destination | Medium | Owner | Both mechanisms are built and tested (`AI_PROJECT_OS/23_DEPLOYMENT.md`, `51_SECURITY.md`); only the operator step remains | Install the cron job; set `ERROR_MONITORING_WEBHOOK_URL` | 01 → 06/14 (already tracked as operator actions in `51_SECURITY.md`) |
