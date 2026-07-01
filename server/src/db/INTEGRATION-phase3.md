# Divini Partners - Phase 3 Integration (Event Workspace, Bids, Quotes, Messaging)

Phase 3 ships the Event Workspace, Bid Board, Quotes, and internal Messaging.
All files below are NEW. No existing files were edited. This doc lists every
route, every frontend component + intended route path, the tabs rendered vs
placeholders, and the schema additions, so other phases can wire everything in.

## 1. Server mounts to add (in server/src/routes.ts)

The routes index has commented placeholders. Add these imports + mounts:

```ts
import events from "./routes/events.js";
import bids from "./routes/bids.js";
import quotes from "./routes/quotes.js";
import messages from "./routes/messages.js";

router.use("/events", events);
router.use("/bids", bids);
router.use("/quotes", quotes);
router.use("/messages", messages);
```

(Phase 3 does NOT edit routes.ts itself - it is owned by the integration step.)

## 2. Backend routes (method + full path)

All routes require a signed-in user (router-level `requireUser`).

### Events - base `/api/events`
| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/api/events/meta` | event status list |
| GET  | `/api/events` | list events the actor can access |
| POST | `/api/events` | create event (body: name, type, date_time, guest_count, budget, event_goals, required_services, venue_id) |
| GET  | `/api/events/:id` | event detail |
| PATCH| `/api/events/:id` | patch event fields (owner only) |
| POST | `/api/events/:id/status` | transition lifecycle status (body: { status }) |
| GET  | `/api/events/:id/vendors` | list attached vendors |
| POST | `/api/events/:id/vendors` | attach vendor org (body: { organization_id, vendor_id?, role? }) |
| DELETE | `/api/events/:id/vendors/:eventVendorId` | detach vendor |
| POST | `/api/events/:id/bid-package` | AI bid package built from event data (no fabrication) |

### Bids - base `/api/bids`
| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/api/bids/meta` | bid types + statuses |
| GET  | `/api/bids?category=&rush=` | vendor bid board (tier-access decision attached per row) |
| GET  | `/api/bids/event/:eventId` | all bids on an event (owner view) |
| GET  | `/api/bids/:id` | single bid + tier-access decision for acting org |
| POST | `/api/bids` | post/draft a bid (body: event_id, category, scope, budget_min, budget_max, deadline, bid_type, tier_access, visibility, rush, invited_vendors, post) |
| POST | `/api/bids/:id/invite` | invite vendor orgs (body: { organization_ids: [] }) |
| POST | `/api/bids/:id/status` | transition bid status (body: { status }) |
| POST | `/api/bids/:id/quote` | vendor submits a quote against the bid (tier-access enforced) |

### Quotes - base `/api/quotes`
| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/api/quotes/meta` | quote status list |
| GET  | `/api/quotes/event/:eventId` | quotes on an event |
| GET  | `/api/quotes/bid/:bidId?event_id=` | quotes on a bid |
| POST | `/api/quotes` | create/generate a quote (body: bid_id?, event_id?, vendor_id?, line_items[], expiration_date?, submit?) |
| GET  | `/api/quotes/:id` | raw quote |
| GET  | `/api/quotes/:id/standardized` | standardized quote payload (Divini + vendor brand, grouped line items, fee, total, actions) |
| PATCH| `/api/quotes/:id` | revise (recomputes totals) |
| POST | `/api/quotes/:id/submit` | submit |
| POST | `/api/quotes/:id/accept` | accept |
| POST | `/api/quotes/:id/decline` | decline |
| POST | `/api/quotes/:id/request-revision` | request revision |

### Messages - base `/api/messages`
| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/api/messages/meta` | thread types + visibility scopes |
| GET  | `/api/messages/event/:eventId/threads` | grouped threads with counts |
| GET  | `/api/messages/event/:eventId` | messages (visibility-filtered for viewer) |
| POST | `/api/messages` | post message (body: event_id, body, thread_type?, thread_ref?, visibility?, recipients?, attachments?) |
| POST | `/api/messages/:id/read` | mark read |

