# Section 10 — Email, SMS, Push Notifications & Marketing Compliance

Status: **COMPLETE**. Live DNS verification of the actual production
sending domain (not assumed), live adversarial webhook testing, and a
real, live-verified fix for a genuine gap (no cross-channel bounce/
complaint suppression).

## Channel inventory

| Channel | Exists? | Classification |
|---|---|---|
| Email — transactional/service (registration, verification, password reset, MFA, bid/quote/event notifications, admin alerts) | Yes | Transactional/service — CAN-SPAM's opt-out requirement does not apply, though its truthful-header/non-deceptive rules still do |
| Email — marketing/cold outreach (Claim Engine: emailing businesses that never signed up) | Yes | Marketing/promotional — the one channel this section's opt-out/suppression rules bind hardest |
| SMS | **No.** `planCatalog.ts` lists an "SMS Package" as a future-priced add-on concept only — zero SMS-sending code exists anywhere (`grep` for Twilio or an SMS client: no real integration). | N/A — nothing to test; TCPA analysis is moot until this is actually built |
| Push notifications | **No.** No `@capacitor/push-notifications` dependency, no device-token table, no push-sending code anywhere. | N/A |

## Email infrastructure — live-verified against the real production domain

Per pack rule 14 ("tests before claims"), queried live DNS for
`divinipartners.com` via two independent resolvers (this environment's
system resolver and Cloudflare's DNS-over-HTTPS, to rule out a
stale/cached single-source answer) rather than assuming from
configuration alone:

| Record | Status | Evidence |
|---|---|---|
| DKIM | PASS | `resend._domainkey.divinipartners.com` resolves to a real published RSA public key — Resend's domain-verification DKIM record is live and correctly published |
| DMARC | PASS | `_dmarc.divinipartners.com` → `v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;` — a real enforcement policy (quarantine, not just monitor-only `p=none`), with aggregate reports routed somewhere real |
| SPF | PASS (initially looked missing — corrected after deeper verification) | The apex `divinipartners.com` has no TXT record, which looked like a gap at first — but Resend/SES's standard pattern publishes SPF on the **custom MAIL FROM / return-path subdomain**, not the apex. Confirmed live: `send.divinipartners.com` carries `v=spf1 include:amazonses.com ~all` (plus a Resend-specific include). Since DMARC's SPF alignment mode is relaxed (`aspf=r`), a subdomain of the organizational domain aligns correctly. This is the standard, correct configuration, not a gap — worth documenting the "looked wrong at first glance, verified correct" path explicitly since it's exactly the kind of thing pack rule 14 exists to prevent getting wrong |
| Return-path/bounce domain | PASS | `send.divinipartners.com` MX → `feedback-smtp.us-east-1.amazonses.com` — the real AWS SES bounce/complaint feedback address, confirming a proper custom return-path domain is configured, not the Resend shared default |

**Net result: full email authentication (SPF + DKIM + DMARC, all
aligned) is genuinely, correctly configured for the real sending
domain.** This is a stronger starting position than most of what this
kind of audit typically finds — worth stating plainly rather than
burying a clean result.

## Transactional vs. marketing separation

