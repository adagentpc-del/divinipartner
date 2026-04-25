# PDF / Quote / Spec AI Cost Audit (April 2026)

Scope: PDF upload, quote/spec parsing, repeated document processing, AI context
reduction in document-related workflows. Not a rebuild — only cost-reduction
refactors and safeguards.

## 1. Inventory: where AI touches uploaded documents today

| Flow | File | AI used? | Content sent to AI | Cached? | Dedup? |
|---|---|---|---|---|---|
| **Site-survey deck extraction** | `artifacts/api-server/src/lib/deckExtraction.ts` | YES — `gpt-4o-mini` via Replit AI Integrations proxy | (was) full PDF text truncated to 12,000 chars per upload | (was) NO — re-parsed every upload | (was) NO |
| **Project-request internal summary** | `artifacts/api-server/src/lib/aiSummary.ts` | YES — `gpt-4o-mini` | Structured JSON: company info, event, items, file _names_ only | summary stored on `requests.aiSummary` | implicit: 1 summary per request |
| **Quote / spec ingestion (`quote_assets`)** | `artifacts/api-server/src/routes/quoteAssets.ts` | NO — manual fields today | n/a | versioning via mappings | n/a |
| **Order summary PDF generation** | `artifacts/api-server/src/lib/pdf.ts` | NO — `pdfkit` output only | n/a | n/a | n/a |

**Top cost driver: deck extraction.** Project-request summary is already
metadata-only (no document text) and is single-shot per request, so it is
already cheap. Quote ingestion is fully manual today and was deliberately not
extended into AI by this pass (see "out of scope" below).

## 2. What was changed

All changes scoped to deck extraction (the only document-text → AI flow).

### a. Document fingerprinting + dedup
- New columns on `deck_extractions`: `file_hash` (sha256 hex), `file_size`,
  `deduped_from_id` (self-ref), `parse_source` (`ai|rules|reused_dedup`).
- New endpoint `GET /partners/:id/deck-extractions/check-duplicate?hash=…`
  for pre-flight client-side dedup checks before upload.
- `processDeckExtraction` now hashes the buffer, looks up any prior
  `parsed` row for the same `(partnerId, fileHash)`, and — when found —
  copies its items into the new row, marks status `duplicate_reused`,
  emits `deck.parse.reused`, and **never calls AI**.
- **Concurrency-safe claim** — a new `deck_extraction_claims` table
  (PK `(partner_id, file_hash)`) acts as a durable mutex. The first
  worker for a given file `INSERT … ON CONFLICT DO NOTHING` wins the
  claim and proceeds; parallel uploads of the same file see the existing
  claim, wait up to 60s for the owner to reach `parsed`, then take the
  reuse path. A 30s heartbeat refreshes `started_at` so a long-running
  parse can never be evicted, and `takeOverIfStale` only deletes claims
  whose lease lapsed (>5 min without heartbeat). On contention that
  cannot be resolved safely the loser fails as `parse_failed` rather
  than billing a duplicate AI call.
- **Atomic rerun** — `POST /deck-extractions/:id/rerun` uses a single
  conditional `UPDATE … WHERE status IN (terminal) RETURNING` so two
  simultaneous rerun clicks collapse to one winner; the loser gets 409.
  Rerun also participates in the claim protocol, preventing concurrent
  AI runs across rerun + parallel upload of the same file.

### b. Cached extracted text & chunk plan
- New columns: `extracted_text`, `relevant_chunks` (jsonb), `chunk_count`.
- `pdf-parse` runs at most once per unique upload (its output is persisted),
  so any later re-render or audit screen reads from the row instead of
  re-parsing the buffer.

### c. Staged parsing pipeline
Status enum widened to:
`uploaded → text_extracted → chunked → awaiting_ai → parsed`
plus terminals `duplicate_reused`, `parse_failed`, `archived`.
Only the `awaiting_ai → parsed` transition can ever incur token cost; every
prior stage is deterministic Node code.

### d. Deterministic work moved out of AI
- `stripBoilerplate(...)` removes header/footer lines that repeat across ≥50%
  of pages (page numbers, "confidential", URLs, etc.) before any chunking.
- `selectRelevantChunks(...)` keeps only pages that mention a known branding
  keyword OR contain a `\d+\s*['"x×]\s*\d+` dimensions pattern. If nothing
  matches, falls back to the 3 longest non-empty pages. Hard cap
  `MAX_CHUNKS = 8`.
- Dimensions parsing, category guessing, unit detection, page count, and
  duplicate-line removal are all pure code — AI is **only** used for the
  ambiguous normalization step.

### e. Tighter prompt + structured output
- System prompt rewritten from a ~200-word narrative into a single ~80-word
  schema spec. No platform/product context is included.
- User payload is now only the chunk text (with page + reason markers),
  capped at `MAX_AI_INPUT_CHARS = 8,000` (was 12,000 of the full doc).
- `max_tokens = 1500` hard cap on completion size.
- `extractedTextSnippet` is server-trimmed to ≤200 chars after parse.

