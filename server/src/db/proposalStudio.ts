/**
 * Divini Proposal Studio (docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md, build-order
 * slice 3). Converts a Divini Pipeline opportunity (optionally informed by a
 * Divini Scope Builder instance) into a clear, professional proposal:
 * deterministic line-item totals, a public share link, and accept/decline
 * tracking. No LLM, no generated pricing -- totals are pure arithmetic on
 * numbers the user entered (spec constraint 6: never fabricate).
 *
 * Every save (line items, discount/tax, status transition) appends a new
 * proposal_versions row rather than overwriting prior state (spec
 * constraint 9).
 */
import { randomBytes } from "node:crypto";
import { pool, q, q1 } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { getOpportunity } from "./pipeline.js";
import { logSystemEvent } from "./pipeline.js";
import { getInstance as getScopeInstance } from "./scopeBuilder.js";

function assertOrgAccess(actor: Actor): string {
  if (!actor.org) throw new ForbiddenError("register an organization first");
  return actor.org.id;
}

function newShareToken(): string {
  return randomBytes(12).toString("base64url");
}

export type ProposalRow = {
  id: string;
  organization_id: string;
  opportunity_id: string | null;
  scope_instance_id: string | null;
  title: string;
  client_name: string | null;
  client_email: string | null;
  status: "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired";
  currency: string;
  discount_cents: string;
  tax_cents: string;
  valid_until: string | null;
  notes: string | null;
  decline_reason: string | null;
  share_token: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  responded_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LineItemRow = {
  id: string;
  proposal_id: string;
  description: string;
  quantity: string;
  unit_price_cents: string;
  sort_order: number;
};

export type LineItemInput = { description: string; quantity: number; unit_price_cents: number };

export type Totals = { subtotal_cents: number; discount_cents: number; tax_cents: number; total_cents: number };

function computeTotals(items: { quantity: string | number; unit_price_cents: string | number }[], discountCents: number, taxCents: number): Totals {
  const subtotal = items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_price_cents), 0);
  const subtotal_cents = Math.round(subtotal);
  const total_cents = Math.max(0, subtotal_cents - discountCents + taxCents);
  return { subtotal_cents, discount_cents: discountCents, tax_cents: taxCents, total_cents };
}

export type ProposalDetail = { proposal: ProposalRow; line_items: LineItemRow[]; totals: Totals; version_count: number };

async function lineItemsFor(proposalId: string): Promise<LineItemRow[]> {
  return q<LineItemRow>(
    `select * from proposal_line_items where proposal_id = $1 order by sort_order asc`,
    [proposalId],
  );
}

async function snapshotFor(proposal: ProposalRow, items: LineItemRow[]): Promise<Record<string, unknown>> {
  return {
    title: proposal.title,
    client_name: proposal.client_name,
    client_email: proposal.client_email,
    status: proposal.status,
    discount_cents: Number(proposal.discount_cents),
    tax_cents: Number(proposal.tax_cents),
    valid_until: proposal.valid_until,
    notes: proposal.notes,
    line_items: items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unit_price_cents: Number(i.unit_price_cents) })),
  };
}

async function appendVersion(client: import("pg").PoolClient, proposalId: string, snapshot: unknown, actorUserId: string | null): Promise<void> {
  const nextVersion = (
    await client.query(
      `select coalesce(max(version_number), 0) + 1 as n from proposal_versions where proposal_id = $1`,
      [proposalId],
    )
  ).rows[0].n as number;
  await client.query(
    `insert into proposal_versions (proposal_id, version_number, snapshot_json, created_by)
     values ($1,$2,$3,$4)`,
    [proposalId, nextVersion, JSON.stringify(snapshot), actorUserId],
  );
}