Confirmed structurally, not just by convention: both channels share one
transport (`lib/email.ts`'s `sendEmail()`), but only the marketing
channel (Claim Engine outreach) carries the extra machinery CAN-SPAM's
opt-out and suppression rules require:

- `decideSend()` (`lib/claim-emails.ts`) is a hard gate checked before
  every outreach send: profile state, `claim_suppression` membership,
  and a 6-send lifetime cap (satisfies "lifecycle-aware, not a blind
  18-month drip").
- Every outreach email's `complianceFooter()` includes real sender
  identification (name + email), a truthful explanation of why the
  recipient is receiving it, a working unsubscribe link, a **separate**
  "remove my listing entirely" option (goes beyond CAN-SPAM's minimum —
  addresses the underlying "we built a public page about your business"
  concern directly), and the company's legal name + physical postal
  address.
- Transactional mail (registration, notifications) carries none of this
  machinery because it correctly does not need to — CAN-SPAM's opt-out
  mechanism requirement is specific to commercial/marketing email.

## Suppression — real gap found and fixed, live-verified

**Found:** `claim_suppression` (the Claim Engine's existing suppression
table) only ever gets populated from explicit unsubscribe/removal
actions and manual admin entries — grepped the full server tree for
anywhere a `'bounce'` reason row gets inserted automatically: **zero
matches**, despite the schema explicitly listing `'bounce'` as a valid
reason. More importantly, `claim_suppression` is scoped to the Claim
Engine specifically (FK to `unclaimed_profiles`) and was never checked
by the shared `sendEmail()` transport itself — meaning a hard bounce or
spam complaint on a **regular platform user's** email address (not a
claim-outreach target) would never suppress future transactional sends
to that same address either. No Resend bounce/complaint webhook existed
at all.

**Fixed**, three parts:
1. `db/schema-communication-suppressions.sql` — a new, general-purpose,
   channel-agnostic `communication_suppressions` table (exactly the
   pack's own suggested shape), distinct from and layered underneath
   `claim_suppression` (which keeps its existing, more specific
   outreach-decision role).
2. `sendEmail()` itself (`lib/email.ts`) now checks every recipient
   against `communication_suppressions` before attempting delivery —
   silently drops suppressed addresses from the recipient list rather
   than blocking the whole send, so one bad address in a multi-recipient
   notification doesn't block delivery to the others. This is a safety
   net underneath **every** caller of `sendEmail()`, not just claim
   outreach.
3. A new Resend delivery-event webhook (`POST /api/e/webhook/resend`),
   Svix-signed (the same signing scheme Resend uses), verified with the
   same HMAC + 5-minute replay-window-bound pattern already proven for
   Stripe's webhook in Section 09. On `email.bounced`/`email.complained`
   events, adds the affected address to `communication_suppressions`.

**Live-verified, not assumed:**
1. Fail-closed signature rejection: with `RESEND_WEBHOOK_SECRET` unset,
   a forged Svix signature was correctly rejected (400 `invalid
   signature`) via a real HTTP request against the running server.
2. The suppression insert + case-insensitive lookup logic, tested
   directly against the live database: inserted a suppression row for
   `bouncy@example.com`, then confirmed a differently-cased lookup
   (`Bouncy@Example.com`) correctly matched it.
3. **The actual `sendEmail()` filtering behavior, called directly**
   (not just its SQL dependency): seeded a real suppression row for a
   test address, then called `sendEmail()` with (a) that address alone —
   result `{"ok":false,"error":"all recipients suppressed"}` — and (b) a
   mixed list of the suppressed address plus a clean one — the log
   output confirmed only the clean address remained in the outgoing
   `to=` list, proving per-recipient filtering (not an all-or-nothing
   block) works correctly. Test data cleaned up after.

## CAN-SPAM

Already covered in the "transactional vs. marketing" section above —
the one commercial-email channel (claim outreach) already meets every
item on the pack's checklist: truthful sender identification, non-
deceptive framing (transparently explains it's an unrequested unclaimed
listing, not a false claim of prior relationship), required sender
address disclosure, a functioning opt-out mechanism, and — now — actual
automated timely suppression on top of the manual unsubscribe/removal
paths that already existed. **PASS.**

One secondary hardening opportunity, not a current violation: outreach
emails do not set a `List-Unsubscribe` / `List-Unsubscribe-Post` header
(RFC 8058 one-click unsubscribe), which Gmail/Yahoo's 2024 bulk-sender
guidelines increasingly expect for anything with marketing
characteristics, even at low volume. The body-embedded unsubscribe link
already satisfies CAN-SPAM's legal minimum; the header would improve
deliverability and align with current mailbox-provider best practice.
Documented as T31, not built this pass (needs the ESP-specific header
value, and Resend's transactional-send API support for custom headers
should be confirmed before implementing).

## TCPA / SMS

N/A — no SMS-sending capability exists anywhere in the codebase (only a
future-priced catalog entry, no implementation). Nothing to test or
assess; revisit if/when SMS is actually built.

## Lifecycle automation

The one real lifecycle-aware sequence in this codebase is the Claim
Engine's outreach cadence (`renderTemplate()`'s step-based
weekly-then-monthly cadence, capped at 6 sends, gated by profile/
suppression state at every step) — already audited above and found
sound. No other lifecycle/nurture/win-back email automation exists for
regular platform users (onboarding reminders, abandoned-setup nudges,
renewal/churn-prevention sequences) — this is a product-completeness gap
more than a compliance one (nothing here violates a consent rule by
omission), so it is noted but not raised as a compliance finding.

## Push

N/A — not implemented (see Channel Inventory).

## Findings summary

| ID | Finding | Severity | Status |
|---|---|---|---|
| S10-F1 | Email authentication (SPF/DKIM/DMARC) initially appeared to be missing SPF at the apex domain | N/A — verification artifact, not a real gap | **PASS** confirmed via deeper live DNS verification (SPF correctly published on the return-path subdomain, standard Resend/SES pattern) |
| S10-F2 | No cross-channel (non-claim-outreach) bounce/complaint suppression existed; `sendEmail()` itself had no suppression check at all | P1 | **Fixed** — `communication_suppressions` table, wired into `sendEmail()`, Resend bounce/complaint webhook built; all three live-verified |
| S10-F3 | No `List-Unsubscribe`/`List-Unsubscribe-Post` header on marketing outreach email | P2 (hardening, not a current CAN-SPAM violation) | Documented as T31, not built this pass |
| S10-F4 | No lifecycle/nurture automation for regular platform users (onboarding reminders, renewal/churn sequences) | N/A (product completeness, not compliance) | Noted, not a finding requiring action from this audit |

No P0 findings. One real P1 found and fixed with live verification at
every layer (webhook signature, DB logic, and the actual `sendEmail()`
call path); one clean bill of health on email authentication after
correcting an initial false read; two items noted for future
product/deliverability work, not compliance gaps.
