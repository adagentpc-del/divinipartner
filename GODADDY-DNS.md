# Divini Partners — GoDaddy DNS + domain cutover + Resend email

Two jobs: (1) point divinipartners.com at THIS build on the droplet
(167.172.135.196), and (2) authenticate the domain for Resend so email sends.

Droplet: 167.172.135.196 (DigitalOcean). App on port 3011 behind Caddy
(Dockerized, auto-HTTPS). Replit is the OLD host the apex still points to.

Never commit the real Resend API key. It lives only in the server .env.local.

---

## 1. Point the domain at this build (GoDaddy → DNS → Records)

The apex A record currently resolves to Replit. Edit it (do not add a duplicate)
and the www record so both reach the droplet.

| Type  | Name | Value                | TTL  | Note                                   |
|-------|------|----------------------|------|----------------------------------------|
| A     | @    | 167.172.135.196      | 600  | EDIT the existing @ A record (was Replit) |
| CNAME | www  | divinipartners.com   | 600  | or A `www` -> 167.172.135.196          |

Delete any leftover Replit A/CNAME/ALIAS rows for @ or www. Keep TTL low (600s)
during cutover so changes propagate fast.

After DNS propagates, on the SERVER make Caddy serve the apex from this app and
let it issue the TLS cert:

```bash
# Server web console (DigitalOcean). Point the apex (and www) at port 3011.
grep -q 'divinipartners.com {' /root/Caddyfile || printf '\ndivinipartners.com, www.divinipartners.com {\n    reverse_proxy localhost:3011\n}\n' >> /root/Caddyfile
# If a divinipartners.com block already exists pointing at the old app (3010):
sed -i 's#reverse_proxy localhost:3010#reverse_proxy localhost:3011#' /root/Caddyfile
docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
sleep 20; curl -s -o /dev/null -w 'apex https %{http_code}\n' https://divinipartners.com/api/healthz
```

Want `apex https 200`. Set the canonical origin so links and CORS are correct,
then redeploy:

```bash
cd /root/sites/divini-partners && sed -i 's|^PUBLIC_APP_URL=.*|PUBLIC_APP_URL=https://divinipartners.com|' .env.local && bash deploy.sh
```

NOTE on login: registration and the public site work immediately. The OIDC login
flow needs Authentik updated too — add `https://divinipartners.com/auth/callback`
to the provider redirect URIs and set matching VITE_OIDC_REDIRECT_URI (see
DIVINI-PARTNERS-DEPLOY.md Stage C). PKCE requires HTTPS, which Caddy provides.

---

## 2. Resend email authentication (GoDaddy → DNS → Records)

Resend verifies the domain via a sending subdomain (`send`) plus a DKIM key.
GoDaddy auto-appends the domain, so enter the short Name (no `.divinipartners.com`).
Paste each value EXACTLY as the Resend dashboard shows it (a trimmed DKIM value
breaks signing).

| Type | Name                | Value                                              | Priority | TTL |
|------|---------------------|----------------------------------------------------|----------|-----|
| TXT  | resend._domainkey   | p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDSUA9SaVHHZY+eSttlz8vvvfn9s5je2BY29EjP2QBhVKARhh1Re29E7yhrgTJGXMthWQo/fFvt2lmEh/C88tFbOwnYszQj0DQ5Os7HM191Egy7gNxXJsDcrgdVURDszHDUkgS9X+6Ytgb9sMr79T3dNBNqtEnWaJ+CTZvEb74NDwIDAQAB | (n/a) | 1hr |
| MX   | send                | feedback-smtp.us-east-1.amazonses.com              | 10       | 1hr |
| TXT  | send                | v=spf1 include:amazonses.com ~all                  | (n/a)    | 1hr |
| TXT  | _dmarc              | v=DMARC1; p=none;                                   | (n/a)    | 1hr | (recommended)

Optional, ONLY if you want to RECEIVE mail at the domain (not needed to send):
| MX | send | inbound-smtp.us-east-1.amazonaws.com | 10 | 1hr |

After adding, click Verify in the Resend dashboard. Verification can take a few
minutes to a couple of hours for DNS to propagate.

---

## 3. Turn email on for the app (server .env.local)

The real key goes ONLY here, never in the repo. EMAIL_FROM must be on the
verified domain.

```bash
cd /root/sites/divini-partners
# Append (or edit) the three email vars, then redeploy:
grep -q '^EMAIL_PROVIDER=' .env.local && sed -i 's|^EMAIL_PROVIDER=.*|EMAIL_PROVIDER=resend|' .env.local || echo 'EMAIL_PROVIDER=resend' >> .env.local
grep -q '^EMAIL_API_KEY=' .env.local && sed -i 's|^EMAIL_API_KEY=.*|EMAIL_API_KEY=re_PASTE_YOUR_KEY|' .env.local || echo 'EMAIL_API_KEY=re_PASTE_YOUR_KEY' >> .env.local
grep -q '^EMAIL_FROM=' .env.local || printf 'EMAIL_FROM=Divini Partners <partners@divinipartners.com>\n' >> .env.local
bash deploy.sh
```

## 4. Confirm delivery (the real test, to adagentpc@gmail.com)

```bash
node /root/sites/divini-partners/server/dist/test-emails.js adagentpc@gmail.com
```

Want all 13 types reporting SENT. Then check the inbox. Admin alternative once
logged in: POST /api/admin/test-email { "to": "adagentpc@gmail.com" }.

SECURITY: the API key was shared in plaintext. After setup, rotate it in the
Resend dashboard and update EMAIL_API_KEY on the server.
