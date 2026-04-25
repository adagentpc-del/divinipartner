# A3 Partner Portal — Cost & Protection Audit

**Status:** consolidated audit covering four optimization passes.
**Last updated:** 2026-04-25.
**Companion doc:** `PDF_AI_COST_AUDIT.md` (deep dive on the AI surface).

This document is the canonical answer to: *"What did we do to make this app
cheap to run, hard to abuse, and safe at multi-partner scale — and what did
we deliberately NOT do?"*

---

## 1. Architecture, in one diagram

```
                       ┌────────────────────────────────────────────┐
                       │      Replit edge proxy (TLS, mTLS to app)  │
                       │      trust proxy = 1                        │
                       └────────────────────────────────────────────┘
                                       │
                ┌──────────────────────┼──────────────────────┐
                │                      │                      │
        ┌───────▼────────┐    ┌────────▼────────┐    ┌────────▼─────────┐
        │  a3-portal     │    │   api-server     │    │  mockup-sandbox  │
        │  (Vite SPA)    │    │   (Express 5)    │    │  (dev only)      │
        └────────────────┘    └────────┬─────────┘    └──────────────────┘
                                       │
                ┌──────────────────────┼──────────────────────┐
                │                      │                      │
        ┌───────▼────────┐    ┌────────▼────────┐    ┌────────▼─────────┐
        │ PostgreSQL     │    │ Object Storage  │    │ OpenAI           │
        │ (Neon/Drizzle) │    │ (Replit App     │    │ (4 narrow calls; │
        │ source of      │    │  Storage)       │    │  see §6)         │
        │ truth          │    │ files +         │    └──────────────────┘
        │                │    │ derived assets  │
        └────────────────┘    └─────────────────┘
```

Two side services we **do not** run by design:

- **No Redis.** All hot-path dedupe is content-hash → row in PG. Rate
  limiting uses in-memory buckets per process (`express-rate-limit`),
  which is correct at this app's scale. Adding Redis adds a second
  stateful infra component, a new failure mode, and recurring cost for a
  problem we don't have. If the api-server ever scales horizontally past
  one instance, a shared rate-limit store is the first thing to add — see
  §10 "Next scaling step."
- **No pgvector.** No retrieval feature exists in this product. Adding
  the extension and embedding pipeline would be cost without benefit.
  Re-evaluate only if a "search across all partner uploads" feature
  arrives.

---

## 2. What lives where

| Concern                           | Storage                       | Why                                                               |
| --------------------------------- | ----------------------------- | ----------------------------------------------------------------- |
| Partners, events, orders, requests, items, billing state, admin notes, package/deck rows, AI-derived structured outputs | **PostgreSQL** | Source of truth; transactional; queryable.                        |
| Uploaded PDFs, images, brand assets, derived PDFs (order summaries, invoices) | **Object Storage** | Bytes never travel through the app process; presigned URL upload. |
| File ↔ extraction binding (file hash + AI output JSON + model + prompt version) | **PostgreSQL** | Powers parse-once / reuse-forever (§4).                           |
| Request AI summary (overview + risks JSON + input hash) | **PostgreSQL** | Powers content-hash cache for `regenerate-ai` (§4).               |
| Cost / usage events (`usage_events` table, one row per AI call, with `.generated`, `.failed`, `.reused` events) | **PostgreSQL** | Cheap, auditable, queryable in SQL (§7).                          |
| Rate-limit buckets, login throttle | **In-memory** (per process)   | One api-server instance; sufficient (see §10 if that changes).    |

**Files do not flow through the app server.** Browsers request a presigned
upload URL (`POST /api/storage/uploads/request-url`, rate-limited), then PUT
the file directly to object storage. Reads go through
`/api/storage/objects/*` with an ACL check on every byte.

---

## 3. AI surface — final state

There are exactly **four** code paths that talk to OpenAI. Everything else
is deterministic code.

| File                                 | Task                                  | Model tier (centralized in `lib/aiModels.ts`) | Dedup       | Fallback                          |
| ------------------------------------ | ------------------------------------- | --------------------------------------------- | ----------- | --------------------------------- |
| `lib/aiSummary.ts`                   | Request overview + risks (≤ 250 toks) | "summary" tier                                | content hash on prompt-shaped input | Deterministic skeleton always wins; AI only adds prose. |
| `lib/deckExtraction.ts`              | Pitch-deck JSON normalization         | "extraction" tier                             | file hash   | Hard error on parse failure (no silent fallback). |
| `lib/packageExtraction.ts`           | Package PDF row extraction            | "extraction" tier                             | file hash   | Hard error.                       |
| `lib/billingSignals.ts`              | Billing PDF signal extraction         | "extraction" tier                             | file hash   | Hard error.                       |

