/**
 * Exhibitor packages, booths, and orders - the vendor side of the public event
 * landing. Coordinators define exhibitor packages and booth inventory; a vendor
 * on the public page picks one and applies, creating an order with the platform
 * fee computed off the event owner org's plan (charge is wired to the pay rail
 * later). Owner ops are IDOR-gated. Deterministic, no AI. Zero em dashes.
 */
import { q, q1 } from "../pool.js";
import { ForbiddenError, NotFoundError, type Actor } from "../db.js";
import { computePlatformFee } from "../lib/platformFees.js";

async function assertOwnsEvent(actor: Actor, eventId: string): Promise<void> {
  const row = await q1<{ ok: boolean }>(
    `select true as ok from events
      where id = $1
        and ($2 in ('super_admin','admin')
             or ($3::uuid is not null and organization_id = $3)
             or client_id = $4 or planner_id = $4)
      limit 1`,
    [eventId, actor.user.role ?? "", actor.org?.id ?? null, actor.user.id],
  );
  if (!row) throw new ForbiddenError("only the event owner can manage exhibitors");
}

export interface ExhibitorPackage {
  id: string;
  event_id: string;
  name: string;
  price_cents: number;
  quantity: number | null;
  sold: number;
  includes_booth: boolean;
  benefits: string | null;
  is_active: boolean;
  sort_order: number | null;
  created_at: string;
}
export interface Booth {
  id: string;
  event_id: string;
  label: string;
  price_cents: number;
  status: string;
  zone_ref: string | null;
  sort_order: number | null;
  created_at: string;
}

// ---- Packages ---------------------------------------------------------------

export async function listPackages(eventId: string, activeOnly = false): Promise<ExhibitorPackage[]> {
  return q<ExhibitorPackage>(
    `select * from event_exhibitor_packages where event_id = $1 ${activeOnly ? "and is_active = true" : ""}
      order by sort_order asc, created_at asc`,
    [eventId],
  );
}

