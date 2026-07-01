/**
 * Intelligence Moat - F11 Attendee Intelligence.
 *
 * Pure, deterministic attendee-analytics computer. Given the raw per-event
 * registration rows (from event_registrations) and the per-registration
 * engagement counters (from attendee_engagement), it returns funnel rates
 * (RSVP / check-in / attendance / no-show), engagement aggregates, and a
 * 0..100 engagement score plus an audience-quality band. No DB calls, no
 * network, no AI. Same inputs always produce the same output.
 *
 * The data layer (server/src/db/member-attendee.ts) gathers the rows and access
 * checks the event; all of the math lives here so it stays testable.
 */

/** Minimal shape of an event_registrations row this module needs. */
export type RegistrationLike = {
  rsvp_status: string | null;
  checked_in: boolean | null;
};

/** Minimal shape of an attendee_engagement row this module needs. */
export type EngagementLike = {
  booth_visits: number | null;
  qr_scans: number | null;
  sponsor_interactions: number | null;
  sessions_attended: number | null;
  leads: number | null;
  survey_response: unknown;
};

export type AttendeeAnalytics = {
  /** Total invitations (registrations on record). */
  invitations: number;
  /** RSVP'd yes / confirmed. */
  rsvps: number;
  /** Checked in on the day. */
  checkIns: number;
  /** RSVP rate 0..1 (rsvps / invitations). */
  rsvpRate: number;
  /** Check-in rate 0..1 of RSVPs that actually showed (checkIns / rsvps). */
  checkInRate: number;
  /** Attendance rate 0..1 of all invitations (checkIns / invitations). */
  attendanceRate: number;
  /** No-show rate 0..1 of RSVPs that did not show. */
  noShowRate: number;
  /** Aggregate engagement counters across all registrations. */
  boothVisits: number;
  qrScans: number;
  sponsorInteractions: number;
  sessionsAttended: number;
  leads: number;
  surveyResponses: number;
  /** Survey completion rate 0..1 of check-ins. */
  surveyRate: number;
  /** 0..100 engagement score across the engagement signals. */
  engagementScore: number;
  /** Audience-quality band derived from attendance + engagement. */
  audienceQuality: "high" | "medium" | "low";
};

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const clamp = (x: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, x));
const rate = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 1000) / 1000 : 0;

/** A registration counts as an RSVP when its status is a confirmed/yes value. */
function isRsvp(status: string | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === "yes" || s === "confirmed" || s === "accepted" || s === "going" || s === "rsvp";
}

/**
 * Compute the attendee analytics. Pure and deterministic.
 *
 * The engagement score blends per-attendee averages of the engagement signals
 * with the realized attendance rate, so an event with high turnout AND active
 * attendees scores highest.
 */
export function computeAttendeeAnalytics(
  registrations: RegistrationLike[],
  engagement: EngagementLike[],
): AttendeeAnalytics {
  const regs = Array.isArray(registrations) ? registrations : [];
  const eng = Array.isArray(engagement) ? engagement : [];

  const invitations = regs.length;
  const rsvps = regs.filter((r) => isRsvp(r.rsvp_status)).length;
  const checkIns = regs.filter((r) => !!r.checked_in).length;

  const rsvpRate = rate(rsvps, invitations);
  const checkInRate = rate(checkIns, rsvps);
  const attendanceRate = rate(checkIns, invitations);
  const noShows = Math.max(0, rsvps - checkIns);
  const noShowRate = rate(noShows, rsvps);

  // Engagement aggregates.
  const boothVisits = eng.reduce((s, e) => s + n(e.booth_visits), 0);
  const qrScans = eng.reduce((s, e) => s + n(e.qr_scans), 0);
  const sponsorInteractions = eng.reduce((s, e) => s + n(e.sponsor_interactions), 0);
  const sessionsAttended = eng.reduce((s, e) => s + n(e.sessions_attended), 0);
  const leads = eng.reduce((s, e) => s + n(e.leads), 0);
  const surveyResponses = eng.filter(
    (e) => e.survey_response != null && typeof e.survey_response === "object",
  ).length;
  const surveyRate = rate(surveyResponses, checkIns);

  // Per-attendee engagement intensity, normalized against sensible targets,
  // then folded together. Use the number of registrations as the denominator
  // so sparse engagement on a big list scores lower.
  const denom = Math.max(1, invitations);
  const perBooth = clamp((boothVisits / denom / 3) * 100); // 3 booth visits each -> full
  const perQr = clamp((qrScans / denom / 5) * 100); // 5 scans each -> full
  const perSponsor = clamp((sponsorInteractions / denom / 2) * 100); // 2 each -> full
  const perSessions = clamp((sessionsAttended / denom / 3) * 100); // 3 sessions each -> full
  const engagementDepth =
    perBooth * 0.25 + perQr * 0.25 + perSponsor * 0.25 + perSessions * 0.25;

  const engagementScore = clamp(
    Math.round(engagementDepth * 0.6 + attendanceRate * 100 * 0.4),
  );

  let audienceQuality: "high" | "medium" | "low" = "low";
  if (engagementScore >= 66 && attendanceRate >= 0.6) audienceQuality = "high";
  else if (engagementScore >= 33 || attendanceRate >= 0.4) audienceQuality = "medium";

  return {
    invitations,
    rsvps,
    checkIns,
    rsvpRate,
    checkInRate,
    attendanceRate,
    noShowRate,
    boothVisits,
    qrScans,
    sponsorInteractions,
    sessionsAttended,
    leads,
    surveyResponses,
    surveyRate,
    engagementScore,
    audienceQuality,
  };
}
