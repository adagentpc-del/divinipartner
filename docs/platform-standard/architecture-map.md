# Architecture Map

Section 01 (Discovery, Architecture & Applicability Gate) of the ALFY2/Claude
Master Platform Execution Pack. Produced 2026-08-08.

**This is a pointer document, not a duplicate.** Divini Partners already
maintains a living architecture/ops doc set under `AI_PROJECT_OS/` that
predates this pack and is kept current as the code changes (see
`AI_PROJECT_OS/README.md`). Per the pack's own Rule 2 ("do not rebuild
working systems... audit and improve that system rather than introducing a
parallel implementation"), this file cites and summarizes that existing
source of truth rather than re-deriving it. Where this file and
`AI_PROJECT_OS/` ever disagree, `AI_PROJECT_OS/` is authoritative — update
this file, not the other way around.

## A. Repository and infrastructure inventory

| Component | Detail | Evidence |
|---|---|---|
| Frontend | Vite + React 18 SPA, TypeScript, React Router 7 | `package.json`; `AI_PROJECT_OS/01_PROJECT_OVERVIEW.md` |
| Backend | Express (TypeScript, ESM), raw SQL via `pg` (no ORM) | `server/package.json`; `AI_PROJECT_OS/01_PROJECT_OVERVIEW.md` |
| Database | PostgreSQL 16, Docker container in production | `AI_PROJECT_OS/23_DEPLOYMENT.md` |
| API style | REST-ish, ~116 route modules under `/api`, one Express app | `server/src/routes.ts`; `AI_PROJECT_OS/20_CODEBASE_MAP.md` |
| Native mobile | Capacitor managed-webview shell wrapping the hosted web app, iOS + Android configured | `capacitor.config.ts`; `@capacitor/*` deps in `package.json`; `AI_PROJECT_OS/52_COMPLIANCE.md` (iOS section) |
| Auth provider | Native email/password, scrypt hashing, jose HS256 session JWT (httpOnly cookie + bearer). No OAuth/social login currently wired (`server/src/auth.ts` — confirmed no `passport`/OAuth-provider code). Legacy Authentik OIDC env vars remain in `.env.local.example` but are unused (`server/src/auth.ts` is fully native) | `AI_PROJECT_OS/24_ENVIRONMENTS.md` ("Legacy / historical env"); `AI_PROJECT_OS/51_SECURITY.md` |
| Object/file storage | Local disk by default (`FILE_STORAGE_DIR`); optional S3-compatible (`S3_*` env vars) with optional AES-256-GCM envelope encryption at rest (`STORAGE_ENCRYPTION_KEY`) | `server/src/lib/{objectStorage,storageCrypto}.ts`; `AI_PROJECT_OS/51_SECURITY.md` |
| AI/model provider | Local-first Ollama by default, configurable via `LLM_PROVIDER`/`LLM_MODEL`/`LLM_BASE_URL`/`LLM_API_KEY` (`server/src/lib/llm.ts`). Used for text extraction, business discovery, and a handful of AI-assist features branded "Divini Concierge"/"Divini Builder." No RAG/vector store. No autonomous multi-step agent/tool-use loop — all AI calls are single-shot, best-effort, with deterministic fallback | `AI_PROJECT_OS/51_SECURITY.md` ("Prompt-injection defense"); `AI_PROJECT_OS/41_AI_WORKFLOWS.md` |
| Payment processor(s) | Stripe (Checkout + two Connect account shapes: v1 Express/destination-charge, v2 Accounts/direct-charge) and PayPal, both key-gated and currently unconfigured in production (`STRIPE_SECRET_KEY`/PayPal keys unset — deliberate, see T7). No money moves today | `AI_PROJECT_OS/22_APIS_AND_INTEGRATIONS.md`; `AI_PROJECT_OS/12_TASK_QUEUE.md` T7 |
| Email | Resend (`EMAIL_PROVIDER=resend`), required for register→verify→login | `AI_PROJECT_OS/24_ENVIRONMENTS.md` |
| SMS | Not implemented. `sms_package` appears only as a plan-catalog pricing-tier *label* (`server/src/lib/planCatalog.ts`) — no SMS-sending code, no Twilio/provider integration exists | grep of `server/src` for SMS/Twilio providers, 2026-08-08 |
| Push notifications | Not implemented. No Firebase/APNs/FCM code found despite the Capacitor mobile shell existing | grep of `server/src`, 2026-08-08 |
| Hosting/deployment | Single DigitalOcean droplet. Caddy reverse proxy terminates HTTPS; pm2 runs the Node process; deploy is a manual `rsync` + `deploy.sh` loop (no automated CD pipeline) | `AI_PROJECT_OS/23_DEPLOYMENT.md` |
| DNS/domain | divinipartners.com (live production domain) | `AI_PROJECT_OS/23_DEPLOYMENT.md` |
| Analytics/session-recording | Not implemented. No Segment/Amplitude/PostHog/FullStory/Hotjar/Mixpanel/GA code found | grep of `src`, 2026-08-08 |
| Error monitoring/logging/APM | Structured JSON logging to stdout/stderr (`server/src/lib/logger.ts`), wired into the central error handler and process-crash handlers. Optional generic-webhook real-time alerting (`ERROR_MONITORING_WEBHOOK_URL`) — not yet pointed at a real destination (operator action outstanding) | `AI_PROJECT_OS/51_SECURITY.md` |
| Background jobs/cron | `server/src/scripts/backup-db.ts` (built, not yet cron-installed — operator action outstanding); no other queue/worker system found beyond the one-off scripts under `server/src/scripts/` | `AI_PROJECT_OS/23_DEPLOYMENT.md` |
| Video/calendar integrations | Calendar: one-way `.ics` feed export only (Apple/Google Calendar *subscribe* and pull from Divini on their own schedule; nothing syncs back) — `server/src/routes/calendar.ts`. No two-way OAuth calendar integration, no video-conferencing integration (no Zoom/Daily/Twilio Video) | grep of `server/src`, 2026-08-08 |
| Third-party SDKs | Stripe, PayPal, Resend (email), Ollama (or configured LLM endpoint), MaxMind (`maxmind` npm package, GeoIP), optional S3-compatible storage client | `server/package.json` |
| Environments | local/dev (permissive CORS, dev secret fallbacks) and production (Caddy+pm2+Docker droplet; fail-closed secrets, CORS deny-by-default). No separate staging environment currently exists | `AI_PROJECT_OS/24_ENVIRONMENTS.md` |
| CI/CD | GitHub Actions (`.github/workflows/ci.yml`): installs deps, typechecks server + SPA, runs the test suite, on every push and PR. No lint step, no dependency/security scan step, no build-artifact step, no automated deploy (deploy is the manual droplet loop above). GitHub branch-protection settings (required-status-checks, review requirements) are a GitHub-UI setting outside this repo's visibility — **UNKNOWN, operator to confirm** | `.github/workflows/ci.yml` |

