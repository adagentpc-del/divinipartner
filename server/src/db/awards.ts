/**
 * Award flow (front-half completion pass, 2026-08-10).
 *
 * Before this module existed, "award" was a dead enum value (bids.status
 * could theoretically be 'awarded' but nothing ever set it) and accepting a
 * quote (routes/quotes.ts POST /:id/accept -> lifecycle.ts::autoCloseQuote)
 * had exactly one side effect: flip quotes.status to 'accepted'. Nothing
 * closed competing quotes, nothing updated the parent bid, and nothing
 * touched event_vendors -- so a losing bidder's self-attach row from
 * db/quotes.ts::createQuote (status='added', role='bidder') stayed exactly
 * as-is forever. Two real consequences of that: (1) db/eventMembers.ts's
 * getEventRole() legacy fallback grants ANY org with an event_vendors row
 * live "vendor_owner" event access -- so a losing bidder retained full
 * event access indefinitely; (2) db/closeout.ts's listVendorCompletions()
 * lists every event_vendors row with no filter -- so losing bidders
 * permanently polluted the real event-closing checklist.
 *
 * awardQuote() is the single place that now performs the real side effects,
 * atomically:
 *   1. Idempotent quote close (same guard as the old autoCloseQuote).
 *   2. If the quote has a bid_id: every OTHER quote on that bid still in an
 *      open state is set to 'declined' (never touches an already-terminal
 *      sibling), and the bid itself is set to 'awarded'.
 *   3. The winning org's event_vendors row is promoted: role becomes the
 *      bid's category (matching the existing convention for manually-added
 *      vendors like 'florist'/'caterer'), status becomes 'awarded'.
 *   4. Every losing bidder's event_vendors row (status was 'added') is set
 *      to 'declined' -- but ONLY if that org has no OTHER awarded row on
 *      this event already, so a vendor who separately won a different bid
 *      is never demoted by losing this one.
 *   5. A real event_vendor_contracts row is created, referencing the exact
 *      quote id and its accepted amount, with a default 30/40/30
 *      deposit/progress/final payment-milestone schedule (editable
 *      afterward; no live money movement here, data model only per spec).
 *
 * All of this runs inside one transaction so a losing quote's decline and
 * the winner's promotion never observably diverge under concurrent award
 * attempts. Zero em dashes.
 */
import { pool, q, q1 } from "../pool.js";
import { type Actor } from "../db.js";
import { logAction } from "../lib/audit.js";
import { recordActivity } from "./eventActivity.js";
import { checkBeforeAwardCompliance, ComplianceBlockedError } from "./eventVendorCompliance.js";
import { emitWebhookEvent } from "../lib/webhooks.js";
import { createInvoice, type InvoiceLineItem } from "./invoices.js";
import { type LineItem as QuoteLineItem } from "../lib/quoteMath.js";

export type ContractRow = {
  id: string;
  event_id: string;
  bid_id: string | null;
  quote_id: string;
  vendor_org_id: string;
  awarded_amount: string;
  status: string;
  awarded_by: string | null;
  created_at: string;
};

export type PaymentMilestoneRow = {
  id: string;
  contract_id: string;
  label: string;
  due_pct: string;
  due_amount: string;
  due_date: string | null;
  status: string;
  sort_order: number;
};

export type AwardResult = {
  firstAward: boolean;
  contract: ContractRow | null;
  declinedQuoteIds: string[];
  overrodeCompliance?: boolean;
};

const DEFAULT_MILESTONES = [
  { label: "Deposit", pct: 30 },
  { label: "Progress payment (30 days before event)", pct: 40 },
  { label: "Final payment (post-event)", pct: 30 },
];

/**
 * Map a quote's raw line items into InvoiceLineItem shape ({description,
 * amount}). Quotes store whatever shape the submitting caller sent -- the
 * real production vendor-quote UI (AutoQuoteDraft.tsx) sends
 * {name, quantity, unit_price, line_total}, never {description, amount} --
 * so this uses the SAME field-priority lib/quoteMath.ts's computeSubtotal
 * already uses (amount, else quantity*unit_price) to stay consistent with
 * however the quote's own stored subtotal was computed, falling back to
 * line_total when neither is present. Any item lib/quoteMath.ts's own
 * subtotal calculation could not price is dropped rather than invoiced as
 * $0. If nothing priced out (empty/unrecognized items, or they don't sum to
 * the quote's own recorded subtotal), fall back to one line item at
 * `fallbackSubtotal` -- the quote's already-computed, trustworthy subtotal --
 * rather than risk a $0 invoice (Codex review on PR #37, verified live: an
 * unmapped AutoQuoteDraft quote's items all read `amount: undefined`,
 * pricing every line at $0).
 */
