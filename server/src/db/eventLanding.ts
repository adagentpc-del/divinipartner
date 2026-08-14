/**
 * Universal Event Landing - data layer.
 *
 * Every event can publish a public landing page: the coordinator chooses free or
 * ticketed attendance (with tiers), and whether to show a "Become a vendor" CTA.
 * Attendee registration is public; ticket orders reuse the platform fee. Owner
 * management is IDOR-gated to the event owner.
 *
 * Deterministic, no AI. Zero em dashes.
 */
import { q, q1 } from "../pool.js";
import { ForbiddenError, NotFoundError, type Actor } from "../db.js";
import { computePlatformFee } from "../lib/platformFees.js";

export type AttendMode = "off" | "free" | "ticketed";

export interface SponsorEntry {
  name: string;
  logo_url: string | null;
  link_url: string | null;
}

export interface FaqEntry {
  question: string;
  answer: string;
}

export interface LandingSettings {
  event_id: string;
  attend_mode: AttendMode;
  vendor_cta_enabled: boolean;
  headline: string | null;
  description: string | null;
  hero_image_url: string | null;
  logo_url: string | null;
  sponsors: SponsorEntry[];
  faq: FaqEntry[];
  updated_at: string | null;
}

/** Only http(s) URLs are accepted for a display image -- rejects javascript:/data:
 *  and anything else that isn't a plain remote image link. */
function normImageUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed.slice(0, 2000) : null;
}

function normSponsors(v: unknown): SponsorEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({
      name: typeof s.name === "string" ? s.name.trim().slice(0, 200) : "",
      logo_url: normImageUrl(s.logo_url),
      link_url: normImageUrl(s.link_url),
    }))
    .filter((s) => s.name.length > 0)
    .slice(0, 100);
}

function normFaq(v: unknown): FaqEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({
      question: typeof f.question === "string" ? f.question.trim().slice(0, 300) : "",
      answer: typeof f.answer === "string" ? f.answer.trim().slice(0, 3000) : "",
    }))
    .filter((f) => f.question.length > 0 && f.answer.length > 0)
    .slice(0, 100);
}

export interface TicketTier {
  id: string;
  event_id: string;
  name: string;
  price_cents: number;
  quantity: number | null;
  sold: number;
  is_active: boolean;
  sort_order: number | null;
  created_at: string;
}

function normMode(v: unknown): AttendMode {
  return v === "off" || v === "free" || v === "ticketed" ? v : "free";
}

/** Throw unless the actor owns this event (org, client, or planner). */
export async function assertOwnsEvent(actor: Actor, eventId: string): Promise<void> {
  const row = await q1<{ ok: boolean }>(
    `select true as ok from events
      where id = $1
        and ($2 in ('super_admin','admin')
             or ($3::uuid is not null and organization_id = $3)
             or client_id = $4 or planner_id = $4)
      limit 1`,
    [eventId, actor.user.role ?? "", actor.org?.id ?? null, actor.user.id],
  );
  if (!row) throw new ForbiddenError("only the event owner can manage the public page");
}

// ---- Settings ---------------------------------------------------------------

export async function getSettings(eventId: string): Promise<LandingSettings> {
  const row = await q1<LandingSettings>(
    `select event_id, attend_mode, vendor_cta_enabled, headline, description,
            hero_image_url, logo_url, sponsors, faq, updated_at
       from event_landing_settings where event_id = $1`,
    [eventId],
  );
  if (row) return row;
  // Default (unsaved) settings so the UI has something to render. attend_mode is
  // 'off' until the coordinator opts in, so an event that never configured a
  // public page does NOT accept public registrations.
  return {
    event_id: eventId,
    attend_mode: "off",
    vendor_cta_enabled: true,
    headline: null,
    description: null,
    hero_image_url: null,
    logo_url: null,
    sponsors: [],
    faq: [],
    updated_at: null,
  };
}

export async function upsertSettings(
  actor: Actor,
  eventId: string,
  patch: {
    attend_mode?: string;
    vendor_cta_enabled?: boolean;
    headline?: string | null;
    description?: string | null;
    hero_image_url?: string | null;
    logo_url?: string | null;
    sponsors?: unknown;
    faq?: unknown;
  },
): Promise<LandingSettings> {
  await assertOwnsEvent(actor, eventId);
  const row = await q1<LandingSettings>(
    `insert into event_landing_settings
       (event_id, attend_mode, vendor_cta_enabled, headline, description,
        hero_image_url, logo_url, sponsors, faq, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb, now())
     on conflict (event_id) do update set
        attend_mode = excluded.attend_mode,
        vendor_cta_enabled = excluded.vendor_cta_enabled,
        headline = excluded.headline,
        description = excluded.description,
        hero_image_url = excluded.hero_image_url,
        logo_url = excluded.logo_url,
        sponsors = excluded.sponsors,
        faq = excluded.faq,
        updated_at = now()
     returning event_id, attend_mode, vendor_cta_enabled, headline, description,
               hero_image_url, logo_url, sponsors, faq, updated_at`,
    [
      eventId,
      normMode(patch.attend_mode),
      patch.vendor_cta_enabled ?? true,
      patch.headline ?? null,
      patch.description ?? null,
      normImageUrl(patch.hero_image_url),
      normImageUrl(patch.logo_url),
      JSON.stringify(normSponsors(patch.sponsors)),
      JSON.stringify(normFaq(patch.faq)),
    ],
  );
  return row as LandingSettings;
}

