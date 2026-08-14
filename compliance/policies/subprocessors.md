# Subprocessors (DRAFT)

**Status:** DRAFT -- lists what the CODE integrates with, based on
`config.ts` and `.env.local.example`. This is NOT a substitute for a real
vendor/subprocessor review: confirm each entry against an actual signed
agreement (and a Data Processing Agreement where personal data is
involved) before publishing this list externally or relying on it for
SOC 2 CC9.2 / ISO 27001 A.5.19-A.5.23.
**Version:** 0.1 (draft) **Effective date:** _not yet effective_
**Owner:** _unassigned -- fill in before approval_
**Review cadence:** _recommend reviewing whenever a new integration is added, and at least annually_

## How to read this list

Several entries are OPTIONAL integrations, gated behind environment
variables that are unset by default (`.env.local.example`). "Active" below
means the code path exists and would run real traffic to that vendor IF the
operator has configured it -- not that it is necessarily configured in any
given deployment. Confirm actual configuration in the live environment
before treating an entry as "in use."

| Subprocessor | Purpose | Data shared | Status | Config |
|---|---|---|---|---|
| Stripe | Payment processing, Stripe Connect payouts | Payment details, transaction amounts, connected-account info for vendors | Optional (unset by default -- real money deferred, see `AI_PROJECT_OS/12_TASK_QUEUE.md` T7) | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` |
| PayPal | Alternative payment processing | Payment details, transaction amounts | Optional (unset by default) | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` |
| Resend | Transactional email (verification, password reset, notifications) | Recipient email address, message content (names, links, business context in notification bodies) | Optional, default provider when configured (`EMAIL_PROVIDER=resend`) | `EMAIL_API_KEY`, `EMAIL_FROM` |
| Postal (self-hosted) | Alternative transactional-email backend | Same as Resend above | Optional alternative to Resend | `EMAIL_PROVIDER=postal` + Postal-specific vars |
| S3-compatible object storage (AWS S3 / Cloudflare R2 / Backblaze B2 / MinIO -- operator's choice) | Stores uploaded documents (rate sheets, floor plans, contracts, images) | File contents, which may include business-sensitive or, rarely, personal documents a user chooses to upload | Optional (`STORAGE_PROVIDER=s3`); local disk is the default, which has no subprocessor at all | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` |
| DigitalOcean | Application hosting (droplet), the actual compute + Postgres database run here | All application data, by virtue of being the host | Active in the documented deployment (`AI_PROJECT_OS/23_DEPLOYMENT.md`) | infra-level, not an env var |
| Ollama (self-hosted) | Local-first LLM for the "Divini Concierge"/"Divini Builder" AI-assist features (profile extraction, quote assist) | Text the user submits for AI assistance (e.g. pasted website content, uploaded document text) -- stays on the operator's own infrastructure since Ollama is self-hosted, not a third-party API call | Active by default (`LLM_PROVIDER=ollama`) | `OLLAMA_URL`, `LLM_MODEL` |
| OpenAI-compatible endpoint (optional alternative to Ollama) | Same AI-assist purpose as above, IF an operator points this at a real third-party API instead of a self-hosted one | Same text as above, but now sent to a real third party -- this materially changes the subprocessor picture from "none" (self-hosted) to "yes" | Optional, off by default (`LLM_PROVIDER=openai-compat`) | provider-specific vars |
| DB-IP | Free, self-hosted (downloaded periodically, not queried live) IP-to-country/city geolocation database | None sent to DB-IP at runtime -- the database is downloaded once via `scripts/fetch-geoip.sh` and read locally (`server/src/lib/geoip.ts`) | Data-source, not a live subprocessor | n/a (attribution required: "IP Geolocation by DB-IP") |

## Notes for whoever finalizes this

1. Every row marked "Optional" needs a real yes/no answer for THIS
   deployment before this document can be published or relied on for an
   audit -- check the actual production `.env.local` / hosting console.
2. If real Stripe/PayPal keys are ever set, add their DPAs (Data Processing
   Agreements) as attachments/references here, and update
   `information-security-policy.md` section 4 to reflect that real payment
   data now flows through the system.
3. The OpenAI-compatible LLM path, if ever enabled, is the one row most
   likely to change this document's privacy posture materially (sending
   user-submitted text to a real third party rather than keeping it on
   self-hosted infrastructure) -- flag it for extra scrutiny if it is ever
   turned on.
4. This list does not include sub-subprocessors (e.g. AWS underlying
   Resend, or whichever cloud DigitalOcean itself might use) -- add them if
   a real audit requires that depth.

## Related documents

- `information-security-policy.md`
- `AI_PROJECT_OS/22_APIS_AND_INTEGRATIONS.md`
- `AI_PROJECT_OS/24_ENVIRONMENTS.md`
- `.env.local.example`
