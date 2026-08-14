# Divini Partners Zapier integration

A real, working Zapier CLI integration (`zapier-platform-core`) for Divini
Partners, built on the public REST API + outbound webhook system in
`server/src/routes/api-keys.ts` and `server/src/routes/webhooks.ts`. It is
**unpublished** -- deploying it to Zapier's marketplace requires a Zapier
developer account and `zapier login`, which this environment does not have
-- but the integration itself is complete, validated, and live-tested
against a real running server.

## What it does

**Authentication**: custom auth with two fields, `baseUrl` (the Divini
Partners deployment URL) and `apiKey` (a `dvp_live_...` key generated at
Profile -> Account -> Developer). Every request sends
`Authorization: Bearer <apiKey>`, exactly like any other API client -- there
is no Zapier-specific auth path on the server.

**Triggers** (all three are real REST Hook triggers, not polling):

| Trigger | Fires on | Server event |
| --- | --- | --- |
| Quote Awarded | a client awards a quote | `quote.awarded` |
| Invoice Paid | an invoice is marked fully paid | `invoice.paid` |
| Event Status Changed | an event moves to a new lifecycle status | `event.status_changed` |

Turning a Zap on calls `performSubscribe`, which registers a real webhook
endpoint (`POST /api/webhooks`) scoped to that one event type and pointed at
Zapier's own callback URL. Turning it off calls `performUnsubscribe`, which
deletes that same endpoint (`DELETE /api/webhooks/:id`). When the server
fires the event, Zapier POSTs the signed payload straight to `perform()`,
which just unwraps the `{ type, created_at, data }` shape
`server/src/lib/webhooks.ts`'s `emitWebhookEvent()` already sends.

## Local validation (already done, repeatable)

```bash
cd integrations/zapier
npm install
./node_modules/.bin/zapier-platform validate   # 0 errors
```

## Live tests (already run against a real server, repeatable)

`test/live.test.js` exercises `authentication.test`, all three triggers'
`performSubscribe`/`performUnsubscribe`, and `perform()`'s payload-unwrapping
against a REAL Divini Partners server -- no mocking. It skips (not fails)
when the env vars below are unset, so `npm test` is always safe to run.

```bash
# 1. Start a disposable server the same way every other phase in this repo's
#    history does (fresh Postgres DB, db/apply-all.sql applied, server on
#    some local port).
# 2. Register a real account and generate a real API key
#    (POST /api/api-keys with a session token) -- see any of this repo's
#    prior live-verification runs for the exact curl sequence.
# 3. Run the tests:
DIVINI_TEST_BASE_URL=http://localhost:8096 \
DIVINI_TEST_API_KEY=dvp_live_... \
npm test
```

All 5 tests pass against a real server as of this writing: auth succeeds
with a real key and fails with a fake one, all three triggers subscribe and
unsubscribe a real webhook endpoint, and `perform()` correctly unwraps a
real delivery payload shape.

## Deploying for real (needs a Zapier developer account)

```bash
cd integrations/zapier
npx zapier-platform login      # opens a browser, needs a Zapier account
npx zapier-platform register "Divini Partners"
npx zapier-platform push       # uploads this version as a private integration
```

A freshly-pushed integration is **private** (visible only to the account
that pushed it and anyone explicitly invited) until it goes through Zapier's
review and promotion process for the public App Directory. Private is enough
for internal use or inviting specific customers immediately.

## Why this is scoped the way it is

The roadmap item this closes ("a real API / webhooks / Zapier app") already
had its highest-leverage piece done first: the REST API and webhook system
itself (moat roadmap Phase 2a), which works with or without Zapier --
anyone can already build a Zap today using Zapier's generic "Webhooks by
Zapier" trigger against `POST /api/webhooks`, no custom integration
required. This app is the added convenience layer (a picker in Zapier's UI
instead of manually configuring a raw webhook URL), which is real value but
strictly smaller in scope than the API/webhook system it depends on.