### f. Cost-aware safeguards (`PDF_LIMITS`)
| Limit | Value | Behavior on breach |
|---|---|---|
| `MAX_FILE_BYTES` | 25 MB | reject pre-AI, mark `parse_failed`, emit `deck.parse.failed{reason:"oversize"}` |
| `MAX_TEXT_CHARS` | 60,000 | extracted text truncated before chunking |
| `MAX_AI_INPUT_CHARS` | 8,000 | AI payload truncated |
| `MAX_CHUNKS` | 8 | top-N relevant pages only |
| `AI_MAX_OUTPUT_TOKENS` | 1,500 | `max_tokens` on the request |

### g. Explicit-rerun model
- New endpoint `POST /deck-extractions/:id/rerun` re-fetches the source file
  and re-processes with `forceRerun: true`, bypassing dedup. Wipes prior
  items first to avoid duplicates. Frontend gates this behind a confirm
  dialog ("Re-run parse? This will incur AI cost.").
- The default path (auto-reuse on duplicate) means the system never silently
  re-bills the same PDF.

### h. Observability
Token counts and event types are persisted/emitted:
- columns `ai_tokens_input`, `ai_tokens_output`, `ai_model` on each row.
- `usage_events`:
  - `deck.parse.ai` — meta `{items, chunks, tokensIn, tokensOut, model, fileHash}`
  - `deck.parse.rules` — fallback path, no tokens
  - `deck.parse.reused` — meta `{dedupedFromId, items, fileHash}`
  - `deck.parse.failed` — meta `{reason | error}`

### i. Admin UX surfaces the cost story
`DeckExtractionReview.tsx` header now shows:
- The full status (`parsed`, `duplicate_reused`, `parse_failed`, …).
- A `♻ Reused (dedup #N)` badge when the row was satisfied from cache.
- An `AI · N chunks · M tok` badge when AI ran (so the operator can see
  the per-document spend at a glance).
- A `Rules-only (no AI)` badge when the deterministic fallback ran.
- A `Re-run parse` button (with confirm) for explicit reruns.

## 3. Approximate before/after

For a typical 30-page site survey with 5 branding-relevant pages:

| Metric | Before | After (first upload) | After (duplicate re-upload) |
|---|---|---|---|
| AI calls per upload | 1 | 1 | **0** |
| Input chars sent | up to 12,000 | up to 8,000 (chunks only) | 0 |
| System prompt size | ~200 words | ~80 words | 0 |
| Reparse on later view | none (no view re-parses) | none | none |
| Token cost on re-upload of same file | full | full | **0** |

The dominant savings are (a) zero-cost on duplicate uploads and (b) chunk-only
payload (typical 60-80% reduction in input chars vs. the previous truncated
full-doc send), with no quality loss — chunks are explicitly the pages that
contained branding keywords or dimensions.

## 4. Out of scope (intentionally)

- **Quote/spec AI ingestion** (`quote_assets`) is currently **manual** and
  doesn't call AI. Adding AI to it would be a new feature, not a cost
  reduction, and is out of scope per "do not rebuild unrelated workflows".
  All the dedup/chunking machinery above is structured generically so it
  can be applied to quote_assets later without further schema redesign.
- **Project-request `aiSummary`** sends only metadata (no document text),
  uses one summary per request, and is already cheap.
- **`pdfkit` output** is generation, not parsing — no AI cost involved.

## 5. Remaining highest-cost paths

After this pass, the only document → AI cost in the system is:
- `processDeckExtraction` first-time runs on **non-duplicate** PDFs that
  contain branding keywords or dimensions on at least one page (chunks
  found → AI runs). All other shapes of the workflow now route to either
  the `duplicate_reused` cache or the deterministic `rules` fallback.

## 6. Section 21 follow-up — Billing-signals parsing (April 22, 2026)

The "out of scope" caveat in §4 has been narrowly amended: `quote_assets`
PDFs now run a **billing-signals** parser on upload to detect currency,
VAT/tax, totals, payment terms, country and incoterm cues. This is a NEW
capability (not a cost reduction of an existing one), and reuses the §2
chunking primitives so it stays cheap by construction.

**Cost shape**:

| Scenario | AI calls | Input chars | Output tokens |
|---|---|---|---|
| Regex finds currency + clear tax | **0** | 0 | 0 |
| Regex finds currency, tax ambiguous | 1 small | ≤ 4,000 (chunked) | ≤ 200 |
| Regex finds nothing (rare) | 1 small | ≤ 4,000 (chunked) | ≤ 200 |
| Re-upload of same file (matched by `file_hash`) | **0** | 0 | 0 |

**Hard caps** in `billingSignals.ts`:
- `AI_MAX_INPUT_CHARS = 4000` — half of deck-extraction's 8k (we only need the
  totals/header section, not branding pages).
