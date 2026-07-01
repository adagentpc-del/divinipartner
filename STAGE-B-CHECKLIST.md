# Divini Partners — Stage B Go-Live Checklist (Login + Registration)

Turn on Authentik OIDC login + registration for Divini Partners over HTTPS.
This is the precise, copy-paste companion to the Stage B section of
`DIVINI-PARTNERS-DEPLOY.md`. Same stack: server `167.172.135.196`, app on
**port 3011**, pm2 process **`divini-partners`**, database **`divini_partners`**,
Authentik at `auth.divinipartners.com`, Caddy for HTTPS.

Deploy rule (unchanged): **`rsync` runs in the Mac Terminal, everything else runs
in the DigitalOcean server web console.** Mixing them up is the recurring "didn't
update" bug.

---

## READ THIS FIRST — two hard facts that will bite you

1. **Login requires HTTPS (PKCE needs a secure context).** The SPA does
   Authorization Code **+ PKCE** against Authentik (`src/lib/oidc.ts`:
   `response_type: 'code'`, `oidc-client-ts`). PKCE uses the Web Crypto API, which
   browsers only expose in a **secure context**. Over plain `http://167.172.135.196:3011`
   the login click hangs on **"Redirecting to sign in"** and never completes. So
   the HTTPS host **`app.divinipartners.com` is mandatory before login works at
   all.** Do not try to test login over the bare IP — it cannot work.

2. **`VITE_OIDC_*` vars are baked into the SPA at BUILD time, not read at runtime.**
   `src/lib/oidc.ts` reads `import.meta.env.VITE_OIDC_ISSUER` /
   `VITE_OIDC_CLIENT_ID`, which Vite **inlines into the JS bundle when you run
   `vite build`** (`vite.config.ts`). Setting them in `.env.local` and only
   restarting pm2 does **nothing** for the frontend — the old (empty) values are
   still compiled into `server/dist/public`. After any change to a `VITE_*` value
   you **MUST rebuild the SPA, recopy `dist` into `server/dist/public`, then
   restart pm2** (Step B5). A server-only env change is not enough.

---

## The exact OIDC contract (verified against the code)

| Piece | Where it comes from | Value for Stage B |
|---|---|---|
| Frontend redirect / callback path | `src/lib/oidc.ts` builds `${origin}${basePath}/auth/callback`; route is registered in `src/App.tsx` (`/auth/callback`) and handled by `src/pages/AuthCallback.tsx` | **`/auth/callback`** → full URI **`https://app.divinipartners.com/auth/callback`** (because `BASE_PATH=/`, the base prefix is empty) |
| Frontend OIDC vars (build-time) | `src/lib/oidc.ts` | `VITE_OIDC_ISSUER`, `VITE_OIDC_CLIENT_ID` (optional override `VITE_OIDC_REDIRECT_URI`) |
| Frontend flow | `src/lib/oidc.ts` | `response_type: 'code'` + PKCE, `scope: 'openid profile email'` |
| Server token verification | `server/src/auth.ts` (`jose` `createRemoteJWKSet` + `jwtVerify`) | issuer = `OIDC_ISSUER`, JWKS = `OIDC_JWKS_URL`, **audience = `OIDC_CLIENT_ID`** (the JWT `aud` must equal the client id) |
| Server OIDC vars (runtime) | `server/src/config.ts` | `OIDC_ISSUER`, `OIDC_JWKS_URL`, `OIDC_CLIENT_ID` |
| Public app URL | `server/src/config.ts` (`PUBLIC_APP_URL`, also feeds `getAllowedOrigins()` for CORS) | `https://app.divinipartners.com` |
| Base path | `server/src/config.ts` (`BASE_PATH`) and `vite.config.ts` | `/` |
| Admin gate | `server/src/config.ts` `ADMIN_ALLOWED_EMAILS` → checked in `server/src/auth.ts` against the verified `email` claim | `adagentpc@gmail.com` (lands on Super Admin dashboard) |