export async function listProposals(
  actor: Actor,
  filters: { opportunityId?: string; status?: string } = {},
): Promise<ProposalRow[]> {
  const orgId = assertOrgAccess(actor);
  const where: string[] = ["organization_id = $1"];
  const params: unknown[] = [orgId];
  if (filters.opportunityId) {
    params.push(filters.opportunityId);
    where.push(`opportunity_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }
  return q<ProposalRow>(
    `select * from proposals where ${where.join(" and ")} order by updated_at desc limit 500`,
    params,
  );
}

async function assertProposalAccess(actor: Actor, id: string): Promise<ProposalRow> {
  const orgId = assertOrgAccess(actor);
  const row = await q1<ProposalRow>(`select * from proposals where id = $1 and organization_id = $2`, [id, orgId]);
  if (!row) throw new NotFoundError("proposal not found");
  return row;
}

export async function getProposal(actor: Actor, id: string): Promise<ProposalDetail> {
  const proposal = await assertProposalAccess(actor, id);
  const items = await lineItemsFor(id);
  const totals = computeTotals(items, Number(proposal.discount_cents), Number(proposal.tax_cents));
  const versionCount = await q1<{ n: string }>(`select count(*)::text as n from proposal_versions where proposal_id = $1`, [id]);
  return { proposal, line_items: items, totals, version_count: Number(versionCount?.n ?? 0) };
}

export type ProposalInput = {
  title: string;
  opportunity_id?: string | null;
  scope_instance_id?: string | null;
  client_name?: string | null;
  client_email?: string | null;
  valid_until?: string | null;
  notes?: string | null;
  discount_cents?: number;
  tax_cents?: number;
  line_items?: LineItemInput[];
};

export async function createProposal(actor: Actor, input: ProposalInput): Promise<ProposalDetail> {
  const orgId = assertOrgAccess(actor);
  const title = input.title.trim();
  if (!title) throw new Error("title is required");
  if (input.opportunity_id) await getOpportunity(actor, input.opportunity_id); // 404/org-scope check
  if (input.scope_instance_id) await getScopeInstance(actor, input.scope_instance_id); // 404/org-scope check

  const client = await pool.connect();
  try {
    await client.query("begin");
    const proposal = (
      await client.query(
        `insert into proposals
           (organization_id, opportunity_id, scope_instance_id, title, client_name, client_email,
            discount_cents, tax_cents, valid_until, notes, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         returning *`,
        [
          orgId,
          input.opportunity_id ?? null,
          input.scope_instance_id ?? null,
          title,
          input.client_name ?? null,
          input.client_email ?? null,
          Math.max(0, Math.round(input.discount_cents ?? 0)),
          Math.max(0, Math.round(input.tax_cents ?? 0)),
          input.valid_until ?? null,
          input.notes ?? null,
          actor.user.id,
        ],
      )
    ).rows[0] as ProposalRow;

    const items = input.line_items ?? [];
    for (let i = 0; i < items.length; i++) {
      const li = items[i];
      if (!li.description?.trim()) continue;
      await client.query(
        `insert into proposal_line_items (proposal_id, description, quantity, unit_price_cents, sort_order)
         values ($1,$2,$3,$4,$5)`,
        [proposal.id, li.description.trim(), li.quantity ?? 1, Math.max(0, Math.round(li.unit_price_cents ?? 0)), i],
      );
    }

    const savedItems = (await client.query(`select * from proposal_line_items where proposal_id = $1 order by sort_order asc`, [proposal.id])).rows as LineItemRow[];
    await appendVersion(client, proposal.id, await snapshotFor(proposal, savedItems), actor.user.id);
    await client.query("commit");
    return getProposal(actor, proposal.id);
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

export type ProposalPatch = {
  title?: string;
  client_name?: string | null;
  client_email?: string | null;
  valid_until?: string | null;
  notes?: string | null;
  discount_cents?: number;
  tax_cents?: number;
};

/** Update header fields and/or replace the line-item set in one transaction,
 *  then append a version snapshot (spec constraint 9: append, never overwrite
 *  the revision history -- the *current* row is updated, but the version log
 *  keeps every prior state). */
export async function saveProposal(
  actor: Actor,
  id: string,
  patch: ProposalPatch,
  lineItems?: LineItemInput[],
): Promise<ProposalDetail> {
  const existing = await assertProposalAccess(actor, id);
  const orgId = assertOrgAccess(actor);

  const client = await pool.connect();
  try {
    await client.query("begin");
    const updated = (
      await client.query(
        `update proposals set
           title = coalesce($3, title),
           client_name = coalesce($4, client_name),
           client_email = coalesce($5, client_email),
           valid_until = coalesce($6, valid_until),
           notes = coalesce($7, notes),
           discount_cents = coalesce($8, discount_cents),
           tax_cents = coalesce($9, tax_cents),
           updated_at = now()
         where id = $1 and organization_id = $2
         returning *`,
        [
          id,
          orgId,
          patch.title?.trim() || null,
          patch.client_name ?? null,
          patch.client_email ?? null,
          patch.valid_until ?? null,
          patch.notes ?? null,
          patch.discount_cents != null ? Math.max(0, Math.round(patch.discount_cents)) : null,
          patch.tax_cents != null ? Math.max(0, Math.round(patch.tax_cents)) : null,
        ],
      )
    ).rows[0] as ProposalRow;

    if (lineItems) {
      await client.query(`delete from proposal_line_items where proposal_id = $1`, [id]);
      for (let i = 0; i < lineItems.length; i++) {
        const li = lineItems[i];
        if (!li.description?.trim()) continue;
        await client.query(
          `insert into proposal_line_items (proposal_id, description, quantity, unit_price_cents, sort_order)
           values ($1,$2,$3,$4,$5)`,
          [id, li.description.trim(), li.quantity ?? 1, Math.max(0, Math.round(li.unit_price_cents ?? 0)), i],
        );
      }
    }

    const items = (await client.query(`select * from proposal_line_items where proposal_id = $1 order by sort_order asc`, [id])).rows as LineItemRow[];
    await appendVersion(client, id, await snapshotFor(updated, items), actor.user.id);
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
  return getProposal(actor, id);
}

export async function listVersions(actor: Actor, id: string) {
  await assertProposalAccess(actor, id);
  return q(`select * from proposal_versions where proposal_id = $1 order by version_number desc`, [id]);
}

/** Send: requires a client email and at least one line item. Mints a public
 *  share token (idempotent -- reuses an existing one) and logs a Pipeline
 *  activity on the linked opportunity, if any. */
export async function sendProposal(actor: Actor, id: string): Promise<ProposalRow> {
  const proposal = await assertProposalAccess(actor, id);
  const orgId = assertOrgAccess(actor);
  if (!proposal.client_email) {
    const err = new Error("Add a client email before sending.") as Error & { status: number };
    err.status = 400;
    throw err;
  }
  const items = await lineItemsFor(id);
  if (items.length === 0) {
    const err = new Error("Add at least one line item before sending.") as Error & { status: number };
    err.status = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    const token = proposal.share_token ?? newShareToken();
    const updated = (
      await client.query(
        `update proposals set status = 'sent', sent_at = now(), share_token = $3, updated_at = now()
         where id = $1 and organization_id = $2
         returning *`,
        [id, orgId, token],
      )
    ).rows[0] as ProposalRow;
    await appendVersion(client, id, await snapshotFor(updated, items), actor.user.id);
    await client.query("commit");

    if (updated.opportunity_id) {
      await logSystemEvent(orgId, updated.opportunity_id, `Proposal "${updated.title}" sent`).catch(() => undefined);
    }
    return updated;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

// ---- Public (no-auth) surface ----------------------------------------------

export type PublicProposal = {
  title: string;
  client_name: string | null;
  status: string;
  currency: string;
  valid_until: string | null;
  notes: string | null;
  line_items: { description: string; quantity: number; unit_price_cents: number }[];
  totals: Totals;
};

const PUBLIC_VISIBLE_STATUSES = new Set(["sent", "viewed", "accepted", "declined"]);

/** Resolve the public payload for a share token; records a first view
 *  (sent -> viewed) but never regresses an accepted/declined status. */
export async function getPublicProposalByToken(token: string): Promise<PublicProposal | null> {
  const proposal = await q1<ProposalRow>(`select * from proposals where share_token = $1`, [token]);
  if (!proposal || !PUBLIC_VISIBLE_STATUSES.has(proposal.status)) return null;

  if (proposal.status === "sent") {
    await q(`update proposals set status = 'viewed', viewed_at = now() where id = $1`, [proposal.id]);
    proposal.status = "viewed";
  }

  const items = await lineItemsFor(proposal.id);
  const totals = computeTotals(items, Number(proposal.discount_cents), Number(proposal.tax_cents));
  return {
    title: proposal.title,
    client_name: proposal.client_name,
    status: proposal.status,
    currency: proposal.currency,
    valid_until: proposal.valid_until,
    notes: proposal.notes,
    line_items: items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unit_price_cents: Number(i.unit_price_cents) })),
    totals,
  };
}

/** Public accept/decline. Only valid from sent/viewed; returns null for an
 *  unknown token or an already-resolved proposal so the caller can 404/409
 *  without leaking which. */
export async function respondToProposal(
  token: string,
  decision: "accept" | "decline",
  declineReason?: string | null,
): Promise<{ status: string } | null> {
  const proposal = await q1<ProposalRow>(`select * from proposals where share_token = $1`, [token]);
  if (!proposal) return null;
  if (proposal.status !== "sent" && proposal.status !== "viewed") return null;

  const nextStatus = decision === "accept" ? "accepted" : "declined";
  const client = await pool.connect();
  try {
    await client.query("begin");
    const updated = (
      await client.query(
        `update proposals set status = $2, responded_at = now(), decline_reason = $3, updated_at = now()
         where id = $1 returning *`,
        [proposal.id, nextStatus, decision === "decline" ? declineReason ?? null : null],
      )
    ).rows[0] as ProposalRow;
    const items = await lineItemsFor(proposal.id);
    await appendVersion(client, proposal.id, await snapshotFor(updated, items), null);
    await client.query("commit");

    if (updated.opportunity_id) {
      const label = nextStatus === "accepted" ? "accepted" : "declined";
      await logSystemEvent(updated.organization_id, updated.opportunity_id, `Proposal "${updated.title}" ${label}`).catch(() => undefined);
    }
    return { status: nextStatus };
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