### Concise data-flow summary

One Node process serves both the built SPA (`server/dist/public`, copied
from Vite's `dist/`) and the `/api` router. All client-facing money,
authorization, and entitlement decisions are resolved server-side against
Postgres (see `docs/platform-standard/authorization-matrix.md`, produced in
Section 05). The native iOS/Android apps are a managed webview around the
same hosted web app — there is no separate native codebase making its own
API decisions.

## B. Product / use-case actor inventory

Divini Partners is an event-partnership marketplace connecting the parties
that make an event happen (`AI_PROJECT_OS/01_PROJECT_OVERVIEW.md`). Actors,
mapped to the pack's checklist:

| Actor | In this product? | Data accessed | Actions allowed | Money movement | Communication | Public/private exposure |
|---|---|---|---|---|---|---|
| Anonymous visitor | Yes | Public marketing pages, public marketplace/discovery listings | Browse, search, start registration | None | None | Public pages only |
| Authenticated user | Yes | Own account, own org's data per role | Role-scoped CRUD (see `authorization-matrix.md`) | Per role, below | Email (transactional) | Authenticated app only |
| Customer/buyer | Yes — roles `client`, `sponsor`, `exhibitor`, `donor`, `volunteer` (buyer-side), `nonprofit` (as a donation/ticket buyer's counterparty is the nonprofit, but a nonprofit is itself a seller for tickets/tables/auctions — see next row) | Own orgs's quotes/invoices/bookings | Pay invoices, book tickets/tables/exhibitor booths, sponsor | Pays via Stripe/PayPal Checkout; no Connect account needed | Booking/payment confirmation emails | Own transactions only |
| Seller/provider/vendor | Yes — roles `vendor`, `supplier`, `venue`, `planner`, `installer`, `nonprofit` (sells tickets/tables/auction items/sponsorship packages) | Own org's leads, quotes, invoices, payouts | List services/inventory, bid/quote, receive payment | Receives via Stripe Connect (v1 or v2) or PayPal payout; platform skims an application fee | Lead/quote/payment notification emails | Public profile (opt-in fields) + private dashboard |
| Administrator/support/moderator | Yes — `ADMIN_ALLOWED_EMAILS` allowlist, MFA-enforced | Cross-org visibility for support/moderation, payout release, coupon controls | Admin overrides, payout release, feature flags | Can release held/manual payouts | N/A | Internal only |
| Organization/team/sub-account | Yes — `organizations` + `organization_memberships`, multi-org switcher | Org-scoped data per member's role within that org | Same as the org's role | Same as the org's role | Same as the org's role | Org-scoped |
| Parent/guardian/minor | **No.** No product surface collects age, guardian relationship, or targets minors. Registration requires no age gate today, which is itself a Section 01 finding — see `applicability-register.md`'s COPPA/state-minor-law row | N/A | N/A | N/A | N/A | N/A |
| Healthcare provider/patient | **No.** No health, medical, or wellness feature exists anywhere in the product | N/A | N/A | N/A | N/A | N/A |
| Student/school | **No.** No education-records feature; the platform is not acting for or on behalf of a covered educational institution | N/A | N/A | N/A | N/A | N/A |
| Investor/issuer/adviser/broker | **No.** No securities, investment, or funds-transmission-beyond-marketplace feature | N/A | N/A | N/A | N/A | N/A |
| Employer/applicant/tenant/background-check subject | **No.** No employment screening, tenant screening, or consumer-report feature | N/A | N/A | N/A | N/A | N/A |

## C. Data classification inventory

| Data class | Present? | Source | Purpose | Storage | Access roles | Third parties | Retention | Deletion behavior | Encryption | Sensitivity |
|---|---|---|---|---|---|---|---|---|---|---|
| Auth credentials/tokens | Yes | User registration | Login | Postgres (`users` — scrypt hash, never plaintext), signed JWT cookie/bearer | Server only (hash never returned to client) | None | Until account deletion | Anonymized on account deletion (`51_SECURITY.md`) | Hash at rest (scrypt); JWT signed, not encrypted (no sensitive payload beyond user id/email) | High |
| Contact information | Yes | Registration, profile | Communication, invoicing | Postgres | Org members, counterparties on a transaction, admin | Resend (email delivery) | Until deletion/anonymization | Anonymized on account deletion | Not separately encrypted (standard DB access controls) | Medium |
| Profile information | Yes | Profile setup | Marketplace discovery/matching | Postgres | Public (opt-in published fields), org, admin | None | Until deletion | Anonymized/removed on deletion | Standard DB | Low–Medium |
| Precise/approximate location | Partial | Address fields (venue/event location), IP-derived geo (`GEOIP_*`) for fraud/rate-limit signals | Marketplace matching, fraud signal | Postgres (address); not persisted for IP-geo beyond request-scope use | Server, relevant counterparties | MaxMind (GeoIP lookup only) | Address: until deletion. IP-geo: not persisted | N/A for IP-geo (ephemeral) | Standard DB | Low (address is business-context, not a person's home) |
| IP/device/network signals | Yes | Request metadata | Rate limiting, bot/fraud defense, security events | Not persisted to a dedicated table today (used in-request) | Server only | None | Ephemeral | N/A | N/A | Low, used only as a risk signal per `52_COMPLIANCE.md`/pack Rule guidance |
| Government identifiers | **No.** No SSN/government-ID field exists in the schema | — | — | — | — | — | — | — | — | — |
| Financial/payment data | Yes, but minimized | Stripe/PayPal Checkout | Payment processing | Stripe/PayPal hold card data (tokenized); Divini stores only processor references (`payments` table: reference IDs, amounts, no PAN/CVC) | Server, admin (references/amounts only) | Stripe, PayPal | Transaction records retained (financial/audit requirement) | Not deleted (financial-record retention exception, see `applicability-register.md` retention notes) | Processor-side encryption; Divini never receives raw card data | High (financial), but PCI scope is minimized by design — see `applicability-register.md` PCI row |
| Tax information | **No dedicated field yet.** No W-9/1099 collection flow exists in code today | — | — | — | — | — | — | — | — | Flagged as a gap for Section 09/17 |
| Health/medical/wellness information | **No.** Not collected anywhere | — | — | — | — | — | — | — | — | — |
| PHI/ePHI possibility | **No.** No healthcare-provider relationship exists (see actor table) | — | — | — | — | — | — | — | — | — |
| Student/education records | **No.** | — | — | — | — | — | — | — | — | — |
| Background-check/consumer-report data | **No.** | — | — | — | — | — | — | — | — | — |
| Biometric identifiers/templates | **No.** | — | — | — | — | — | — | — | — | — |
| Minors' data | **No** (not knowingly; no age gate exists — see COPPA row in `applicability-register.md`) | — | — | — | — | — | — | — | — | — |
| Private messages | Partial — some role-to-role messaging/notes exist within marketplace workflows (e.g. quote/bid notes) | User input | Marketplace coordination | Postgres | Parties to the transaction, admin | None | Until deletion | Anonymized/removed on deletion | Standard DB | Medium |
| Uploaded documents/images/video/audio | Yes | Vendor documents (COI/W-9-style compliance docs), profile images, deck/program uploads | Compliance verification, marketplace listing | Local disk or S3 (optional encryption at rest) | Owning org, admin (compliance review) | Optional S3 provider | Until deletion/replacement | Deletable via profile/document management routes | Optional AES-256-GCM (`STORAGE_ENCRYPTION_KEY`) | Medium |
| AI prompts/outputs/embeddings | Yes, minimal | Text extraction / discovery features | Auto-fill profile/business data | Not persisted long-term as raw prompt logs (best-effort, no dedicated `ai_run_audit`-equivalent table found — a Section 08 gap) | Server only | Configured LLM provider (Ollama local by default; external only if operator configures `LLM_PROVIDER`) | N/A (not systematically retained) | N/A | N/A | Low–Medium depending on source text |
| Analytics/behavior data | **No dedicated system.** No analytics/session-recording SDK found (see architecture table) | — | — | — | — | — | — | — | — | — |
| Support tickets | Partial — no dedicated support-ticket table found; support is presumably handled outside the app (email/manual) | — | — | — | — | — | — | — | — | Flagged as a gap/unknown for Section 14 |
| Audit/security logs | Yes | `audit_logs` table (`db/apply-all.sql`: actor_id, action, object_type/id, previous_value/new_value jsonb, ip_address) plus `connect_payout_audit`, plus structured JSON logging to stdout/stderr (`lib/logger.ts`) for runtime errors/security events | Security monitoring, incident response, change history | Postgres (`audit_logs`) + stdout/stderr (runtime logs) | Server/admin | Optional generic webhook (`ERROR_MONITORING_WEBHOOK_URL`, not yet configured) | `audit_logs` retention not yet centrally defined — Section 02/06 gap; runtime logs are provider-dependent | N/A | Standard DB / N/A for stdout | Medium |

## Notes for later sections

- This map should be re-read (not re-derived) before starting Sections 02–18, per the pack's own "Cross-section continuity" rule.
- Several rows above are marked as open questions for later sections rather than settled facts (support tickets, audit-log persistence, AI run audit trail, tax/1099 collection). These carry forward as findings in `applicability-register.md` and, once P0/P1-prioritized, `docs/platform-standard/control-register.md` in the relevant later section.