// ---- Tiers ------------------------------------------------------------------

export async function listTiers(eventId: string, activeOnly = false): Promise<TicketTier[]> {
  return q<TicketTier>(
    `select * from event_ticket_tiers where event_id = $1 ${activeOnly ? "and is_active = true" : ""}
      order by sort_order asc, created_at asc`,
    [eventId],
  );
}

export async function createTier(
  actor: Actor,
  eventId: string,
  input: { name: string; price?: number | null; quantity?: number | null; sort_order?: number | null },
): Promise<TicketTier> {
  await assertOwnsEvent(actor, eventId);
  if (!input.name || typeof input.name !== "string") throw new ForbiddenError("tier name required");
  const priceCents = Math.max(0, Math.round(Number(input.price ?? 0) * 100));
  const row = await q1<TicketTier>(
    `insert into event_ticket_tiers (event_id, name, price_cents, quantity, sort_order)
     values ($1,$2,$3,$4,$5) returning *`,
    [eventId, input.name, priceCents, input.quantity ?? null, input.sort_order ?? 0],
  );
  return row as TicketTier;
}

export async function updateTier(
  actor: Actor,
  id: string,
  patch: { name?: string; price?: number | null; quantity?: number | null; is_active?: boolean; sort_order?: number | null },
): Promise<TicketTier> {
  const tier = await q1<{ event_id: string }>(`select event_id from event_ticket_tiers where id = $1`, [id]);
  if (!tier) throw new NotFoundError("tier not found");
  await assertOwnsEvent(actor, tier.event_id);
  const priceCents = patch.price != null ? Math.max(0, Math.round(Number(patch.price) * 100)) : null;
  const row = await q1<TicketTier>(
    `update event_ticket_tiers set
        name = coalesce($2, name),
        price_cents = coalesce($3, price_cents),
        quantity = coalesce($4, quantity),
        is_active = coalesce($5, is_active),
        sort_order = coalesce($6, sort_order)
      where id = $1 returning *`,
    [id, patch.name ?? null, priceCents, patch.quantity ?? null, patch.is_active ?? null, patch.sort_order ?? null],
  );
  return row as TicketTier;
}

export async function deleteTier(actor: Actor, id: string): Promise<boolean> {
  const tier = await q1<{ event_id: string }>(`select event_id from event_ticket_tiers where id = $1`, [id]);
  if (!tier) return false;
  await assertOwnsEvent(actor, tier.event_id);
  const rows = await q(`delete from event_ticket_tiers where id = $1 returning id`, [id]);
  return rows.length > 0;
}

export async function listRegistrations(actor: Actor, eventId: string): Promise<Record<string, unknown>[]> {
  await assertOwnsEvent(actor, eventId);
  return q<Record<string, unknown>>(
    `select id, attendee_name, email, ticket_type, tier_id, quantity, amount_cents,
            platform_fee_cents, order_status, rsvp_status, created_at
       from event_registrations where event_id = $1 order by created_at desc limit 1000`,
    [eventId],
  );
}

// ---- Public -----------------------------------------------------------------

export interface PublicLanding {
  event: { id: string; name: string | null; date_time: string | null; type: string | null; organizer: string | null };
  place: { venue_name: string | null; venue_city: string | null; floorplan_place: string | null };
  settings: {
    attend_mode: AttendMode;
    vendor_cta_enabled: boolean;
    headline: string | null;
    description: string | null;
    hero_image_url: string | null;
    logo_url: string | null;
  };
  sponsors: SponsorEntry[];
  faq: FaqEntry[];
  tiers: { id: string; name: string; price_cents: number; sold_out: boolean }[];
  agenda: { id: string; title: string | null; start_time: string | null; end_time: string | null; location: string | null; track: string | null }[];
}