**Provider-native prompt caching readiness.** All four callsites use the
shape `messages: [{role:"system", content: <stable string>}, {role:"user",
content: <variable payload>}]`. That's exactly the order OpenAI's
automatic prompt cache requires (stable prefix first, variable suffix
after). When total prompt length crosses **1024 tokens** the cache kicks
in automatically with a 50% discount on cached input tokens — no client
flag, no SDK option, just the right message ordering. In practice:

- `deckExtraction` and `packageExtraction` routinely exceed 1024 tokens
  because the PDF text lives in the user message; cache applies for free.
- `aiSummary` (~75-token system + small JSON input) and `billingSignals`
  (~40-token system + small PDF excerpt) stay well below 1024 tokens by
  design, so caching doesn't trigger and there is nothing to gain by
  forcing it. The spend on those calls is already minimal because the
  prompts themselves are small.

All four:

- Build prompts from **compact JSON inputs**, not raw catalogs/orders/full
  user history.
- Use **structured JSON output** (`response_format: json_object`) so the
  caller doesn't need a stronger model just to coax structure.
- Cap `max_tokens` (250 for summary; tight schema-shaped caps for the
  extractors).
- Resolve client + model via `lib/aiModels.ts` so a model swap is one-line,
  not a grep-and-replace.
- Emit `usage_events` rows on every call (`.generated`, `.failed`, `.reused`)
  so cost is queryable in SQL (§7).
- Are **idempotent** for the caller: regenerate-ai checks the input hash
  and short-circuits if nothing changed (`.reused` event emitted, no AI
  spend).

What is NOT in the AI surface (verified, see `PDF_AI_COST_AUDIT.md` §11):

- No chatbot, no support-thread summarizer, no admin-reply drafter.
- No autocomplete / search-suggestion AI.
- No PDF-generation AI (order summaries / invoices / supplier packets are
  built deterministically with `pdfkit` from PG rows).
- No pricing / tax / availability / package-total / status / readiness AI.
  All deterministic in code.

---

## 4. Parse once, reuse forever

The three PDF extractors (`deck`, `package`, `billing`) follow the same
pattern:

1. File uploaded to object storage via presigned URL.
2. `sha256` of the file is computed.
3. Lookup in PG: is there an existing successful extraction for this hash
   with the same `PROMPT_VERSION` and same model tier?
4. If yes → return the stored JSON. **Zero AI spend, zero re-parse.**
5. If no → run extraction, persist `(hash, model, prompt_version, json)`,
   return.

Rerun is opt-in only (`POST /:id/rerun`), and even then the limiter in §5
caps how often one IP can fire it.

The request AI summary uses an analogous `aiSummaryInputHash` column on
`requests`. The hash is computed only over the **fields the AI sees**
(sorted categories, missing-info bullets, prompt version, model tier), so
unrelated edits to the request don't bust the cache.

---

## 5. Rate limits & body caps

All limiters live in `middlewares/rateLimit.ts` (in-memory,
`express-rate-limit`, draft-7 standard headers). `trust proxy = 1` is set
so `req.ip` is honest behind the Replit edge.

| Limiter             | Window  | Limit | Applied to                                                                      |
| ------------------- | ------- | ----- | ------------------------------------------------------------------------------- |
| `loginLimiter`      | 5 min   | 30    | (Reserved; Clerk handles the actual login round-trip in production.)            |
| `uploadLimiter`     | 1 min   | 60    | `POST /api/storage/uploads/request-url`                                          |
| `orderSubmitLimiter`| 10 min  | 20    | `POST /api/public/partners/:slug/orders`                                         |
| `publicWriteLimiter`| 1 min   | 30    | `POST /api/public/partners/:slug/(requests\|orders)`, `POST /api/onboarding/submit` |
| `publicReadLimiter` | 1 min   | 120   | `GET`/`HEAD /api/public/*` and `GET`/`HEAD /api/storage/public-objects/*` (added this pass) |
| `aiTriggerLimiter`  | 10 min  | 20    | `POST /api/partners/:id/(deck\|package)-extractions` and their `/rerun` (added this pass) |

Body caps:

- `express.json` and `express.urlencoded`: **2 MB** (was 50 MB; tightened
  this pass). Files travel via presigned URLs to object storage, never
  through JSON, so legitimate bodies stay well under 1 MB; 2 MB gives 10×
  headroom while preventing memory-exhaustion DoS.
- `multer` importer (CSV/XLSX): 10 MB, extension allowlist
  (`.csv .tsv .xlsx .xls`), filename sanitized to `[A-Za-z0-9._-]`,
  capped to 120 chars.
- Object-storage uploads: 25 MB at the presigned-URL boundary, content-type
  prefixes restricted to `image/`, `application/pdf`, `application/zip`,
  `application/octet-stream`.

---

## 6. Back-end protection (server-only, never trusted from client)