### Notifications
`server/src/lib/notify.ts` - stub that logs intended emails (`[notify:stub] ...`).
Replace the body of `deliver()` with the real email/resend infra later; call
sites already use `notify.bidPosted / bidInvited / quoteSubmitted / quoteDecision
/ messagePosted / eventStatusChanged`.

## 3. Frontend components + intended route paths

Add to the SPA router (App.tsx is owned by integration, do not edit in Phase 3):

| Component | File | Intended route |
|-----------|------|----------------|
| EventsList | `src/pages/events/EventsList.tsx` | `/events` |
| EventWorkspace | `src/pages/event/EventWorkspace.tsx` | `/events/:id` |
| BidBoard | `src/pages/bids/BidBoard.tsx` | `/bids` |

Workspace tab components (used only inside EventWorkspace, not routed directly):
`src/pages/event/tabs/{OverviewTab,VendorsTab,BidsTab,QuotesTab,MessagesTab,DocumentsTab,NotesTab}.tsx`

All take `{ eventId: string }` and default-export. They only import
react / react-router-dom + `../../lib/api` (apiGet, apiSend). Styles are
self-contained `<style>` blocks (emerald #123c2e/#1E5D4A, gold #C9A35B, ivory,
Cormorant Garamond + Inter). No em dashes anywhere.

## 4. Tab keys rendered vs placeholders (blueprint 13.1)

EventWorkspace renders all 20 tabs as `{key,label,element}`. Tabs filled by
Phase 3 vs left as `Placeholder` ("Coming in this workspace") for other phases:

| Tab key | Status | Owner |
|---------|--------|-------|
| overview | FULL | Phase 3 |
| venue | placeholder | (venue phase) |
| vendors | FULL | Phase 3 |
| bids | FULL | Phase 3 |
| quotes | FULL | Phase 3 |
| inventory | placeholder | (inventory phase) |
| guest_list | placeholder | Phase 6 |
| seating_chart | placeholder | Phase 6 |
| floorplans | placeholder | Phase 6 |
| timeline | placeholder | Phase 6 |
| tasks | placeholder | Phase 6 |
| itinerary | placeholder | Phase 6 |
| documents | FULL | Phase 3 |
| messages | FULL | Phase 3 |
| invoices | placeholder | Phase 5 |
| payments | placeholder | Phase 5 |
| change_orders | placeholder | Phase 5 |
| reviews | placeholder | (reviews phase) |
| notes | FULL | Phase 3 |
| support | placeholder | (support phase) |

A later phase replaces a `Placeholder` by swapping the `element` for that tab
key in `EventWorkspace.tsx` (import its own tab file - do not import across
phases).

## 5. Schema additions (db/schema-phase3.sql)

Additive only, apply AFTER db/schema.sql:

- NEW table `event_vendors` (event_id, organization_id, vendor_id, role, status;
  unique on (event_id, organization_id)) - workspace participants.
- `bids.bid_type text` - public/private/preferred/premier/rush/venue/planner.
- `bids.posted_at timestamptz` - tier-access windows count from here.
- `messages.thread_ref text` + index `idx_messages_thread` - the bid/quote/
  invoice a thread is about.

Apply: `psql "<url>" -f db/schema-phase3.sql`

## 6. Tier-access windows (blueprint 17)

`canVendorAccessBid(bid, vendorOrgTier, now, vendorOrgId)` in
`server/src/db/bids.ts`:
- 0 to 48h after posting -> Premier only
- 48h to 7d -> Partner + Premier
- after 7d -> all tiers
- private bid -> only orgs in `invited_vendors`
- drafts -> nobody; clients -> never (cannot bid)

Returns `{ allowed, reason }`. The Bid Board visualizes the reason per card.