export async function getPublicLanding(eventId: string): Promise<PublicLanding | null> {
  const ev = await q1<{
    id: string;
    name: string | null;
    date_time: string | null;
    type: string | null;
    organizer: string | null;
    venue_name: string | null;
    venue_city: string | null;
  }>(
    `select e.id, e.name, e.date_time, e.type, o.name as organizer,
            v.name as venue_name, v.city as venue_city
       from events e
       left join organizations o on o.id = e.organization_id
       left join venues v on v.id = e.venue_id
      where e.id = $1`,
    [eventId],
  );
  if (!ev) return null;

  const settings = await getSettings(eventId);

  // A place label from a floorplan when there is no registered venue.
  const fp = await q1<{ place_name: string | null }>(
    `select place_name from floorplans where event_id = $1 and place_name is not null limit 1`,
    [eventId],
  );

  const tierRows = await listTiers(eventId, true);
  const tiers = tierRows.map((t) => ({
    id: t.id,
    name: t.name,
    price_cents: t.price_cents,
    sold_out: t.quantity != null && t.sold >= t.quantity,
  }));

  const agenda = await q<{
    id: string;
    title: string | null;
    start_time: string | null;
    end_time: string | null;
    location: string | null;
    track: string | null;
  }>(
    `select id, title, start_time, end_time, location, track
       from itinerary_items where event_id = $1 and is_public = true
      order by coalesce(start_time, 'infinity'::timestamptz) asc, track asc nulls first`,
    [eventId],
  );

  // Only expose a public landing once the coordinator has opted in: a saved
  // settings row, at least one active tier, or at least one public agenda item.
  // An event that never configured a public page returns null (404), so draft
  // events do not leak their metadata by guessed id.
  const persisted = await q1<{ event_id: string }>(
    `select event_id from event_landing_settings where event_id = $1`,
    [eventId],
  );
  if (!persisted && tiers.length === 0 && agenda.length === 0) return null;

  return {
    event: { id: ev.id, name: ev.name, date_time: ev.date_time, type: ev.type, organizer: ev.organizer },
    place: { venue_name: ev.venue_name, venue_city: ev.venue_city, floorplan_place: fp?.place_name ?? null },
    settings: {
      attend_mode: settings.attend_mode,
      vendor_cta_enabled: settings.vendor_cta_enabled,
      headline: settings.headline,
      description: settings.description,
      hero_image_url: settings.hero_image_url,
      logo_url: settings.logo_url,
    },
    sponsors: settings.sponsors,
    faq: settings.faq,
    tiers,
    agenda,
  };
}

export interface RegisterInput {
  name?: string | null;
  email?: string | null;
  tier_id?: string | null;
  quantity?: number | null;
}
export interface RegisterResult {
  ok: boolean;
  registration_id: string;
  order_status: string;
  amount_cents: number;
  platform_fee_cents: number;
  total_cents: number;
}

/**
 * Public attendee registration. Free mode (or a zero-price tier) confirms
 * immediately. Ticketed mode computes the platform fee off the event owner org's
 * plan and records a pending order (the pay rail completes the charge). Enforces
 * tier availability. Returns null when the event is not accepting attendees.
 */
export async function registerAttendee(eventId: string, input: RegisterInput): Promise<RegisterResult | null> {
  const settings = await getSettings(eventId);
  if (settings.attend_mode === "off") return null;

  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim();
  if (!name || !email) throw new ForbiddenError("name and email are required");
  const qty = Math.max(1, Math.min(20, Math.round(Number(input.quantity ?? 1)) || 1));

  let tier: TicketTier | null = null;
  if (settings.attend_mode === "ticketed") {
    if (!input.tier_id) throw new ForbiddenError("pick a ticket tier");
    tier = await q1<TicketTier>(
      `select * from event_ticket_tiers where id = $1 and event_id = $2 and is_active = true`,
      [input.tier_id, eventId],
    );
    if (!tier) throw new NotFoundError("ticket tier not found");
  }

  const amountCents = tier ? tier.price_cents * qty : 0;

  // Platform fee off the event owner org's plan.
  let platformFeeCents = 0;
  if (amountCents > 0) {
    const org = await q1<{ tier: string | null; platform_fee_rate: number | null }>(
      `select o.tier, o.platform_fee_rate
         from events e join organizations o on o.id = e.organization_id
        where e.id = $1`,
      [eventId],
    );
    platformFeeCents = computePlatformFee(amountCents, {
      tier: org?.tier ?? null,
      platform_fee_rate: org?.platform_fee_rate ?? null,
    }).platformFeeCents;
  }

  const orderStatus = amountCents > 0 ? "pending_payment" : "confirmed";

  // Reserve the tier inventory atomically BEFORE recording the order so two
  // concurrent buyers cannot oversell a limited tier (guarded conditional update).
  if (tier) {
    const reserved = await q1<{ id: string }>(
      `update event_ticket_tiers set sold = sold + $2
        where id = $1 and (quantity is null or sold + $2 <= quantity)
        returning id`,
      [tier.id, qty],
    );
    if (!reserved) throw new ForbiddenError("not enough tickets left in that tier");
  }

  const reg = await q1<{ id: string }>(
    `insert into event_registrations
       (event_id, attendee_name, email, ticket_type, tier_id, quantity, amount_cents,
        platform_fee_cents, order_status, rsvp_status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     returning id`,
    [
      eventId,
      name,
      email,
      tier ? tier.name : "free",
      tier?.id ?? null,
      qty,
      amountCents,
      platformFeeCents,
      orderStatus,
      orderStatus === "confirmed" ? "confirmed" : "pending",
    ],
  );

  return {
    ok: true,
    registration_id: reg?.id ?? "",
    order_status: orderStatus,
    amount_cents: amountCents,
    platform_fee_cents: platformFeeCents,
    total_cents: amountCents,
  };
}
