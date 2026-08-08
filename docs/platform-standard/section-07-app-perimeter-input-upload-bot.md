# Section 07 — Application/API Perimeter, Input Validation, File Upload, Bot & Malware Security

Status: **COMPLETE**. Live header inspection against a running server, live
adversarial file-upload tests (magic-byte spoofing, path traversal,
disguised executables) against a real endpoint, and a full-repository grep
sweep for the classic injection/redirect/mass-assignment/SSRF patterns.

## Perimeter controls

All confirmed live via `curl -D -` against the running server, not just
read from code:

| Control | Status | Evidence |
|---|---|---|
| CSP | PASS | `default-src 'self'; script-src 'self'` (no `unsafe-inline`/`unsafe-eval` for scripts), `frame-ancestors 'none'`, `object-src 'none'` — seen live on every response |
| X-Content-Type-Options | PASS | `nosniff` on every response |
| X-Frame-Options | PASS | `DENY` on every response (defense-in-depth alongside `frame-ancestors 'none'`) |
| Referrer-Policy | PASS | `strict-origin-when-cross-origin` |
| HSTS | PASS | `max-age=31536000; includeSubDomains; preload` (production is HTTPS-only behind Caddy; header is inert but harmless over local http) |
| Permissions-Policy | PASS | Denies camera/mic/geolocation/payment/usb/etc. — this app uses none of them |
| CORS | PASS | Fails closed in production: an empty allowlist denies all cross-origin requests rather than reflecting `*`; permissive only outside production for dev convenience (`server/src/app.ts`) |
| CSRF | PASS | Re-confirmed this session (Sections 05/06 tests all required a matching `x-csrf-token` header; requests without it were rejected) |
| Rate limiting | PASS | Layered: general API 300/min, auth-specific 20/min, plus two tighter tiers (60/min, 12/min) for sensitive routes; live-tested in Section 04 (25 rapid login failures → 429 with `Retry-After`) |
| Bot/crawler control | PASS | `botGuard.ts` — an explicit allowlist for real search-engine crawlers plus a blocklist for scraping tools, not a `robots.txt`-only boundary (task #45, prior session) |
| `X-Powered-By` info leak | **Was present — fixed this session** | `app.disable("x-powered-by")` added; confirmed live via `curl -D -` before/after — header is now absent |

Two stale documentation claims found and fixed (same pattern as the
Privacy Policy fix in Section 05): `securityHeaders.ts` and
`rateLimit.ts` both still said "MFA / 2FA: NOT implemented... no second
factor anywhere in this app" — true when written, false since Section 04
(and even earlier, task #61) shipped native TOTP + backup codes. Reworded
both to point at the real implementation instead of asserting its absence.

**Not covered by this app's code, honestly flagged (not faked):** WAF/CDN,
volumetric DDoS mitigation, and TLS termination are Caddy/edge-level
infrastructure concerns outside this repository's scope — already
documented as such in both files' own top-of-file comments, confirmed
accurate.

## Input validation

Swept the full `server/src` tree for each OWASP category the pack calls
out, rather than spot-checking:

- **SQL injection:** zero string-interpolated SQL found anywhere
  (`query(\`...${...}\`)` pattern search returned zero hits). Every one of
  the 23 files using template-literal queries builds parameter
  placeholders (`$1`, `$2`, ...) and passes values through the parameter
  array, never through string interpolation. The one dynamic
  `ORDER BY ${orderBy}` (`db/marketplace.ts`) is safe: `orderBy` is
  selected from a fixed set of 4 hardcoded SQL fragments via an
  allowlisted `sort` enum check, never built from raw user input. PASS.
- **XSS / stored XSS:** only 2 `dangerouslySetInnerHTML` call sites in
  the entire SPA, both for JSON-LD structured data, both routed through
  `jsonLdSafe()` (escapes `<` to prevent `</script>` breakout) — this was
  already fixed as task #48 in a prior session; re-confirmed the fix is
  still in place and is the only such call site. PASS.
- **SSRF:** a dedicated, well-built guard (`lib/safe-fetch.ts`) blocks
  non-http(s) schemes and every private/loopback/link-local/reserved IPv4
  and IPv6 range (including the `169.254.169.254` cloud metadata address
  explicitly), and re-validates every redirect hop (max 2) against the
  same rules rather than trusting the first check alone. Confirmed it is
  actually used at the one real user-supplied-URL fetch site
  (`discovery-search.ts`'s `fetchPageText()`, explicitly commented
  "H3: SSRF-guarded fetch"). The other raw `fetch()` call sites in the
  codebase (PayPal API, Ollama/LLM endpoint, email provider APIs) all
  target fixed, server-configured base URLs, never a user-supplied host —
  correctly out of scope for the SSRF guard. PASS.
- **Open redirect:** the one real redirect endpoint (`routes/email-track.ts`'s
  tracked-click redirect) validates the target against an allowlist of
  `PUBLIC_APP_URL`/`ALLOWED_ORIGINS` hosts before redirecting, falling back
  to a safe default otherwise. Swept the SPA for a `searchParams.get('redirect'
  )`-into-`navigate()` pattern (the other classic open-redirect vector) —
  zero matches. PASS.
- **Mass assignment:** every route destructures specific named fields from
  `req.body` rather than trusting the whole object; the 3 places that do
  spread `{ ...req.body, ... }` into a create-input object were traced
  through to their `db/*.ts` layer, which only ever reads its own
  explicitly-typed named fields when building the parameterized `INSERT`
  (e.g. `pipeline.ts`'s `createOpportunity()` hardcodes `organization_id`
  from the server-resolved actor, never from `input.organization_id`) —
  extra attacker-supplied fields on the spread object are simply never
  read. PASS, though noted as a less defensive-in-depth pattern than an
  explicit allowlist at the route layer; not changed since it is not
  presently exploitable anywhere it was checked.
- **IDOR/BOLA:** the bulk of this was already covered by Section 05's live
  adversarial cross-tenant test suite (13/13 correct rejections). Not
  re-run here.
- **Path traversal:** live-tested below, not just read.
- **Unsafe deserialization / request smuggling:** N/A — no custom
  deserialization of untrusted binary formats (`JSON.parse` only, via
  Express's built-in body parser); no custom HTTP parsing that would be
  susceptible to smuggling (standard Express/Node HTTP stack).

## File uploads — live adversarial test

Registered a real test account/org and hit the real multipart upload
endpoint (`POST /api/profile-extras/decks`) with three crafted payloads:

| # | Test | Payload | Result |
|---|---|---|---|
| 1 | Magic-byte / declared-type mismatch | Plain text file declared as `application/pdf` / `.pdf` | **400** `"file contents do not match its type"` |
| 2 | Path traversal via filename | A real, valid PDF with `filename=../../../../etc/passwd.pdf` | **201 success**, but the stored key was `<orgId>/profile-decks/<timestamp>-<random>-passwd.pdf` — traversal segments stripped, file landed safely inside the org-namespaced storage root. Confirmed on disk directly: `find /data/procure-files -iname "*passwd*"` showed the file only at the sanitized, org-scoped path, nowhere else on the filesystem. |
| 3 | Disguised executable | A file with a Windows PE (`MZ`) header, declared as `application/pdf` / `.pdf` | **400** `"file contents do not match its type"` |

All three passed as expected — this is genuinely defended, not assumed.
Test org, uploaded file, and on-disk artifact all cleaned up after.

Full checklist against the pack's file-upload items:

| Item | Status | Evidence |
|---|---|---|
| Allowlisted file types | PASS | `ALLOWED_EXT` — documents (pdf/png/jpg/jpeg/doc/docx/csv) and images (png/jpg/jpeg/svg), no archive/executable types ever |
| MIME + extension + signature validation | PASS | `validateFileMeta()` cross-checks declared MIME against the extension's allowed set; `sniffMagicBytes()` verifies actual file bytes; live-tested above |
| Size limits | PASS | `MAX_UPLOAD_BYTES`, env-overridable, enforced in `validateFileMeta()` |
| Filename/path sanitation | PASS | Live-tested above; `[^\w.\- ]` characters (including `/`) stripped before building the storage key, and `objectStorage.ts`'s `safeRelKey()` independently rejects any residual `..`/absolute path as a second layer |
| Private-by-default object storage | PASS | Every download route (`profile-decks-programs.ts`, `signatures.ts`) requires session auth + org/party ownership check before streaming, confirmed live in Section 05; the separate `/public/...` routes are a deliberately distinct code path that only ever serves rows explicitly marked public on a published profile |
| Authorization before upload/download | PASS | `requireUser` + `requireOrg()` on every upload route; ownership-scoped lookup on every download route (Section 05 evidence) |
| Short-lived signed URLs | **N/A by design decision, made this session (Section 05)** | The dead `signDownloadUrl`/`verifyDownloadUrl` HMAC mechanism (never actually wired to a route) was removed rather than resurrected — the real, working download-authorization model is session-authenticated ownership checks per request, which this audit independently confirms is sound and already exercised live |
| Malware/virus scanning | PARTIAL (CONDITIONAL) | `scanWithClamAV()` exists and is wired into the real upload path (confirmed in `profile-decks-programs.ts`'s `POST /decks`, scanning plaintext bytes via a temp file before storage even when at-rest encryption is on); fails closed only when `AV_SCAN_ENABLED=true` (an operator/infra decision — ClamAV must be installed on the host) — task #47 from a prior session. Whether it is actually turned on in production is an operator fact this environment cannot see. |
| Image/PDF/document parser isolation | N/A | This app does not parse uploaded documents server-side into another format (no PDF rendering, no image resizing/thumbnailing pipeline that would touch a vulnerable parser library) — files are stored and streamed back as opaque bytes, never fed through a parsing library |
| Metadata stripping | Not implemented | Uploaded images/PDFs are stored with original embedded metadata (EXIF GPS data on a photo, PDF author fields, etc.) intact. Low severity for this product's current file types (business documents like W-9s and COIs, company logos) but a real privacy-hygiene gap for uploaded photos specifically. Documented as a new finding (T28), not fixed this pass — needs a real image/PDF metadata-stripping library choice, not a quick patch. |
| Archive/zip-bomb handling | N/A | No archive extensions are in any allowlist |
| Duplicate/version behavior | PASS | Each upload gets a fresh timestamp+random-suffixed storage key (`deckStorageKey()`); the deck itself is a normal row that can be replaced/deleted via its own `PATCH`/`DELETE` route, ownership-checked |
| Delete/replace permissions | PASS | `DELETE /decks/:id` is org-scoped (`extras.deleteDeck(ctx.actor.org.id, id)`), same pattern as every other org-scoped resource verified in Section 05 |

## Bot/scraping/fraud

`lib/botGuard.ts` (task #45, prior session): an explicit allowlist for
real search-engine crawler user-agent signatures plus a blocklist for
known scraping tools, layered on top of (not a replacement for) the rate
limiter's velocity controls — not a `robots.txt`-only boundary, matching
the pack's explicit instruction. Not re-audited line-by-line this
session; re-confirmed it is still registered in `app.ts` and still the
mechanism this session's own Playwright tests (Section 01-06 work) had to
route around with a realistic Chrome UA string, which is itself a form of
live confirmation that it actively blocks headless/bot signatures.

## Findings summary

| ID | Finding | Severity | Status |
|---|---|---|---|
| S07-F1 | `X-Powered-By: Express` header leaked framework identity on every response | P2 (minor info disclosure) | **Fixed** — `app.disable("x-powered-by")`, confirmed live before/after |
| S07-F2 | `securityHeaders.ts` and `rateLimit.ts` both contained a stale "no MFA anywhere in this app" comment, false since Section 04 | P2 (documentation accuracy, same class as the Section 05 Privacy Policy finding) | **Fixed** — both reworded to point at the real TOTP implementation |
| S07-F3 | File-upload path traversal, magic-byte spoofing, and disguised-executable attempts | N/A (verification, not a defect) | **PASS, live-verified** — all three attack attempts correctly rejected or safely neutralized |
| S07-F4 | Uploaded images/PDFs retain embedded metadata (EXIF, PDF author fields) with no stripping step | P2 (privacy hygiene, low severity for this product's current file mix) | Documented as T28, not fixed this pass |

No P0 findings. Two real P2s found and fixed in the same pass; one real
P2 documented for a future pass (metadata stripping needs a considered
library choice, not a rushed patch); everything else audited this section
was already correctly built.
