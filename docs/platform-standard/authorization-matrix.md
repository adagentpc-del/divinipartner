# Authorization Matrix

Resource / action -> enforcement point, for the platform's application-layer
authorization model (no Postgres RLS; see `section-05-authorization.md`).
Not exhaustive of every route — covers the resource classes that carry
tenant/ownership boundaries. Built from live testing + code audit in
Section 05.

## Core primitive

Every authenticated route resolves:

```
actor = await db.getActor(auth.userId, auth.email)
// actor.user  -> the verified session's user row
// actor.org   -> the user's ACTIVE organization (server-resolved join,
//                never client-selected except via the membership-checked
//                /orgs/switch endpoint)
```

`auth.userId` / `auth.email` come only from the verified session JWT
(`getAuth(req)`), never from the request body or query string.

## Matrix

| Resource | Read enforcement | Write enforcement | Cross-tenant tested? |
|---|---|---|---|
| Events | `actorCanSee()`: org match, named client/planner, or attached vendor org, or admin | `actorOwns()`: org match or named client/planner, or admin | Yes — 403 on read/write/status/vendor-attach |
| Bids | `actorOwnsBidEvent()` via the parent event's ownership | same | Yes — 403 on invite + status change |
| Quotes | `authorizeQuoteAccess()` (delegates to event ownership/visibility) | same | Yes — 403 on read/PDF/write |
| Invoices | `getInvoice(actor.org.id, id)` — id lookup pre-scoped by org | same pattern for status updates | Yes — 404 (not found) on cross-org read, absent from list |
| Signatures / signed PDFs | `isParty = actor.org.id === row.organization_id \|\| row.signer_user_id === actor.user.id` | n/a (signature records are append-only once signed) | Code-audited (403 path); not separately live-tested this pass (pattern identical to events/quotes, already proven live) |
| Profile decks (uploaded files) | `extras.getDeck(actor.org.id, id)` — org-scoped lookup, 404 on mismatch | `extras.updateDeck(actor.org.id, id)` / `deleteDeck(...)` same pattern | Code-audited |
| Org switching | `organization_memberships` row must exist for `(user_id, organization_id)` | n/a | Yes — 403 `not a member of that organization` on forged id |
| Admin routes | `requireAdmin`: `auth.isAdmin` computed server-side from `ADMIN_ALLOWED_EMAILS`, plus mandatory TOTP enrollment check | same | Retested this section (S04 originally proved a forged `isAdmin` claim is impossible; S05 re-confirmed no route trusts a client role/isAdmin field) |
| Public profile pages / public deck downloads | Explicit separate route family (`/public/:slug/...`), only serves published + public-visibility rows, no auth | n/a (read-only, intentionally public) | By design — not a leak, verified the private routes are genuinely separate code paths, not a shared handler with a bypassable flag |

## Admin impersonation / "view as"

Does not exist in this codebase (confirmed by code search, Section 05). No
enforcement point to document; nothing to test.

## Row-Level Security

Not used. All rows in every multi-tenant table (`events`, `bids`, `quotes`,
`invoices`, `event_vendors`, decks, signatures, etc.) are reachable by any
DB-level connection; the boundary is enforced entirely in the route/db-layer
code documented above. This is an accepted architectural choice for this
codebase (single application-layer trust boundary, no direct client DB
access ever exists) — not a gap by itself, but it does mean every new
org-scoped table/route must remember to add the same `actor.org.id` scoping
by hand. There is no defense-in-depth safety net at the database layer.
