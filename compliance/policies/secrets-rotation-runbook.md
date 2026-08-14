# Secrets Rotation Runbook (DRAFT)

Written 2026-08-08 (ALFY2 pack Section 03, T22). Same status as every other
document in this folder: **DRAFT**, not yet owned, approved, or exercised.
See `README.md` for what that means before relying on this.

This is not a claim that secrets are currently mishandled — a live scan of
the full git history (`docs/platform-standard/section-03-repo-supply-chain.md`)
confirmed no secret has ever been committed. This document exists because
"secrets are handled correctly today" and "there is a written procedure for
what to do when one needs to change" are two different controls, and only
the first one existed before this.

## Secrets inventory

Full list of env vars and their purpose lives in
`docs/platform-standard/architecture-map.md` §A and
`AI_PROJECT_OS/24_ENVIRONMENTS.md`. The ones that matter for rotation
(secrets whose exposure would be consequential, as opposed to plain
configuration like `PORT` or feature flags):

| Secret | Where it's used | Rotation impact if changed |
|---|---|---|
| `SESSION_SECRET` | Signs session JWTs (`server/src/lib/session.ts`) | Rotating it invalidates **every** currently-issued session — every user is signed out. Plan for a maintenance-adjacent moment, not silently mid-day. |
| `DOWNLOAD_URL_SECRET` | Signs short-lived document-download URLs | Rotating it invalidates any currently-outstanding signed download link. Low impact — links are short-lived by design. |
| `DATABASE_URL` | Postgres connection string (contains the DB password) | Coordinate with the DB user's own password change; the app needs the new value before the old one is revoked, or it loses its connection. |
| `PAYOUT_ENC_KEY` | Encrypts stored payout-account details | Rotating this requires re-encrypting existing stored values with the new key first — a naive rotation would make existing encrypted data unreadable. Needs a migration, not a drop-in env-var swap. |
| `STORAGE_ENCRYPTION_KEY` | AES-256-GCM key for encrypted object storage (uploads, backups) | Same caution as `PAYOUT_ENC_KEY`: existing encrypted objects become unrecoverable if the key changes without re-encrypting them first. **Back this key up separately before ever touching it.** |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe API auth / webhook signature verification | Currently unset in production (T7, deliberate). Once set: rotate via the Stripe Dashboard (roll key), update the env var, restart with `--update-env`. Webhook secret rotation requires updating the registered webhook endpoint's signing secret in the Stripe Dashboard to match. |
| `PAYPAL_CLIENT_SECRET` | PayPal API auth | Rotate via PayPal Developer Dashboard, then update env var. |
| `EMAIL_API_KEY` | Resend API auth | Rotate via Resend dashboard; without a valid key, register→verify→login breaks (email sends are skipped, which blocks verification-gated login — see `24_ENVIRONMENTS.md`). |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Object storage auth (if `STORAGE_PROVIDER=s3`) | Rotate via the storage provider's console; update both together (a mismatched pair fails auth entirely, not partially). |
| `ADMIN_ALLOWED_EMAILS` | Not a secret, but security-sensitive — controls who has admin authority | Not "rotated" in the usual sense, but review periodically: anyone whose email is on this list has full admin authority the moment they log in with a matching email. |
| `LLM_API_KEY` | Only relevant if `LLM_PROVIDER` is set to an external, non-local provider | Rotate via that provider's console. |
| `AV_CLAMDSCAN_PATH` and similar local-binary paths | Not secrets, listed for completeness — no rotation applicable |

## When to rotate

- **Suspected leak** (accidental commit — even though the history is clean
  today, a future mistake is exactly what this section exists for; a
  screenshot with an env var visible; a departing contractor who had server
  access): rotate immediately, don't wait for a scheduled window.
- **Employee/contractor offboarding**: rotate anything they had access to —
  at minimum, `DATABASE_URL`'s password and any API keys they could have
  copied from `.env.local` during their access window.
- **Routine cadence**: no cadence is currently defined. Recommend annual at
  minimum for API keys (Stripe, PayPal, Resend, S3), and treat
  `SESSION_SECRET`/`PAYOUT_ENC_KEY`/`STORAGE_ENCRYPTION_KEY` as rotate-only-
  when-necessary given their higher blast radius (see the table above).

## How to rotate (general procedure)

1. Generate the new secret value at its source (the relevant vendor
   dashboard, or `openssl rand -base64 32` for locally-generated secrets
   like `SESSION_SECRET`/`STORAGE_ENCRYPTION_KEY`).
2. For encryption keys specifically (`PAYOUT_ENC_KEY`, `STORAGE_ENCRYPTION_KEY`):
   do NOT simply swap the env var. Existing encrypted data needs to be
   decrypted with the OLD key and re-encrypted with the NEW key first, or
   it becomes permanently unreadable. This needs a dedicated migration
   script, not a same-day rotation — treat it as a project, not a step.
3. For everything else: update `.env.local` on the server (never commit
   it — `.gitignore` already excludes it, verified in Section 03).
4. Restart with env reload: `pm2 restart divini-partners --update-env`
   (per `AI_PROJECT_OS/23_DEPLOYMENT.md`) — a plain `pm2 restart` does NOT
   pick up `.env.local` changes.
5. Smoke test: `curl localhost:PORT/api/healthz` → 200, then exercise the
   specific flow the rotated secret affects (login, if `SESSION_SECRET`
   changed; a test upload/download, if storage keys changed; a test
   checkout, if Stripe keys changed).
6. Revoke the OLD value at its source once the new one is confirmed
   working — don't leave both valid indefinitely.
7. Record the rotation (date, secret, reason) somewhere durable — this
   runbook doesn't yet specify where; the owner should pick a place
   (ticket system, a private log, whatever exists) once this is adopted.

## Before this is a real policy

Same checklist as every other document in this folder: assign a named
owner, confirm the procedure above actually works with a real (non-
`SESSION_SECRET`) rotation exercise at least once, and set a review date.