Note: the server verifies `audience: OIDC_CLIENT_ID` **only when it is set** (see
`auth.ts`), so the same value MUST be used for `OIDC_CLIENT_ID` (server) and
`VITE_OIDC_CLIENT_ID` (frontend), and the Authentik provider must issue tokens
whose `aud` includes that client id. Keep all three identical.

---

## B1. DNS — add the preview A record (GoDaddy)

In GoDaddy DNS for `divinipartners.com`, add an **A record** (leave the live apex
`@` record untouched — cutover happens in Stage C):

```
Type: A
Host: app
Points to: 167.172.135.196
TTL: 600 (or default)
```

This makes **`app.divinipartners.com` → 167.172.135.196**. Confirm before moving on:

```
dig +short app.divinipartners.com
```
Expect `167.172.135.196`. (DNS may take a few minutes to propagate; Caddy in B3
needs this resolving to issue the cert.)

---

## B2. Authentik — create the OAuth2/OpenID provider + application

In the Authentik admin at **`https://auth.divinipartners.com`**:

1. **Providers → Create → OAuth2/OpenID Provider**
   - **Name:** `divini-partners`
   - **Client type:** **Public** (this is a PKCE SPA — there is NO client secret)
   - **Redirect URIs / Origins (strict):**
     ```
     https://app.divinipartners.com/auth/callback
     ```
     Use **Strict** matching and the exact path **`/auth/callback`** — this is the
     real callback route the SPA redirects to (`src/lib/oidc.ts` /
     `src/pages/AuthCallback.tsx`). A trailing slash or wrong path = Authentik
     rejects the redirect.
   - **Signing Key:** the existing self-signed certificate (so JWKS is published).
   - **Scopes:** include `openid`, `profile`, `email` (the SPA requests
     `openid profile email`). The verified **`email`** claim is what drives the
     admin gate, so email MUST be in the token.
2. **Applications → Create**
   - **Name:** `Divini Partners`
   - **Slug:** **`divini-partners`**
   - **Provider:** the provider you just created.
3. Authorize the user(s) who should be able to log in (bind the app to the
   appropriate group/policy, or leave open per your Authentik setup).
4. **Copy these three values** from the provider's overview / metadata
   (`.../application/o/divini-partners/.well-known/openid-configuration`):
   - **Issuer:** `https://auth.divinipartners.com/application/o/divini-partners/`
   - **Client ID:** the generated public client id (paste into B4).
   - **JWKS URL:** `https://auth.divinipartners.com/application/o/divini-partners/jwks/`

   (Issuer and JWKS URL follow the standard Authentik pattern for slug
   `divini-partners`; verify them against the well-known doc above.)

---

## B3. Caddy — add the `app.divinipartners.com` site block (auto HTTPS)

In the **server web console**, append a site block that reverse-proxies to the
app on `localhost:3011` and reload Caddy (Caddy auto-provisions the Let's Encrypt
cert — this is why B1 must resolve first). Same reload command style as the
deploy doc:

```
printf '\napp.divinipartners.com {\n    reverse_proxy localhost:3011\n}\n' >> /root/Caddyfile && docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile && sleep 18 && echo "https: $(curl -s -o /dev/null -w '%{http_code}' https://app.divinipartners.com/api/healthz)"
```

Want `https: 200`. If you get a cert error, give it another ~30s (ACME issuance)
and re-run the `curl` line; confirm B1 DNS resolves.

---

## B4. Env — write the OIDC values into `.env.local`

In the **server web console**, fill in the real Authentik values. Paste your
copied **Client ID** into `CID` first. This sets the server vars
(`OIDC_ISSUER` / `OIDC_JWKS_URL` / `OIDC_CLIENT_ID`), the build-time frontend vars
(`VITE_OIDC_ISSUER` / `VITE_OIDC_CLIENT_ID`), and `PUBLIC_APP_URL` — the exact var
names from `server/src/config.ts` and `src/lib/oidc.ts`:

```
cd /root/sites/divini-partners && CID=PASTE_CLIENT_ID_HERE && sed -i \
  "s|^OIDC_ISSUER=.*|OIDC_ISSUER=https://auth.divinipartners.com/application/o/divini-partners/|; \
   s|^OIDC_JWKS_URL=.*|OIDC_JWKS_URL=https://auth.divinipartners.com/application/o/divini-partners/jwks/|; \
   s|^OIDC_CLIENT_ID=.*|OIDC_CLIENT_ID=$CID|; \
   s|^VITE_OIDC_ISSUER=.*|VITE_OIDC_ISSUER=https://auth.divinipartners.com/application/o/divini-partners/|; \
   s|^VITE_OIDC_CLIENT_ID=.*|VITE_OIDC_CLIENT_ID=$CID|; \
   s|^PUBLIC_APP_URL=.*|PUBLIC_APP_URL=https://app.divinipartners.com|" .env.local \
  && echo "--- OIDC/env now set:" && grep -E '^(OIDC_|VITE_OIDC_|PUBLIC_APP_URL|BASE_PATH|ADMIN_ALLOWED_EMAILS)=' .env.local
```

The Stage A env (A3) already created these keys as empty lines, so the `sed`
substitutions land. Confirm the printed block shows:
- `OIDC_ISSUER`, `OIDC_JWKS_URL`, `OIDC_CLIENT_ID` populated,
- `VITE_OIDC_ISSUER`, `VITE_OIDC_CLIENT_ID` populated (same client id),
- `PUBLIC_APP_URL=https://app.divinipartners.com`,
- `BASE_PATH=/`,
- `ADMIN_ALLOWED_EMAILS=adagentpc@gmail.com`.

(If you ever need a redirect override different from `${origin}/auth/callback`,
add `VITE_OIDC_REDIRECT_URI=https://app.divinipartners.com/auth/callback` — also a
build-time var. Normally you do NOT need it; the default already resolves to the
right URL.)

---

## B5. Rebuild the SPA (bake in VITE_ vars), recopy dist, restart pm2

**This is the step people forget.** Because `VITE_OIDC_*` is compiled in, you must
rebuild the SPA and recopy it into `server/dist/public`, then restart pm2. Run in
the **server web console** (mirrors the build line from Stage A / A4):

```
cd /root/sites/divini-partners && export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=3072 && set -a && . ./.env.local && set +a && BASE_PATH=/ npx vite build && rm -rf server/dist/public && cp -r dist server/dist/public && pm2 restart divini-partners && pm2 save && sleep 6 && curl -s -o /dev/null -w "partners :3011 HTTP %{http_code}\n" http://localhost:3011/api/healthz
```

The `set -a && . ./.env.local && set +a` line is what makes `VITE_OIDC_*`
available to `vite build` so they bake into the bundle. Want `partners :3011 HTTP 200`.

> If you have the repo's `deploy.sh` and it already runs `vite build` with
> `.env.local` sourced + recopies `dist` to `server/dist/public` + restarts pm2,
> you can run `bash deploy.sh` instead — but only if it rebuilds the SPA. A
> server-only restart will NOT pick up the new `VITE_OIDC_*` values.

---

## B6. Smoke test — prove login + registration over HTTPS

1. Open **`https://app.divinipartners.com`** in a normal browser (must be HTTPS —
   see "READ THIS FIRST"). Confirm the public site loads and the padlock is green.
2. Click **Get started** / **Sign in**. You should be redirected to
   `auth.divinipartners.com` (Authentik). If it hangs on "Redirecting to sign in",
   you are not on HTTPS, or `VITE_OIDC_*` did not bake in (re-do B5), or the
   redirect URI in B2 doesn't match `/auth/callback`.
3. **Register a test account:** create the account in Authentik / sign in, then on
   first login you're bounced to `/onboarding` — pick a role (venue / vendor /
   supplier / installer / planner / client), pick a tier (Free / Partner $45 /
   Premier $99), accept terms. Land on that role's dashboard.
4. Confirm the **PKCE round-trip completed:** you returned to
   `https://app.divinipartners.com/auth/callback` and were forwarded into `/app`
   (`AuthCallback.tsx`) with no console errors.