export async function createPackage(
  actor: Actor,
  eventId: string,
  input: { name: string; price?: number | null; quantity?: number | null; includes_booth?: boolean; benefits?: string | null },
): Promise<ExhibitorPackage> {
  await assertOwnsEvent(actor, eventId);
  if (!input.name) throw new ForbiddenError("package name required");
  const row = await q1<ExhibitorPackage>(
    `insert into event_exhibitor_packages (event_id, name, price_cents, quantity, includes_booth, benefits)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [
      eventId,
      input.name,
      Math.max(0, Math.round(Number(input.price ?? 0) * 100)),
      input.quantity ?? null,
      input.includes_booth ?? false,
      input.benefits ?? null,
    ],
  );
  return row as ExhibitorPackage;
}

export async function updatePackage(
  actor: Actor,
  id: string,
  patch: { name?: string; price?: number | null; quantity?: number | null; includes_booth?: boolean; benefits?: string | null; is_active?: boolean },
): Promise<ExhibitorPackage> {
  const p = await q1<{ event_id: string }>(`select event_id from event_exhibitor_packages where id = $1`, [id]);
  if (!p) throw new NotFoundError("package not found");
  await assertOwnsEvent(actor, p.event_id);
  const priceCents = patch.price != null ? Math.max(0, Math.round(Number(patch.price) * 100)) : null;
  const row = await q1<ExhibitorPackage>(
    `update event_exhibitor_packages set
        name = coalesce($2, name),
        price_cents = coalesce($3, price_cents),
        quantity = coalesce($4, quantity),
        includes_booth = coalesce($5, includes_booth),
        benefits = coalesce($6, benefits),
        is_active = coalesce($7, is_active)
      where id = $1 returning *`,
    [id, patch.name ?? null, priceCents, patch.quantity ?? null, patch.includes_booth ?? null, patch.benefits ?? null, patch.is_active ?? null],
  );
  return row as ExhibitorPackage;
}

export async function deletePackage(actor: Actor, id: string): Promise<boolean> {
  const p = await q1<{ event_id: string }>(`select event_id from event_exhibitor_packages where id = $1`, [id]);
  if (!p) return false;
  await assertOwnsEvent(actor, p.event_id);
  const rows = await q(`delete from event_exhibitor_packages where id = $1 returning id`, [id]);
  return rows.length > 0;
}

// ---- Booths -----------------------------------------------------------------

export async function listBooths(eventId: string, availableOnly = false): Promise<Booth[]> {
  return q<Booth>(
    `select * from event_booths where event_id = $1 ${availableOnly ? "and status = 'available'" : ""}
      order by sort_order asc, created_at asc`,
    [eventId],
  );
}

export async function createBooth(
  actor: Actor,
  eventId: string,
  input: { label: string; price?: number | null; zone_ref?: string | null },
): Promise<Booth> {
  await assertOwnsEvent(actor, eventId);
  if (!input.label) throw new ForbiddenError("booth label required");
  const row = await q1<Booth>(
    `insert into event_booths (event_id, label, price_cents, zone_ref)
     values ($1,$2,$3,$4) returning *`,
    [eventId, input.label, Math.max(0, Math.round(Number(input.price ?? 0) * 100)), input.zone_ref ?? null],
  );
  return row as Booth;
}

export async function deleteBooth(actor: Actor, id: string): Promise<boolean> {
  const b = await q1<{ event_id: string }>(`select event_id from event_booths where id = $1`, [id]);
  if (!b) return false;
  await assertOwnsEvent(actor, b.event_id);
  const rows = await q(`delete from event_booths where id = $1 returning id`, [id]);
  return rows.length > 0;
}

export async function listOrders(actor: Actor, eventId: string): Promise<Record<string, unknown>[]> {
  await assertOwnsEvent(actor, eventId);
  return q<Record<string, unknown>>(
    `select id, contact_name, email, company, package_id, booth_id, amount_cents,
            platform_fee_cents, status, created_at
       from exhibitor_orders where event_id = $1 order by created_at desc limit 1000`,
    [eventId],
  );
}

// ---- Public apply -----------------------------------------------------------

export interface ApplyInput {
  contact_name?: string | null;
  email?: string | null;
  company?: string | null;
  package_id?: string | null;
  booth_id?: string | null;
}
export interface ApplyResult {
  ok: boolean;
  order_id: string;
  status: string;
  amount_cents: number;
  platform_fee_cents: number;
}

/**
 * Public vendor application. Requires contact + email and at least a package or a
 * booth. Computes the amount (package + booth price), the platform fee, holds the
 * booth, and records a pending order. Returns null when the event is not taking
 * vendors (no active packages and no available booths).
 */
export async function applyExhibitor(eventId: string, input: ApplyInput): Promise<ApplyResult | null> {
  const contact = (input.contact_name ?? "").trim();
  const email = (input.email ?? "").trim();
  if (!contact || !email) throw new ForbiddenError("name and email are required");
  if (!input.package_id && !input.booth_id) throw new ForbiddenError("pick a package or a booth");

  let amountCents = 0;

  let pkg: ExhibitorPackage | null = null;
  if (input.package_id) {
    pkg = await q1<ExhibitorPackage>(
      `select * from event_exhibitor_packages where id = $1 and event_id = $2 and is_active = true`,
      [input.package_id, eventId],
    );
    if (!pkg) throw new NotFoundError("package not found");
    amountCents += pkg.price_cents;
  }

  let booth: Booth | null = null;
  if (input.booth_id) {
    booth = await q1<Booth>(
      `select * from event_booths where id = $1 and event_id = $2`,
      [input.booth_id, eventId],
    );
    if (!booth) throw new NotFoundError("booth not found");
    amountCents += booth.price_cents;
  }

  // Reserve inventory atomically BEFORE recording the order so concurrent
  // applications cannot oversell a package or double-book a booth.
  if (pkg) {
    const claimed = await q1<{ id: string }>(
      `update event_exhibitor_packages set sold = sold + 1
        where id = $1 and (quantity is null or sold < quantity)
        returning id`,
      [pkg.id],
    );
    if (!claimed) throw new ForbiddenError("that package is sold out");
  }
  if (booth) {
    const held = await q1<{ id: string }>(
      `update event_booths set status = 'held' where id = $1 and status = 'available' returning id`,
      [booth.id],
    );
    if (!held) {
      // Roll back the package claim if we already took it.
      if (pkg) await q(`update event_exhibitor_packages set sold = greatest(sold - 1, 0) where id = $1`, [pkg.id]);
      throw new ForbiddenError("that booth is no longer available");
    }
  }

  let platformFeeCents = 0;
  if (amountCents > 0) {
    const org = await q1<{ tier: string | null; platform_fee_rate: number | null }>(
      `select o.tier, o.platform_fee_rate from events e join organizations o on o.id = e.organization_id where e.id = $1`,
      [eventId],
    );
    platformFeeCents = computePlatformFee(amountCents, {
      tier: org?.tier ?? null,
      platform_fee_rate: org?.platform_fee_rate ?? null,
    }).platformFeeCents;
  }

  const status = amountCents > 0 ? "pending_payment" : "confirmed";

  const order = await q1<{ id: string }>(
    `insert into exhibitor_orders
       (event_id, contact_name, email, company, package_id, booth_id, amount_cents, platform_fee_cents, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [eventId, contact, email, input.company ?? null, pkg?.id ?? null, booth?.id ?? null, amountCents, platformFeeCents, status],
  );

  return { ok: true, order_id: order?.id ?? "", status, amount_cents: amountCents, platform_fee_cents: platformFeeCents };
}

/** Public list of what a vendor can buy for an event. */
export async function publicExhibitorOffer(eventId: string): Promise<{
  packages: { id: string; name: string; price_cents: number; includes_booth: boolean; benefits: string | null; sold_out: boolean }[];
  booths: { id: string; label: string; price_cents: number }[];
}> {
  const pkgs = await listPackages(eventId, true);
  const booths = await listBooths(eventId, true);
  return {
    packages: pkgs.map((p) => ({
      id: p.id,
      name: p.name,
      price_cents: p.price_cents,
      includes_booth: p.includes_booth,
      benefits: p.benefits,
      sold_out: p.quantity != null && p.sold >= p.quantity,
    })),
    booths: booths.map((b) => ({ id: b.id, label: b.label, price_cents: b.price_cents })),
  };
}
