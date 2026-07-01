/**
 * Claim outreach emails (automation addendum: Weekly Email Automation,
 * Stop Conditions + compliance).
 *
 * Four claim templates with the addendum cadence:
 *   step 1..4  weekly (one per week),
 *   step 5+    monthly,
 *   hard stop  after 6 total sends unless the profile is reactivated.
 *
 * send() records a claim_outreach row AND dispatches the email via lib/email.ts
 * (real Resend/Postal transport when configured; logs and no-ops when the email
 * provider is unset). Every send is checked against the suppression list first;
 * suppressed/claimed/removed/archived profiles never receive outreach. Every
 * email carries the compliance footer (unsubscribe, removal, sender identity).
 *
 * ZERO em dashes in this file (hard rule).
 */
import * as claim from "../db/claim.js";
import { sendEmail } from "./email.js";
import { PUBLIC_APP_URL, BASE_PATH } from "../config.js";

export const MAX_SENDS = 6;
export const WEEKLY_STEPS = 4; // first four sends are weekly, then monthly

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

const SENDER_NAME = "Divini Partners by Divini Group";
const SENDER_EMAIL = "partners@divinipartners.com";
// M4: build claim links from config consistently (PUBLIC_APP_URL + BASE_PATH),
// falling back to the production domain when PUBLIC_APP_URL is empty.
const BASE_URL = (PUBLIC_APP_URL || "https://divinipartners.com") + BASE_PATH;

export type Personalization = {
  businessName: string;
  city?: string | null;
  category?: string | null;
  slug: string;
  email: string;
};

export type Audience = "venue" | "vendor" | "planner";

/**
 * Map a business category to the audience whose copy fits it. Venue categories
 * are physical event spaces; planner categories coordinate events; everything
 * else (caterers, florals, photography, DJ, rentals, etc.) is a vendor, which
 * is also the default for anything unrecognized.
 */
export function audienceFor(category?: string | null): Audience {
  const c = (category || "").toLowerCase().trim();
  if (!c) return "vendor";
  if (c.includes("planner") || c.includes("planning")) return "planner";
  if (c.includes("venue")) return "venue";
  const venueCats = [
    "ballroom",
    "estate",
    "mansion",
    "rooftop",
    "garden",
    "hotel",
    "resort",
    "waterfront",
    "loft",
    "warehouse",
    "gallery",
    "museum",
    "barn",
    "farm",
  ];
  if (venueCats.some((v) => c.includes(v))) return "venue";
  return "vendor";
}

export type RenderedEmail = {
  subject: string;
  body: string;
  step: number;
  cadence: "weekly" | "monthly";
};

function claimUrl(slug: string): string {
  return `${BASE_URL}/claim/${slug}/verify`;
}
function profileUrl(slug: string): string {
  return `${BASE_URL}/claim/${slug}`;
}
function unsubscribeUrl(slug: string): string {
  return `${BASE_URL}/claim/${slug}?action=unsubscribe`;
}
function removalUrl(slug: string): string {
  return `${BASE_URL}/claim/${slug}?action=removal`;
}

/** Required compliance footer. Present on every outreach email. */
export function complianceFooter(p: Personalization): string {
  return [
    "",
    "----------------------------------------------------------------",
    `Sent by ${SENDER_NAME} (${SENDER_EMAIL}).`,
    "You are receiving this because we created an unclaimed listing for your business from publicly available information.",
    `Unsubscribe from these messages: ${unsubscribeUrl(p.slug)}`,
    `Request removal of your listing entirely: ${removalUrl(p.slug)}`,
    "Divini Group, South Florida. We honor every unsubscribe and removal request promptly.",
  ].join("\n");
}