5. **Admin check:** sign in as **`adagentpc@gmail.com`**. Because it's in
   `ADMIN_ALLOWED_EMAILS`, `/me` returns `isAdmin: true` and you land on the
   **Super Admin** dashboard. (If you get a normal role dashboard instead, the
   email claim case/spelling differs, or `ADMIN_ALLOWED_EMAILS` wasn't set — it's
   lowercased and compared in `auth.ts`.)
6. **Auth-gated page:** while logged in, open a page behind auth — e.g. the
   invoice/payment page, **`/payouts/setup`** (payout method), or **`/account/seats`**
   (team seats). It should load and call `/api/...` successfully with the Bearer
   token (no 401). A 401 here means the server isn't verifying the token — recheck
   `OIDC_ISSUER` / `OIDC_JWKS_URL` / `OIDC_CLIENT_ID` (audience) in B4.

---

## B7. Turn-on notes (once login is up)

- **Payments enforce webhook secrets in production.** The server **refuses to boot**
  in `NODE_ENV=production` if a processor is enabled without its webhook secret
  (safety gate, not a bug — an unverified webhook can move money). So:
  - If you set `STRIPE_SECRET_KEY`, you MUST also set **`STRIPE_WEBHOOK_SECRET`**.
  - If you set `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET`, you MUST also set
    **`PAYPAL_WEBHOOK_ID`**.
  - With NO processor keys set, the app stays record-only and boots fine — so you
    can complete Stage B login without touching payments. Add test/sandbox keys
    first (see "Enabling payments" in `DIVINI-PARTNERS-DEPLOY.md`), then
    `pm2 restart divini-partners`.
  - Point processor dashboards at:
    `https://app.divinipartners.com/api/payments/webhook/stripe` and
    `https://app.divinipartners.com/api/payments/webhook/paypal`.
- **Seed the Miami-Dade placeholder profiles** (after the DB is loaded; safe to run
  once login is up, idempotent):
  ```
  node /root/sites/divini-partners/server/dist/seed-miami.js
  ```
- **Automation worker** (claim outreach + market expansion) can run once login is
  up — either via daily cron or in-process loop:
  ```
  # cron (recommended), once a day:
  0 9 * * *  cd /root/sites/divini-partners && node server/dist/worker.js >> /var/log/divini-worker.log 2>&1
  # or in-process: set WORKER_INTERVAL_MINUTES=1440 in .env.local and pm2 restart divini-partners
  ```
  (Claim outreach emails only actually send once an email provider is configured —
  see "Enabling email" in the deploy doc.)

---

## What could go wrong (the four classic failures)

1. **Login hangs on "Redirecting to sign in" (PKCE/HTTPS).** You're testing over
   `http://167.172.135.196:3011` or any non-secure origin. PKCE's Web Crypto only
   works in a secure context — you MUST use `https://app.divinipartners.com`.
   Finish B1+B3 (DNS + Caddy cert) first, then test only over HTTPS.
2. **Changed `VITE_OIDC_*` but login still broken / "Missing VITE_OIDC_…" in the
   browser console.** You set the env but didn't rebuild. `VITE_*` is compiled into
   the bundle at `vite build` time; a pm2-only restart keeps the old empty values.
   Re-run **B5** (vite build → recopy `dist` to `server/dist/public` → pm2 restart).
3. **Authentik rejects the redirect / "redirect_uri mismatch".** The redirect URI
   in B2 must be **exactly** `https://app.divinipartners.com/auth/callback` (no
   trailing slash, correct path, Strict matching). That's the real path the SPA
   uses (`src/lib/oidc.ts` builds `${origin}/auth/callback`; route in `App.tsx`).
4. **Logged in but not on Super Admin / 403s on admin pages.** The admin gate
   compares the **lowercased verified `email` claim** to `ADMIN_ALLOWED_EMAILS`
   (`server/src/config.ts` + `server/src/auth.ts`). Confirm the token actually
   carries `email` (scope `email` in B2) and that `ADMIN_ALLOWED_EMAILS=adagentpc@gmail.com`
   is set. A 401 (not 403) anywhere means the token isn't verifying at all — recheck
   `OIDC_ISSUER` / `OIDC_JWKS_URL` and that `OIDC_CLIENT_ID` matches the token `aud`.
```