- **Clerk middleware** mounted globally; admin-only routes additionally
  check an `ADMIN_ALLOWED_EMAILS` allowlist. In production, an empty
  allowlist **blocks** all admin requests rather than failing open.
- **Partner isolation:** every partner-scoped query joins on
  `partner_id` derived from the authenticated session, never from the
  request body or URL alone (the URL `:slug` is resolved to a partner row
  and that row's `id` is used for the join).
- **Object ACL:** `/api/storage/objects/*` calls
  `objectStorageService.canAccess(...)` on every read. There is no
  "private bucket" shortcut — all private reads go through the ACL path.
- **CORS allowlist** built from `ALLOWED_ORIGINS` + `PUBLIC_APP_URL` +
  the dev domain, with same-origin reflection so the SPA-on-same-host
  case can't be misconfigured into a 403. Misses fall through cleanly
  (no 500-as-CORS-error).
- **`helmet`** with `crossOriginResourcePolicy: cross-origin` (the API
  serves no HTML, so a strict CSP would only false-positive).
- **`canonicalHostMiddleware`** redirects to the production hostname so
  cookies + Clerk session land on the right origin.
- **`safeErrorHandler`** is the last middleware; in production it strips
  stack traces and `Error.message` from responses and only emits them to
  structured logs (which already redact `cookie` and `authorization`).
- **`assertRequiredSecrets`** runs at boot; in production a missing
  required secret hard-fails. In dev it logs a warning and degrades.
- All admin notes / requests / orders mutations go through Zod-validated
  bodies (`@workspace/api-zod`), so the DB never sees an unparsed shape.

---

## 7. Cost visibility

`usage_events` is a single append-only PG table:

```
id, eventType, objectId, actorId, payloadJson, createdAt
```

Every AI call emits one row. Three event flavours per AI feature:

- `*.generated` — an AI call actually fired. `payloadJson` carries
  `{ model, promptVersion, tokensIn, tokensOut, latencyMs }`.
- `*.reused`    — the content-hash cache short-circuited the call.
  Lets you see "we saved N calls today" in SQL.
- `*.failed`    — the AI call errored. `payloadJson` carries the
  classification (timeout / rate-limit / parse-error / other).

This is enough to answer the cost questions you actually need to answer
("how many AI calls did billing-signal-extraction make this week, broken
down by hash-hit vs miss?") with one SQL query, without running a
separate observability stack. There is intentionally no Grafana, no
metrics push, no APM agent — those are all line-items on the cost side
of the audit.

The `securityReadiness` route (`GET /api/security/readiness`,
admin-only) reports the live posture (admin allowlist status, upload
caps, all rate limits, body caps, error-sanitization mode) so a quick
smoke test can confirm nothing has regressed.

---

## 8. What this pass changed (4th pass — Cost & Protection)

Concrete diffs:

- **`app.ts`** — `express.json` body cap **50 MB → 2 MB**, and
  `express.urlencoded` gained the same explicit 2 MB cap (was unbounded).
- **`middlewares/rateLimit.ts`** — added `publicReadLimiter`
  (120/min/ip) and `aiTriggerLimiter` (20/10min/ip).
- **`routes/index.ts`** — wired `publicReadLimiter` on
  `GET`/`HEAD /api/public/*` and on `GET`/`HEAD /api/storage/public-objects/*`
  (the latter covers partner-logo / brand-asset streams shown on portal
  pages, closing a bandwidth-exhaustion gap), and `aiTriggerLimiter` on
  `POST /api/partners/:id/(deck|package)-extractions` and
  `POST /api/(deck|package)-extractions/:id/rerun`.
- **`routes/securityReadiness.ts`** — reports the two new limits and
  the body caps so the readiness endpoint reflects reality.
- **`PDF_AI_COST_AUDIT.md`** — added §11 documenting that the
  support/chat AI scope is empty (verified, with evidence).
- **`COST_AND_PROTECTION_AUDIT.md`** — this file.

Verified after the change:

- `POST` of a 3 MB JSON body to `/api/public/partners/:slug/requests`
  returns **HTTP 413** at the body-parser layer (before any handler runs).
- A small JSON `POST` returns **HTTP 400** (validation), confirming the
  cap doesn't false-positive on legitimate bodies.
- `GET /api/public/pricing` returns 200 with `helmet` headers intact.
- TypeScript clean on all four edited files.

---

## 9. What was deliberately NOT done

| Asked for in the spec       | Decision  | Why                                                                                                                              |
| --------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Add Redis cache             | Skipped   | Not needed at this app's scale. PG content-hash + in-memory rate-limit cover the same wins without a second stateful service.    |
| Add pgvector                | Skipped   | No retrieval feature exists in this product. Extension + embedding pipeline = cost without benefit. Revisit when a search feature is actually requested. |
| Build a queue / worker tier | Skipped   | The two long-running flows (PDF parsing, AI summary regenerate) are already fire-and-forget within the api-server; latency is not a current pain point. |
| Build an observability stack | Skipped  | `usage_events` already answers every cost question we have, in plain SQL. APM/metrics agents would be added cost.                 |
| Rip out AI features         | Skipped   | The four remaining AI calls each provide real value the deterministic path can't (prose summaries, messy-PDF normalization).      |

These are not "we forgot" — they are "we chose not to, because the spec
itself said `reliable scaling without overengineering`."

---

## 10. Scaling thresholds — when to add what

Each step below has an **observable trigger**. Add the infrastructure
when (and only when) the trigger fires. Do not add anything earlier "for
future-proofing" — every item on this list has a recurring cost or a new
failure mode, and nothing on this list is needed at the app's current
scale.

### 10.1 Add a shared rate-limit store (Redis-compatible *or* PG-backed)
**Trigger:** the api-server is intentionally run on **more than one
instance** at the same time (horizontal scale-out behind the Replit edge
or a load balancer).

**Why:** today's rate limiters are `express-rate-limit`'s in-memory
buckets. Two instances → each instance has its own bucket → the effective
limit becomes `N × the configured limit`. Once N > 1, the protection
silently weakens proportionally to N.

**Cheapest fix:** `rate-limit-postgres` reuses the existing PG. Real
Redis (Upstash / Replit Redis if/when available) is a small step up if
the rate-limit write traffic ever becomes a hot path on PG.

### 10.2 Add a parse-extraction queue / worker
**Trigger:** any of:
- p95 latency on `POST /api/partners/:id/(deck|package)-extractions`
  exceeds **30 s** in production logs over a 24-hour window, *and*
- `usage_events` shows more than ~50 `*.generated` extraction events per
  day (i.e. enough that the api-server is meaningfully blocked on AI
  inference rather than I/O), *or*
- a single user complains that "uploading a deck hangs the page."

**Why:** the deck/package extractors are pure functions of
`(file_hash, prompt_version, model_tier)`, which means they can be
pulled into a worker without changing semantics. Until the trigger
fires, the current "fire one HTTP request, write the result" path is
simpler, cheaper to operate, and has the right error-surface for an
admin-driven workflow.

**Implementation when needed:** add a `pending_extractions` table
(file_hash, kind, status, attempts, last_error, claimed_at) and a tiny
worker loop. Reuse the existing `lib/aiModels.ts` and the existing
`usage_events` instrumentation as-is.

### 10.3 Add pgvector
**Trigger:** a real product feature is on the roadmap that requires
similarity search — e.g. "find similar specs across all uploaded
packages," "suggest matching products from a vendor's catalog," or
"search the support knowledge base by meaning." Until such a feature
exists, pgvector is unused weight (extension to install, embeddings to
backfill, dimensions to maintain).

**Why not earlier:** there is no retrieval feature in this product
today. Adding pgvector "in case" means choosing an embedding model,
running the embed pipeline on every upload, and paying for embeddings
that nothing reads.

### 10.4 Add a CDN in front of public object reads
**Trigger:** monthly object-storage **egress** cost from
`/api/storage/public-objects/*` becomes the largest line item on the
infra bill, *or* p95 latency for partner-logo image loads on portal
pages exceeds **300 ms** in real-user-monitoring.

**Why:** Replit Object Storage already serves public objects directly;
a CDN only saves the egress fee and shaves last-mile latency. Neither
matters until traffic is high.

### 10.5 Add deeper observability (APM / metrics push / tracing)
**Trigger:** answering a real cost or correctness question by running
SQL against `usage_events` takes **more than ~5 minutes** to write the
query *and* you find yourself running it more than once a week. Until
that's true, the SQL view is strictly cheaper than any APM agent.

**Why not earlier:** every APM/metrics tool has a per-host or per-event
cost. The current `usage_events` table answers "how many AI calls did
billing-signal extraction make this week, broken down by hash-hit vs
miss?" with one query and zero recurring cost. Add an APM only when the
SQL stops being enough — not before.

### 10.6 Add Redis for hot-path caching (response cache, dedupe TTLs)
**Trigger:** the same expensive read is served from PG more than ~10×
per second sustained, *and* PG CPU is visibly responding. Until then,
the existing PG-row content-hash cache (one row per AI result, looked
up by hash) is doing the same job for free.

**Why not earlier:** Redis adds a second stateful service with its own
failure mode and its own bill. The current dedup pattern is "look up
PG row by hash; if present, return; if not, compute and insert," which
is fast, durable, and has no separate operational surface.

---

**Summary of "not yet":** Redis, pgvector, queue workers, CDN, APM —
all of them are documented above with a concrete trigger. None of them
are needed today. The point of this section is to make the upgrade path
obvious when the trigger does fire, *and* to make it cheap to say
"not yet" the next time someone asks "should we add X?"