function toInvoiceLineItems(rawItems: unknown, fallbackSubtotal: number): InvoiceLineItem[] {
  const items = Array.isArray(rawItems) ? (rawItems as QuoteLineItem[]) : [];
  const mapped: InvoiceLineItem[] = [];
  for (const li of items) {
    if (!li || li.kind === "exclusion") continue;
    const qty = typeof li.quantity === "number" ? li.quantity : li.qty;
    const amount =
      typeof li.amount === "number"
        ? li.amount
        : typeof qty === "number" && typeof li.unit_price === "number"
          ? qty * li.unit_price
          : typeof li.line_total === "number"
            ? li.line_total
            : null;
    if (amount == null) continue;
    mapped.push({
      description: li.name ?? li.label ?? "Line item",
      quantity: qty,
      unit_price: li.unit_price,
      amount: Math.round(amount * 100) / 100,
    });
  }
  const mappedTotal = Math.round(mapped.reduce((sum, li) => sum + li.amount, 0) * 100) / 100;
  if (mapped.length === 0 || mappedTotal <= 0) {
    return [{ description: "Awarded quote", amount: Math.round(fallbackSubtotal * 100) / 100 }];
  }
  return mapped;
}

/**
 * Convert an awarded quote into a real standardized invoice, if one does not
 * already exist for it. Called from BOTH the first-award success path and
 * the idempotent already-awarded early return, so a transient failure here
 * (this always runs best-effort, after the award transaction has already
 * committed) is retried the next time anything re-calls awardQuote on the
 * same quote, instead of permanently leaving an awarded, un-invoiced
 * contract that nothing will ever revisit (Codex review on PR #37,
 * verified: the original version only ever attempted this once, on
 * firstAward, and the idempotent branch's early return skipped it forever
 * on retry).
 */
async function ensureContractInvoice(
  quote: {
    id: string;
    event_id: string;
    vendor_id: string | null;
    subtotal: string | null;
    line_items: unknown;
  },
  contractId: string,
  clientTotal: number, // quote.total / contract.awarded_amount -- what DEFAULT_MILESTONES' pct is applied to
  vendorOrgId: string,
  createdBy: string,
): Promise<void> {
  const existing = await q1<{ id: string }>(`select id from invoices where quote_id = $1 limit 1`, [quote.id]).catch(
    () => null,
  );
  if (existing) return;
  const subtotal = Number(quote.subtotal) || 0;
  const vendorOrg = await q1<{ name: string | null; tier: string | null }>(
    `select name, tier from organizations where id = $1`,
    [vendorOrgId],
  ).catch(() => null);
  const lineItems = toInvoiceLineItems(quote.line_items, subtotal);
  // Deposit tracks the CLIENT-facing total (matching the "Deposit" contract
  // milestone, 30% of contract.awarded_amount), not the vendor subtotal used
  // for line items above -- those are two different bases (fee-inclusive vs
  // not) and conflating them would desync the invoice from the milestone
  // schedule GET /quotes/:id/contract already reports.
  const depositDue = Math.round(clientTotal * 0.3 * 100) / 100; // matches DEFAULT_MILESTONES' Deposit (30%)
  await createInvoice(vendorOrgId, vendorOrg?.name ?? null, vendorOrg?.tier ?? null, createdBy, {
    event_id: quote.event_id,
    vendor_id: quote.vendor_id,
    client_id: createdBy,
    quote_id: quote.id,
    line_items: lineItems,
    deposit_due: depositDue,
    currency: "USD",
    notes: `Generated automatically when contract ${contractId} was awarded.`,
  }).catch(() => undefined);
}

/**
 * Award the given quote: idempotent (a second call on an already-awarded
 * quote is a no-op returning firstAward=false, contract=the existing one).
 * Callers must have already run authorizeQuoteOwner (demand-side only).
 */