/** The four claim templates (exact copy per the addendum). */
export function renderTemplate(step: number, p: Personalization): RenderedEmail {
  const name = p.businessName;
  const cadence: "weekly" | "monthly" = step <= WEEKLY_STEPS ? "weekly" : "monthly";
  const audience = audienceFor(p.category);

  if (step === 1) {
    // Audience-specific "what it is + what you manage" block.
    let intro: string;
    let manageLines: string[];
    if (audience === "venue") {
      intro = `We have created a profile for ${name} on Divini Partners, the all-in-one platform by Divini Group where a venue runs every event from first inquiry to final payment in one place. We built it from publicly available information so that clients, planners, and vendors searching for partners like you can find you.`;
      manageLines = [
        "  - Inbound inquiries and leads, instead of email, DMs, calls, and spreadsheets",
        "  - Quotes, standardized invoices, and secure payments",
        "  - Your preferred vendor network, event timelines, and guest details",
        "  - Your clients and the full history of every booking",
      ];
    } else if (audience === "planner") {
      intro = `We have created a profile for ${name} on Divini Partners, the all-in-one platform by Divini Group where a planner runs every event and coordinates venues plus vendors from first inquiry to final payment in one place. We built it from publicly available information so that clients, venues, and vendors searching for partners like you can find you.`;
      manageLines = [
        "  - Inbound inquiries and leads, instead of email, DMs, calls, and spreadsheets",
        "  - Quotes, standardized invoices, and secure payments",
        "  - The venues and vendors on each event, on one shared timeline",
        "  - Your clients and the full history of every event",
      ];
    } else {
      intro = `We have created a profile for ${name} on Divini Partners, the all-in-one platform by Divini Group where you win the right bookings and run them end to end in one place. We built it from publicly available information so that clients, planners, and venues searching for partners like you can find you.`;
      manageLines = [
        "  - Inbound leads and bids, instead of email, DMs, calls, and spreadsheets",
        "  - Quotes, standardized invoices, and secure payments and payouts",
        "  - Your client relationships and the full history of every booking",
        "  - The event timelines you are booked on, shared with the venue and other vendors",
      ];
    }
    return {
      step,
      cadence,
      subject: `${name}, your Divini Partners profile is ready to claim`,
      body: [
        `Hello ${name},`,
        "",
        intro,
        "",
        "From a single dashboard you can manage:",
        ...manageLines,
        "",
        "The profile is currently unclaimed. That means it is clearly labeled as generated from public sources and has not been reviewed or confirmed by you. Claiming it lets you verify the details, add your own description, services, and photos, and control how your business appears.",
        "",
        `View your profile: ${profileUrl(p.slug)}`,
        `Claim it now (free): ${claimUrl(p.slug)}`,
        "",
        "Claiming is free and takes a few minutes.",
        "",
        "Warm regards,",
        `The team at ${SENDER_NAME}`,
        complianceFooter(p),
      ].join("\n"),
    };
  }

  if (step === 2) {
    return {
      step,
      cadence,
      subject: `A reminder to claim ${name} on Divini Partners`,
      body: [
        `Hello ${name},`,
        "",
        `Last week we let you know that an unclaimed profile for ${name} is live on Divini Partners. We wanted to follow up in case it slipped by.`,
        "",
        "While the profile is unclaimed, the information shown comes only from public sources and may be incomplete or out of date. When you claim it, you decide what clients see, you can add your own photos and services, and you take full ownership of the page.",
        "",
        `Claim your free profile: ${claimUrl(p.slug)}`,
        "",
        "There is no cost to claim, and you can update your profile any time afterward.",
        "",
        "Warm regards,",
        `The team at ${SENDER_NAME}`,
        complianceFooter(p),
      ].join("\n"),
    };
  }

  if (step === 3) {
    // Audience-specific pain-points block.
    let painIntro: string;
    let painLines: string[];
    if (audience === "venue") {
      painIntro = "Most venues lose time and bookings to the same problems. Divini Partners is built to end them:";
      painLines = [
        "  - Leads scattered across email, DMs, calls, and spreadsheets, now in one inbox",
        "  - Chasing vendors and clients across disconnected tools, now coordinated in one place",
        "  - Missed follow-ups that quietly lose bookings, now tracked end to end",
        "  - Getting paid late or off-platform, now quoted, invoiced, and paid in one flow",
        "  - No single source of truth for an event, now one timeline everyone works from",
      ];
    } else if (audience === "planner") {
      painIntro = "Most planners lose time and bookings to the same problems. Divini Partners is built to end them:";
      painLines = [
        "  - Leads scattered across email, DMs, calls, and spreadsheets, now in one inbox",
        "  - Coordinating venues and vendors across disconnected tools, now in one place",
        "  - Missed follow-ups that quietly lose bookings, now tracked end to end",
        "  - Getting paid late or off-platform, now quoted, invoiced, and paid in one flow",
        "  - No single source of truth for an event, now one timeline everyone works from",
      ];
    } else {
      painIntro = "Most vendors lose time and bookings to the same problems. Divini Partners is built to end them:";
      painLines = [
        "  - Leads scattered across DMs, email, and referrals, now in one inbox",
        "  - Quoting in docs and getting underpriced, now standardized quotes in a few clicks",
        "  - Chasing deposits and final payments, now quoted, invoiced, and paid in one flow",
        "  - No shared timeline with the venue and other vendors, now one timeline you all work from",
        "  - Missed follow-ups that quietly lose bookings, now tracked end to end",
      ];
    }
    return {
      step,
      cadence,
      subject: `What claiming ${name} unlocks on Divini Partners`,
      body: [
        `Hello ${name},`,
        "",
        `Divini Partners connects venues, vendors, planners, and clients for exceptional events${p.city ? ` across ${p.city} and beyond` : ""}. Your unclaimed profile is already part of that network.`,
        "",
        painIntro,
        ...painLines,
        "",
        "When you claim it, you can:",
        "  - Verify and correct your business details",
        "  - Replace the placeholder description with your own words",
        "  - Add your services, photos, and links",
        "  - Receive and respond to inbound requests as a Free Partner",
        "",
        `Claim ${name} now: ${claimUrl(p.slug)}`,
        "",
        "It is free to claim and free to keep as a Free Partner.",
        "",
        "Warm regards,",
        `The team at ${SENDER_NAME}`,
        complianceFooter(p),
      ].join("\n"),
    };
  }

  // step 4 and any later monthly sends reuse the final template copy.
  return {
    step,
    cadence,
    subject: `Last reminder: claim ${name} on Divini Partners`,
    body: [
      `Hello ${name},`,
      "",
      `This is a final reminder that the unclaimed profile we created for ${name} is still available to claim on Divini Partners.`,
      "",
      "If you would like to take ownership, verify your details, and present your business the way you want it seen, you can claim it for free below. If you would rather not appear at all, you can request removal at any time using the link in the footer, and we will take the listing down.",
      "",
      `Claim your profile: ${claimUrl(p.slug)}`,
      "",
      "We respect your time and your inbox. After this, we will only reach out occasionally.",
      "",
      "Warm regards,",
      `The team at ${SENDER_NAME}`,
      complianceFooter(p),
    ].join("\n"),
  };
}

