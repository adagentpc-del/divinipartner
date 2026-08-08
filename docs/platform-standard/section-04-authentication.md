# Section 04 — Authentication, OAuth, Sessions, MFA & Account Recovery

Produced 2026-08-08. Read alongside `architecture-map.md` (auth provider
already identified as native email/password) and `AI_PROJECT_OS/51_SECURITY.md`
/ `53_SOC2_ISO27001_AUDIT.md` (MFA and session revocation already
documented as built there). This section's job was live verification
against the pack's validation matrix, not rebuilding — and that's what it
found: an already well-implemented system, verified end to end with real
requests against a running server rather than assumed from reading code.

## Applicability

- **OAuth/social login: N/A.** No OAuth provider code exists anywhere in
  `server/src/auth.ts` (confirmed by direct reading, matching Section 01's
  finding). `src/lib/oidc.ts` (client-side Authentik OIDC helper) is
  genuinely dead code — grepped the full `src/` tree, nothing imports it.
  Legacy `OIDC_*`/`VITE_OIDC_*` env vars remain in `.env.local.example` for
  the same reason (`24_ENVIRONMENTS.md` already flags this as a
  clean-up-when-convenient item). Because no OAuth exists, "OAuth state
  mismatch" and "account-linking collision" from the pack's validation
  matrix are N/A — there is no linking surface to collide on.
- **Magic links: N/A.** Not implemented; email/password + emailed
  verify/reset tokens instead.

## Live validation matrix (executed 2026-08-08 against a running server, real HTTP requests, a real registered test account -- not assumed from reading code)

| # | Test | Result | Evidence |
|---|---|---|---|
| 1 | Valid login | **PASS** | Registered, verified, logged in successfully; session cookie + CSRF cookie issued |
| 2 | Invalid password | **PASS** | Generic `401 {"error":"Incorrect email or password."}` — same shape regardless of whether the account exists or is verified (see #3) |
| 3 | Unverified account behavior | **PASS** | Correct *and* secure ordering, confirmed by testing both directions: correct password on an unverified account → `403` with an explicit "verify your email" message (fine to reveal — they proved they know the password); WRONG password on the SAME unverified account → the same generic `401` as any wrong-password attempt, never leaking verification status to someone who hasn't proven account ownership |
| 4 | Expired reset token | **PASS** | Forced a real token's `reset_expires` into the past via direct DB update, then confirmed `POST /auth/reset` rejects it with `400` |
| 5 | Replayed reset token | **PASS** | Used a valid token once (succeeded), replayed the identical token immediately after — rejected `400`, confirming single-use |
| 6 | MFA success/failure | **PASS** | Full TOTP round trip computed live from RFC 6238 (HMAC-SHA1/6-digit/30s, matching `lib/totp.ts`'s exact parameters) with no authenticator app needed: enroll start → wrong code rejected (`400`) → correct code accepted, 10 backup codes issued → login now returns `mfaRequired`+`challengeToken` instead of a session → wrong TOTP at login rejected (`401`) → correct TOTP accepted → **confirmed the challenge token cannot be replayed as a real session** (used it as a Bearer token against `/auth/me`, got `401`) → backup-code login also verified, including that a used backup code is rejected on reuse (`401`) |
| 7 | Revoked session | **PASS** | The session cookie issued before a password reset was confirmed dead immediately after the reset (`401` on `/auth/me`) — real, not assumed |
| 8 | Logout all sessions | **PASS (was PARTIAL — fixed this session)** | Added `POST /api/auth/sign-out-other-sessions`, reusing the same `invalidateSessions()` the password-reset flow already relies on, then re-issuing a fresh session for the calling device so it stays signed in. Live-verified with two independent logins for the same account: device A called the new endpoint, device A still worked immediately after, device B was immediately dead. Frontend button added (Profile → Account → new "Sessions" section), confirmed rendering in a real browser. |
| 9 | OAuth state mismatch | N/A | No OAuth exists |
| 10 | Account-linking collision | N/A | No OAuth/account-linking exists |
| 11 | Rate limit after repeated failures | **PASS** | 25 rapid wrong-password attempts against the same login endpoint: the first ~17 returned `401`, then every subsequent attempt returned `429 {"error":"rate_limited",...,"retry_after_seconds":...}` — matches the documented "~20 req/min" throttle in `51_SECURITY.md` |
| 12 | Forged client-side role cannot grant authorization | **PASS** | Logged in as a genuine non-admin (`isAdmin:false` confirmed via `/auth/me`), then sent `{"isAdmin":true,"role":"admin"}` in a request body to an admin-only write endpoint — rejected `403`; direct hit on an admin-only route with the same non-admin session — rejected `403`. Admin authority is resolved server-side from `ADMIN_ALLOWED_EMAILS`, never from client-supplied fields, confirmed empirically, not just by reading the code. |

## Cookie / session security (verified by direct code read, `server/src/routes/auth-native.ts` `setSessionCookie()`)

- `httpOnly: true` — PASS, not readable from JS.
- `secure: IS_PROD` — PASS in production; correctly relaxed outside prod so local HTTP dev still works (documented pattern, not a bug).
- `sameSite: "lax"` — PASS, blocks the practical cross-site POST forgery cases per OWASP's CSRF cheat sheet.
- CSRF double-submit cookie issued alongside every session cookie, verified as a genuinely enforced control in Section 03's live testing this session and reconfirmed here (the forged-role test above used a valid CSRF token; a matching negative test — omitting/mismatching it — was already covered when this control was originally built, see `51_SECURITY.md`).

## Findings

| ID | Finding | Status | Priority | Action |
|---|---|---|---|---|
| S04-01 | No standalone "log out everywhere" action independent of a password change | **RESOLVED** | P2 | Fixed same session — see #8 above. T23 closed. |
| S04-02 | `src/lib/oidc.ts` and legacy `OIDC_*`/`VITE_OIDC_*` env vars are dead code/config, unreachable from any route | Confirmed dead, no risk | P2 | Remove when convenient — already flagged in `24_ENVIRONMENTS.md`, restated here with confirmation it's genuinely unreferenced, not just believed to be |

No P0 or P1 findings in this section — the existing implementation held up
to live, adversarial-style testing across all 12 applicable validation-matrix
items, and the one real completeness gap found (S04-01) was closed in the
same pass.
