# Live-Ops Realtime Strategy Audit (Part 40-44, 2026-08-09)

## Current state (audited, not assumed)

Every live-ops surface built across Parts 1-39 (Command Center, the
Activity Timeline, Incidents, Event Inventory, Sponsor Activation,
Closeout, Reconciliation, Post-Event Report, and the mobile Event Day
Mode) is **pull-only**. A grep of `src/pages/event/` and the server
routing layer for `setInterval`, `WebSocket`, `EventSource`, and
`socket.io` turns up exactly one hit: `EventDayMode.tsx`'s 30-second
`setInterval`, which only ticks a local clock (`setNow(Date.now())`) to
keep the "happening now" itinerary highlight accurate — it does not
refetch any data from the server. Every other tab loads once on mount
and only refreshes when the user takes an explicit action (a manual
"Refresh" button, a tab switch, or any write that calls its own
`load()`).

There is no WebSocket server, no Server-Sent Events endpoint, and no
polling loop anywhere in this codebase for live-ops data. This is
consistent with the rest of the platform — no other feature area (Bids,
Quotes, Messages) has a push channel either.

## Where staleness actually matters

Not every surface needs realtime. Ranked by how much a stale view could
cause a real operational miss during a live event:

1. **Command Center** (`event_command_center`) — the single-screen
   overview an owner/planner/venue is expected to glance at throughout
   the event. A stale vendor-arrival or incident count here is the
   highest-cost staleness in the whole system: someone could look at the
   screen, see "0 open incidents," and miss one reported 90 seconds ago
   by someone else on the team.
2. **Incidents** — a newly reported high-severity incident should reach
   the people who can act on it as fast as possible; right now it only
   surfaces on someone else's next manual refresh.
3. **Activity Timeline** — lower stakes (it's a log, not an action
   queue), but still the shared "what's happening" feed multiple roles
   watch simultaneously.
4. **Sponsor Activation / Event Inventory / Closeout checklist** — lower
   urgency; these are typically checked deliberately (before a status
   change), not glanced at continuously, so pull-on-demand is a
   reasonable fit already.

## Recommendation (not implemented in this pass)

Given the size of what "Do not fabricate" already rules out — this audit
does **not** stand up new WebSocket/SSE infrastructure, since that is a
substantial cross-cutting addition (connection lifecycle, auth over the
socket, reconnection/backoff, and a server-side pub/sub fan-out that
does not exist anywhere in this codebase today) that deserves its own
dedicated build, not a bolt-on inside a QA pass. The honest, scoped
recommendation for a future slice:

- **Short term, low-risk**: add a bounded client-side polling interval
  (e.g. 15-30s) to the Command Center and Incidents tabs only, matching
  the cadence EventDayMode's clock tick already uses, reusing each tab's
  existing `load()` function — no new backend surface required, since
  every endpoint these tabs already call is cheap, idempotent, and
  already resolves live from the database (Part 1-39's whole design
  discipline: "nothing is a stored counter, always computed fresh").
  This closes most of the real staleness gap above with the least new
  surface area.
- **Longer term**: a single Server-Sent Events endpoint per event
  (`GET /api/event-command-center/event/:id/stream`) that re-pushes the
  same `CommandCenterProjection` payload on a server-side interval or on
  a write-triggered nudge, reusing the exact same authorization and
  projection logic already in `db/eventCommandCenter.ts` — no parallel
  computation path. This is a real architectural change (needs an
  SSE-aware response, a keep-alive strategy, and reverse-proxy timeout
  settings verified) and should be scoped and built as its own item
  rather than assumed working here.

## What this pass DID do

Rather than build unverified realtime infrastructure, this pass
prioritized the two things that are independently verifiable right now:
concurrency correctness of the write paths that already exist (below,
Part 42) and a consolidated adversarial security re-pass across the
live-ops routes shipped in Parts 1-39 (Part 43).