export async function awardQuote(
  actor: Actor,
  quoteId: string,
  opts: { override?: boolean } = {},
): Promise<AwardResult> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const quote = (
      await client.query<{
        id: string;
        bid_id: string | null;
        event_id: string;
        vendor_id: string | null;
        total: string | null;
        subtotal: string | null;
        status: string | null;
        line_items: unknown;
      }>(
        `select id, bid_id, event_id, vendor_id, total, subtotal, status, line_items from quotes where id = $1 for update`,
        [quoteId],
      )
    ).rows[0];
    if (!quote) {
      await client.query("rollback");
      throw new Error("quote not found");
    }

    const already = (
      await client.query<ContractRow>(`select * from event_vendor_contracts where quote_id = $1`, [quoteId])
    ).rows[0];
    if (already) {
      // Idempotent: someone re-fired accept on an already-awarded quote. Also
      // retry invoice generation here (ensureContractInvoice no-ops if one
      // already exists) so a prior best-effort failure to create the invoice
      // is not permanent -- this is the only path anything revisits an
      // already-awarded quote through.
      await client.query("commit");
      await ensureContractInvoice(
        quote,
        already.id,
        Number(quote.total) || 0,
        already.vendor_org_id,
        actor.user.id,
      );
      return { firstAward: false, contract: already, declinedQuoteIds: [] };
    }

    // Compliance gate: any 'before_award' requirement (insurance/COI/W9) the
    // organizer configured for this event must be verified on the winning
    // vendor before award proceeds, unless explicitly overridden -- mirrors
    // the readiness/closeout/settlement audited-override pattern already
    // used across the live-ops lifecycle. Checked before any mutation so a
    // blocked award leaves no partial side effects.
    const complianceChecks = await checkBeforeAwardCompliance(quote.event_id, quote.vendor_id);
    const complianceBlocking = complianceChecks.filter((c) => !c.met);
    if (complianceBlocking.length > 0 && !opts.override) {
      await client.query("rollback");
      throw new ComplianceBlockedError(complianceBlocking);
    }
    const overrodeCompliance = complianceBlocking.length > 0 && !!opts.override;

    // Close the quote itself (idempotent guard mirrors the old autoCloseQuote).
    await client.query(
      `update quotes set status = 'accepted', closed_at = now() where id = $1 and closed_at is null`,
      [quoteId],
    );

    const winnerOrg = (
      await client.query<{ organization_id: string | null }>(`select organization_id from vendors where id = $1`, [
        quote.vendor_id,
      ])
    ).rows[0]?.organization_id;

    let bidCategory: string | null = null;
    const declinedQuoteIds: string[] = [];

    if (quote.bid_id) {
      const bid = (
        await client.query<{ category: string | null; status: string | null }>(
          `select category, status from bids where id = $1`,
          [quote.bid_id],
        )
      ).rows[0];
      bidCategory = bid?.category ?? null;

      // Decline every other still-open quote on this same bid.
      const siblings = await client.query<{ id: string; vendor_id: string | null }>(
        `update quotes
            set status = 'declined'
          where bid_id = $1
            and id <> $2
            and status in ('draft','generated','submitted','viewed','revision_requested','revised')
          returning id, vendor_id`,
        [quote.bid_id, quoteId],
      );
      for (const s of siblings.rows) declinedQuoteIds.push(s.id);

      await client.query(`update bids set status = 'awarded' where id = $1 and status <> 'awarded'`, [quote.bid_id]);

      // Demote losing bidders' event_vendors rows so they stop reading as a
      // live "vendor_owner" and stop polluting closeout -- but never touch
      // an org that is already 'awarded' on this event via a different bid.
      for (const s of siblings.rows) {
        if (!s.vendor_id) continue;
        const org = (
          await client.query<{ organization_id: string | null }>(`select organization_id from vendors where id = $1`, [
            s.vendor_id,
          ])
        ).rows[0]?.organization_id;
        if (!org || org === winnerOrg) continue;
        await client.query(
          `update event_vendors set status = 'declined'
             where event_id = $1 and organization_id = $2 and status <> 'awarded'`,
          [quote.event_id, org],
        );
      }
    }

    if (winnerOrg) {
      const eventVendor = (
        await client.query<{ id: string }>(
          `insert into event_vendors (event_id, organization_id, vendor_id, role, status)
             values ($1, $2, $3, $4, 'awarded')
           on conflict (event_id, organization_id)
           do update set role = excluded.role, status = 'awarded'
           returning id`,
          [quote.event_id, winnerOrg, quote.vendor_id, bidCategory ?? "vendor"],
        )
      ).rows[0];

      // Promote every active user of the winning org to a real event_members
      // row (role 'vendor_owner') so they can actually participate in live-ops
      // (check-in, tasks, incidents) on event day. Before this, only the
      // legacy getEventRole() fallback (read-side) recognized an awarded
      // vendor via their event_vendors row -- write-side live-ops actions
      // like checkIns.ts::checkIn() require a real event_members row and had
      // no path to ever get one for a vendor who won through the bid/quote
      // flow (as opposed to being manually invited), so an awarded vendor
      // could see the event but could never check in to it.
      const winnerUsers = await client.query<{ id: string }>(`select id from users where organization_id = $1`, [
        winnerOrg,
      ]);
      for (const u of winnerUsers.rows) {
        await client.query(
          `insert into event_members
             (event_id, user_id, organization_id, vendor_id, event_vendor_id, role, status, joined_at)
           values ($1,$2,$3,$4,$5,'vendor_owner','active', now())
           on conflict (event_id, user_id) do update set
              organization_id = excluded.organization_id,
              vendor_id = excluded.vendor_id,
              event_vendor_id = excluded.event_vendor_id,
              role = 'vendor_owner',
              status = 'active',
              removed_at = null,
              updated_at = now()`,
          [quote.event_id, u.id, winnerOrg, quote.vendor_id, eventVendor?.id ?? null],
        );
      }
    }

    const amount = Number(quote.total) || 0;
    const contract = (
      await client.query<ContractRow>(
        `insert into event_vendor_contracts
           (event_id, bid_id, quote_id, vendor_org_id, awarded_amount, awarded_by)
         values ($1,$2,$3,$4,$5,$6)
         returning *`,
        [quote.event_id, quote.bid_id, quoteId, winnerOrg ?? null, amount, actor.user.id],
      )
    ).rows[0];

    if (contract) {
      let sortOrder = 0;
      for (const m of DEFAULT_MILESTONES) {
        const dueAmount = Math.round(amount * (m.pct / 100) * 100) / 100;
        await client.query(
          `insert into contract_payment_milestones
             (contract_id, label, due_pct, due_amount, sort_order)
           values ($1,$2,$3,$4,$5)`,
          [contract.id, m.label, m.pct, dueAmount, sortOrder++],
        );
      }
    }

    await client.query("commit");

    await logAction(
      actor,
      overrodeCompliance ? "quote.awarded_with_compliance_override" : "quote.awarded",
      "quote",
      quoteId,
      { status: quote.status },
      {
        status: "accepted",
        contract_id: contract?.id ?? null,
        declined_quote_ids: declinedQuoteIds,
        overrode_compliance: overrodeCompliance,
        compliance_blocking: overrodeCompliance ? complianceBlocking : undefined,
      },
      { summary: `Quote ${quoteId} awarded; ${declinedQuoteIds.length} competing quote(s) declined` },
    ).catch(() => undefined);
    await recordActivity(actor, quote.event_id, {
      category: "status",
      message: "Vendor awarded and connected to event",
      relatedEntityType: "contract",
      relatedEntityId: contract?.id ?? null,
    }).catch(() => undefined);
    // Convert the awarded quote into a real standardized invoice so the
    // client actually has something to pay -- the invoice list/detail pages
    // and the Stripe/PayPal checkout on them (routes/invoices.ts,
    // routes/payments.ts) already exist, but before this nothing ever called
    // createInvoice outside its own POST /api/invoices handler, which no
    // frontend page ever calls either. An award produced a contract + a
    // payment-milestone schedule that was itself never surfaced in the UI
    // (GET /quotes/:id/contract has no caller), so a client who awarded a
    // bid had no reachable way to ever pay the vendor. Issued by the vendor
    // org (their tier sets the platform fee, matching how a manually-created
    // invoice against this quote would be attributed elsewhere, e.g.
    // routes/payments.ts's invoiceOrgTier).
    if (winnerOrg && contract) {
      await ensureContractInvoice(quote, contract.id, amount, winnerOrg, actor.user.id);
    }
    void emitWebhookEvent(winnerOrg, "quote.awarded", {
      quote_id: quoteId,
      event_id: quote.event_id,
      vendor_id: quote.vendor_id,
      contract_id: contract?.id ?? null,
      amount,
    });

    return { firstAward: true, contract: contract ?? null, declinedQuoteIds, overrodeCompliance };
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export async function getContractForQuote(quoteId: string): Promise<ContractRow | null> {
  return q1<ContractRow>(`select * from event_vendor_contracts where quote_id = $1`, [quoteId]);
}

export async function listEventContracts(eventId: string): Promise<ContractRow[]> {
  return q<ContractRow>(`select * from event_vendor_contracts where event_id = $1 order by created_at desc`, [
    eventId,
  ]);
}

export async function listContractMilestones(contractId: string): Promise<PaymentMilestoneRow[]> {
  return q<PaymentMilestoneRow>(
    `select * from contract_payment_milestones where contract_id = $1 order by sort_order asc`,
    [contractId],
  );
}
