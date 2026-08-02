# Divini Partners — Stage B (Login + Registration): superseded

This file previously described turning on login via **Authentik OIDC**. That
auth path has been fully retired — the app now uses **native email + password**
auth (`server/src/auth.ts`, `server/src/routes/auth-native.ts`, HS256 session
JWT signed with `SESSION_SECRET`). There is no OIDC app to create, no
`OIDC_*`/`VITE_OIDC_*` env vars, and no PKCE/redirect-URI configuration.

**Use `DIVINI-PARTNERS-DEPLOY.md` → "STAGE B — Turn on login + registration
(HTTPS + email)" instead.** In short, Stage B now only requires:

1. DNS: point `app.divinipartners.com` at the droplet.
2. `PUBLIC_APP_URL` set to the HTTPS host, then redeploy.
3. Caddy site block for the host (auto HTTPS).
4. `EMAIL_PROVIDER` + `EMAIL_API_KEY` set — required for the
   register → verify-email → login flow to complete. Without it, verification
   emails are logged and skipped, so no one can finish registering.

Login is blocked by two independent things until both are true: the session
cookie is `Secure` in production (needs HTTPS), and email verification is
required before first login (needs the email provider). See
`AI_PROJECT_OS/15_KNOWN_ISSUES.md` for both gotchas in one place.