// ---- Cadence ---------------------------------------------------------------

export function nextStep(sendsSoFar: number): number {
  return sendsSoFar + 1;
}

/** Compute the next send date from the cadence (weekly x4, then monthly). */
export function nextSendDate(step: number, from: Date = new Date()): Date | null {
  if (step >= MAX_SENDS) return null; // hard stop after step 6
  const interval = step < WEEKLY_STEPS ? WEEK_MS : MONTH_MS;
  return new Date(from.getTime() + interval);
}

export type SendDecision = {
  canSend: boolean;
  reason?: string;
  step: number;
};

/**
 * Decide whether the next outreach may be sent for a profile, honoring stop
 * conditions: suppression, claimed/removed/archived state, and the 6-send cap.
 */
export async function decideSend(profileId: string, email: string): Promise<SendDecision> {
  const profile = await claim.getUnclaimedProfile(profileId);
  if (!profile) return { canSend: false, reason: "profile not found", step: 0 };
  if (profile.claim_status !== "unclaimed")
    return { canSend: false, reason: `profile is ${profile.claim_status}`, step: 0 };
  if (profile.removal_requested) return { canSend: false, reason: "removal requested", step: 0 };
  if (profile.archived) return { canSend: false, reason: "archived", step: 0 };

  if (await claim.isSuppressed(email))
    return { canSend: false, reason: "suppressed", step: 0 };

  const sends = await claim.countSendsForProfile(profileId);
  if (sends >= MAX_SENDS)
    return { canSend: false, reason: "max sends reached (6)", step: sends };

  return { canSend: true, step: nextStep(sends) };
}

export type SendResult = {
  sent: boolean;
  reason?: string;
  outreach?: claim.ClaimOutreach;
  email?: RenderedEmail;
};

/**
 * STUB send. Records a claim_outreach row and returns the rendered email. Does
 * not transmit anything. Advances discovery status to claim_email_sent on the
 * first send.
 */
export async function send(profileId: string, p: Personalization): Promise<SendResult> {
  const decision = await decideSend(profileId, p.email);
  if (!decision.canSend) {
    return { sent: false, reason: decision.reason };
  }
  const rendered = renderTemplate(decision.step, p);
  const next = nextSendDate(decision.step);
  const outreach = await claim.recordOutreach({
    profileId,
    email: p.email,
    sequenceStep: decision.step,
    subject: rendered.subject,
    body: rendered.body,
    cadence: rendered.cadence,
    nextSendDate: next ? next.toISOString() : null,
  });

  // First send moves the profile/business into the "email sent" lifecycle.
  if (decision.step === 1) {
    const profile = await claim.getUnclaimedProfile(profileId);
    if (profile?.discovered_business_id) {
      await claim.setDiscoveryStatus(profile.discovered_business_id, "claim_email_sent");
    }
  }

  // Send for real when an email provider is configured; otherwise this logs and
  // reports skipped. Suppression + cadence were already enforced above. The
  // claim_outreach row id is the tracking ref, so self-hosted open/click events
  // tie back to this exact outreach record (lib/email.ts weaves in the pixel +
  // tracked links only because trackingRef is present here).
  const delivery = await sendEmail({
    to: p.email,
    subject: rendered.subject,
    text: rendered.body,
    trackingRef: outreach.id,
  }).catch(() => null);
  // eslint-disable-next-line no-console
  console.log(
    `[claim-email] step ${decision.step} (${rendered.cadence}) to ${p.email}: ${rendered.subject}` +
      (delivery?.ok ? ` sent id=${delivery.id ?? ""}` : delivery?.skipped ? " (email disabled, logged)" : ` failed: ${delivery?.error ?? "unknown"}`),
  );

  return { sent: true, outreach, email: rendered };
}