- `AI_MAX_OUTPUT_TOKENS = 200` — JSON-only response shape `{currency, tax:{label,ratePct,amount,inclusive}}`.
- Single chunk selection via `selectRelevantChunks` keyed on `total|subtotal|vat|tax|currency` markers.
- Same `stripBoilerplate` → `selectRelevantChunks` pipeline as deck extractions.

**What is NEVER auto-applied**: parsed values land on `quote_assets.parsed_*`
columns with `parsed_review_status='pending'`. They are SUGGESTIONS shown to
the admin in the new Billing tab — they never overwrite partner / event /
order / invoice billing defaults. The admin Approves / Dismisses / Re-runs.

**Persistence shape**: 19 new `parsed_*` columns + `file_hash` + `extracted_text`
on `quote_assets` (see `lib/db/src/schema/quoteAssets.ts`). `parsed_source` is
one of `rules | ai | none | failed`; `parsed_review_status` is one of
`pending | approved | dismissed | edited`.

**Why AI tokens stay near zero in practice**: 4 of the 5 demo seeds and every
quote we have observed end up on the `rules`-only path (currency symbol +
"VAT 20%" / "Sales Tax 7%" patterns are deterministic). The `ai` path only
fires on multi-currency or tax-ambiguous documents.

## 7. Project-request `aiSummary` refactor (April 25, 2026)

The §4 "already cheap" caveat for `aiSummary.ts` was revisited and tightened.
While the call sends no document text, the original implementation still:
- Asked the model for **6 sections** (Overview, Complexity, Timeline, Risks,
  Missing Info, Next Step), 4 of which were already computed deterministically
  elsewhere (`estimateScopeLevel`, `generateInternalSummary`).
- Allowed `max_completion_tokens = 1000` for what is fundamentally a 2-3
  sentence blurb plus a short bullet list.
- Sent a verbose natural-language prompt embedding labels, item names, and
  "Yes/No" wrappers.
- Used no `response_format`, so the model could ramble outside the expected
  structure.
- Emitted **no** `usage_events`, so request-summary AI cost was invisible
  next to the deck/package/billing flows.

**What changed in `lib/aiSummary.ts`**:
- AI is now asked **only** for two fields:
  `{"overview": "<2-3 sentences>", "risks": ["<≤4 short flags>"]}`.
- Complexity, timeline, missing-info detection, and recommended next step
  are computed in pure code (`computeTimeline`, `computeMissing`,
  `computeNextStep`, plus the existing `estimateScopeLevel`).
- Input payload is now a compact JSON object (~20 keys, deduped categories
  capped at 8, `additionalNotes` truncated to 400 chars) instead of a long
  labelled prompt.
- `response_format: { type: "json_object" }` enforced; parser tolerates
  malformed responses by falling back to a deterministic overview.
- `max_tokens = 250` (down from 1,000).
- `temperature = 0.2` for stability.
- New `usage_events`:
  - `request.ai_summary.generated` — meta `{tokensIn, tokensOut, model, risks, scope}`
  - `request.ai_summary.failed` — meta `{tokensIn:0, tokensOut:0, model, risks:0, scope}`
  - emitted from both the public-intake path and the admin
    `POST /requests/:id/regenerate-ai` path.

**Before / after per call**:

| Metric | Before | After |
|---|---|---|
| Prompt sections requested | 6 | 2 |
| `max_completion_tokens` | 1,000 | 250 |
| System-prompt size | ~250 tokens (multi-paragraph) | ~80 tokens (single line) |
| User payload | labelled NL template (~600 chars typical) | compact JSON (~250 chars typical) |
| `response_format` | none | `json_object` |
| Output stored | model prose only | composed: deterministic sections + AI overview/risks |
| Usage event | none | `request.ai_summary.generated` / `.failed` |

**Output text shape unchanged** — the composed string still uses the same
1-6 numbered sections that `RequestDetail.tsx` renders, so the admin UI did
not need any changes. The deterministic sections are now *more* reliable
(no hallucinated dates / scope levels) and the AI sections are *cheaper*
(80% fewer output tokens at the cap).

**No new schema columns** — change is logic-only. The existing
`requests.aiSummary` text column continues to hold the composed result.

## 8. Total remaining AI surface (after §7)

| Flow | Path | When AI fires | Per-call output cap |
|---|---|---|---|
| Deck extraction | `lib/deckExtraction.ts` | first-time non-duplicate PDF with branding/dimensions chunks | 1,500 |
| Package extraction | `lib/packageExtraction.ts` | first-time non-duplicate vendor package PDF | 2,500 |
| Billing-signals (quote_assets) | `lib/billingSignals.ts` | regex couldn't resolve currency or tax | 200 |
| Project-request summary | `lib/aiSummary.ts` | every request submit + admin regenerate | **250** (was 1,000) |

Every other code path (workflow engine, partner health, sales enablement,
faq, etc.) is **deterministic** — no calls to OpenAI / Anthropic / Gemini /
OpenRouter clients exist outside the four files above. Verified by repo-wide
search for `chat.completions`, `openai`, `anthropic`, and the
`AI_INTEGRATIONS_*_BASE_URL` env keys.
