# Email Setup

Divini Partners sends transactional and outreach email over HTTP (no SMTP
dependency). Email is feature-flagged: with nothing configured, `sendEmail()`
logs and reports "skipped", so every environment works without a transport.

## Required environment

```
EMAIL_PROVIDER=resend                                   # resend | postal
EMAIL_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxx              # provider API key
EMAIL_FROM=Divini Partners <partners@divinipartners.com>
```

For the Postal provider, also set:

```
POSTAL_API_URL=https://postal.example.com               # your Postal server base URL
```

Email is considered enabled only when:

- `EMAIL_PROVIDER=resend` and `EMAIL_API_KEY` is set, OR
- `EMAIL_PROVIDER=postal` and both `EMAIL_API_KEY` and `POSTAL_API_URL` are set.

## DNS: SPF, DKIM, DMARC

For mail to land in inboxes (not spam) the sending domain in `EMAIL_FROM` must be
verified with your provider:

- SPF: add the provider's `include:` to your domain's TXT SPF record, for example
  `v=spf1 include:_spf.resend.com ~all` (use the value your provider gives you).
- DKIM: add the CNAME / TXT DKIM records the provider generates for your domain
  so outgoing mail is cryptographically signed.
- DMARC (recommended): publish a `_dmarc` TXT record, e.g.
  `v=DMARC1; p=none; rua=mailto:dmarc@divinipartners.com` and tighten the policy
  (`p=quarantine` / `p=reject`) once aligned.

The `EMAIL_FROM` address must be on a domain you have verified with the provider;
otherwise sends will be rejected.

## Verifying the transport (test send)

A standalone script sends one test email using the same config the app uses:

```
# build the server first (compiles TypeScript to dist/), then:
node dist/scripts/send-test-email.js you@example.com

# or via env instead of an argument:
EMAIL_TEST_TO=you@example.com node dist/scripts/send-test-email.js
```

Behavior:

- Exits 0 and prints the provider message id when the send succeeds.
- Exits 1 if email is not configured or the provider returns an error.
- Exits 2 if no recipient is provided.

Run this as part of go-live to confirm `EMAIL_PROVIDER`, `EMAIL_API_KEY`,
`EMAIL_FROM`, and your DNS records are all correct before real mail flows.
