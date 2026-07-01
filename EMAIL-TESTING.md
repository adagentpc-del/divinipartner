# Email Testing

A one-command harness that sends ONE sample of every platform email type to a
target address using the REAL email transport, so you can confirm receipt of
each on the deployed server.

## What you need for real delivery

Real sending happens only when the email provider is configured in the
environment:

- `EMAIL_PROVIDER` set to `resend` or `postal`
- `EMAIL_API_KEY` set to the provider API key
- `EMAIL_FROM` set to your verified sender (recommended)
- `POSTAL_API_URL` set as well when `EMAIL_PROVIDER=postal`

Without those, the harness still runs end to end: it LOGS each email and reports
`skipped`, and nothing is actually transmitted. That still proves the wiring is
correct. Set the env vars to make it send for real.

The harness does not need the database. Email sending is independent of
Postgres.

## How to run it

### 1. CLI (on the deployed server, after the server build)

```
node server/dist/test-emails.js adagentpc@gmail.com
```

If you omit the address it falls back to `TEST_EMAIL`, then to
`adagentpc@gmail.com`:

```
node server/dist/test-emails.js
TEST_EMAIL=you@example.com node server/dist/test-emails.js
```

It prints a clean table of every email type and the result
(`OK` / `SKIPPED` / `ERROR`), totals, and exits non-zero only on a hard error.
`SKIPPED` is expected and NOT a failure when the email provider is unset.

### 2. Admin endpoint (fire it from the app)

```
POST /api/admin/test-email
Authorization: Bearer <admin OIDC token>
Content-Type: application/json

{ "to": "adagentpc@gmail.com" }
```

If `to` is omitted, it sends to the signed-in admin's own verified email. It
returns JSON with `target`, `emailEnabled`, `totals`, and a `results` array
(one row per email type).

Example with curl:

```
curl -X POST https://divinipartners.com/api/admin/test-email \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to":"adagentpc@gmail.com"}'
```

## Email types covered and expected subjects

| Email type                  | Expected subject line                                |
| --------------------------- | ---------------------------------------------------- |
| Welcome / registration      | Welcome to Divini Partners, Test Venue               |
| Bid posted                  | New bid posted for Test Gala 2026                    |
| Bid invited                 | You were invited to bid on Test Gala 2026            |
| Quote submitted             | New quote for Test Gala 2026                         |
| Quote decision (accepted)   | Quote accepted                                       |
| Message posted              | New message on Test Gala 2026                        |
| Event status changed        | Test Gala 2026 is now confirmed                      |
| Invoice sent                | Invoice INV-1001 from Divini Partners                |
| Payment received            | Payment received: $2,500.00                          |
| Support received            | We received your support request (SUP-2026)          |
| Feature request received    | We received your feature request                     |
| Invite                      | You are invited to join Divini Partners              |
| Claim outreach (step 1)     | Test Venue, your Divini Partners profile is ready to claim |

That is 13 email types, one sample of each.

## Notes

- Password reset and login are handled by Authentik (OIDC), not by Divini
  Partners email. They are intentionally NOT part of this suite.
- The claim outreach sample is the ONLY type that carries open/click tracking in
  production. In a real claim send the tracking reference is the
  `claim_outreach` row id, which weaves in the open pixel and tracked links; the
  test sample sends the same copy without that reference.
