import { useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiSend } from '../lib/api';

/**
 * Friction Elimination - Lead Quality Engine (U4) + Verified Lead Program (U5).
 *
 * LeadInbox: a venue's ranked inbox of qualified inquiries. Each row shows an
 * intent chip (High / Medium / Low), the lead quality score, and any verification
 * badges. QualifiedInquiryForm: the required-field intake a planner / client
 * submits from a venue profile. VerifiedBadge: a small reusable presentational
 * component the rest of the platform reuses to render a verification marker.
 *
 * All data flows through src/lib/api.ts (apiGet / apiSend).
 */

// ---- Types (mirror server/src/db/leads.ts row shapes) ----------------------

type Intent = 'high' | 'medium' | 'low';

type Inquiry = {
  id: string;
  venue_id: string | null;
  vendor_id: string | null;
  event_type: string | null;
  budget_range: string | null;
  guest_count: number | null;
  date_range: unknown;
  decision_maker_name: string | null;
  company: string | null;
  timeline: string | null;
  message: string | null;
  lead_quality_score: number | null;
  intent: Intent | null;
  created_at: string;
};

type BadgeSubjectType = 'budget' | 'decision_maker' | 'event' | 'company' | 'venue';

type Badge = {
  id: string;
  subject_type: BadgeSubjectType | null;
  subject_id: string | null;
  subject_ref: string | null;
  verified: boolean | null;
  verified_at: string | null;
};

const date = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : '-');

// ---- VerifiedBadge: reusable presentational component ----------------------

const SUBJECT_LABELS: Record<BadgeSubjectType, string> = {
  budget: 'Budget',
  decision_maker: 'Decision maker',
  event: 'Event',
  company: 'Company',
  venue: 'Venue',
};

/**
 * VerifiedBadge - a small presentational chip showing whether a subject is
 * verified. Exported for reuse across the platform (lead profiles, vendor
 * cards, venue headers, etc). Stateless: pass the subject type and verified
 * flag, optionally a label override.
 *
 * Signature:
 *   VerifiedBadge(props: {
 *     subjectType: 'budget'|'decision_maker'|'event'|'company'|'venue';
 *     verified?: boolean;
 *     label?: string;
 *   }): JSX.Element
 */
export function VerifiedBadge({
  subjectType,
  verified = true,
  label,
}: {
  subjectType: BadgeSubjectType;
  verified?: boolean;
  label?: string;
}) {
  const text = label ?? SUBJECT_LABELS[subjectType] ?? subjectType;
  return (
    <span
      className="chip"
      title={verified ? `${text} verified` : `${text} not verified`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: verified ? 'rgba(16,160,90,0.12)' : 'rgba(120,120,120,0.12)',
        color: verified ? '#0a7d46' : '#666',
        fontWeight: 600,
      }}
    >
      <span aria-hidden="true">{verified ? '✓' : '○'}</span>
      {verified ? `${text} verified` : `${text} unverified`}
    </span>
  );
}

// ---- Intent chip -----------------------------------------------------------

const INTENT_META: Record<Intent, { label: string; bg: string; fg: string }> = {
  high: { label: 'High', bg: 'rgba(16,160,90,0.14)', fg: '#0a7d46' },
  medium: { label: 'Medium', bg: 'rgba(214,158,46,0.16)', fg: '#9a6a00' },
  low: { label: 'Low', bg: 'rgba(120,120,120,0.14)', fg: '#666' },
};

function IntentChip({ intent }: { intent: Intent | null }) {
  const meta = intent ? INTENT_META[intent] : INTENT_META.low;
  return (
    <span
      className="chip"
      style={{ background: meta.bg, color: meta.fg, fontWeight: 700 }}
    >
      {meta.label} intent
    </span>
  );
}

// ---- QualifiedInquiryForm --------------------------------------------------

/**
 * QualifiedInquiryForm - the qualified inquiry intake. All seven qualifying
 * fields are required (the form enforces them client-side; the server enforces
 * them too and returns 400 on any missing one). Usable on a venue profile: pass
 * the venueId and an optional onSubmitted callback fired after a successful
 * submit.
 */
export function QualifiedInquiryForm({
  venueId,
  vendorId,
  onSubmitted,
}: {
  venueId: string;
  vendorId?: string | null;
  onSubmitted?: (inquiry: Inquiry) => void;
}) {
  const [eventType, setEventType] = useState('');
  const [budgetRange, setBudgetRange] = useState('');
  const [guestCount, setGuestCount] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [decisionMaker, setDecisionMaker] = useState('');
  const [company, setCompany] = useState('');
  const [timeline, setTimeline] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  const guests = Number(guestCount);
  const valid =
    eventType.trim() &&
    budgetRange.trim() &&
    Number.isFinite(guests) &&
    guests > 0 &&
    eventDate.trim() &&
    decisionMaker.trim() &&
    company.trim() &&
    timeline.trim();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    if (!valid) {
      setErr('Please complete every required field before submitting.');
      return;
    }
    setBusy(true);
    try {
      const { inquiry } = await apiSend<{ inquiry: Inquiry }>('POST', '/leads', {
        venue_id: venueId,
        vendor_id: vendorId ?? null,
        event_type: eventType.trim(),
        budget_range: budgetRange.trim(),
        guest_count: guests,
        date_range: { start: eventDate },
        decision_maker_name: decisionMaker.trim(),
        company: company.trim(),
        timeline: timeline.trim(),
        message: message.trim() || null,
      });
      setDone(true);
      onSubmitted?.(inquiry);
    } catch (e2) {
      setErr((e2 as Error).message ?? 'Could not submit the inquiry.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card">
        <div className="sectitle">Inquiry sent</div>
        <div className="note">
          Thank you. The venue has received your qualified inquiry and will respond shortly.
        </div>
      </div>
    );
  }

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    opts?: { type?: string; placeholder?: string },
  ) => (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div className="note" style={{ marginBottom: 4 }}>
        {label} <span style={{ color: '#c0392b' }}>*</span>
      </div>
      <input
        className="input"
        type={opts?.type ?? 'text'}
        value={value}
        placeholder={opts?.placeholder}
        onChange={(e) => set(e.target.value)}
        style={{ width: '100%' }}
        required
      />
    </label>
  );

  return (
    <form className="card" onSubmit={submit}>
      <div className="sectitle">Request this venue</div>
      <div className="note" style={{ marginBottom: 12 }}>
        A complete, qualified inquiry gets you a faster, more accurate response. All fields are required.
      </div>
      {field('Event type', eventType, setEventType, { placeholder: 'Corporate gala, wedding, conference...' })}
      {field('Budget range', budgetRange, setBudgetRange, { placeholder: 'e.g. $25k - $50k' })}
      {field('Guest count', guestCount, setGuestCount, { type: 'number', placeholder: 'e.g. 250' })}
      {field('Event date', eventDate, setEventDate, { type: 'date' })}
      {field('Decision maker', decisionMaker, setDecisionMaker, { placeholder: 'Full name' })}
      {field('Company', company, setCompany, { placeholder: 'Company / organization' })}
      {field('Timeline', timeline, setTimeline, { placeholder: 'e.g. booking within 30 days' })}
      <label style={{ display: 'block', marginBottom: 12 }}>
        <div className="note" style={{ marginBottom: 4 }}>Message (optional)</div>
        <textarea
          className="input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          style={{ width: '100%' }}
        />
      </label>
      {err && <div className="err" style={{ marginBottom: 12 }}>{err}</div>}
      <button className="btn primary" type="submit" disabled={busy || !valid}>
        {busy ? 'Sending...' : 'Send qualified inquiry'}
      </button>
    </form>
  );
}

// ---- LeadInbox (page) ------------------------------------------------------

/**
 * LeadInbox - a venue's ranked inquiry inbox. Reads ?venueId= from the location
 * (or accepts a venueId prop) and renders the inquiries ranked by quality score
 * with intent chips and verification badges. The verification badges are loaded
 * per inquiry against subject_type=event, subject_ref=<inquiry id>.
 */
export default function LeadInbox({ venueId: venueIdProp }: { venueId?: string }) {
  const venueId =
    venueIdProp ?? new URLSearchParams(window.location.search).get('venueId') ?? '';
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [badges, setBadges] = useState<Record<string, Badge[]>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!venueId) {
      setErr('No venue selected.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { inquiries: rows } = await apiGet<{ inquiries: Inquiry[] }>(
          `/leads/venue/${venueId}`,
        );
        if (cancelled) return;
        setInquiries(rows);
        // Best-effort: pull verification badges for each inquiry (event subject,
        // referenced by inquiry id). Failures here never block the inbox.
        const map: Record<string, Badge[]> = {};
        await Promise.all(
          rows.map(async (r) => {
            try {
              const { badges: bs } = await apiGet<{ badges: Badge[] }>(
                `/leads/badges?subject_type=event&subject_ref=${encodeURIComponent(r.id)}`,
              );
              map[r.id] = bs;
            } catch {
              map[r.id] = [];
            }
          }),
        );
        if (!cancelled) setBadges(map);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message ?? 'Could not load inquiries.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Lead inbox</h1>
          <div className="sub">Qualified inquiries, ranked by lead quality and intent.</div>
        </div>
      </div>

      {err && <div className="err">{err}</div>}
      {loading && <div className="note">Loading...</div>}

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Intent</th>
              <th>Score</th>
              <th>Event type</th>
              <th>Company</th>
              <th>Decision maker</th>
              <th>Budget</th>
              <th>Guests</th>
              <th>Timeline</th>
              <th>Verification</th>
              <th>Received</th>
            </tr>
          </thead>
          <tbody>
            {inquiries.map((q) => {
              const verified = (badges[q.id] ?? []).filter((b) => b.verified);
              return (
                <tr key={q.id}>
                  <td><IntentChip intent={q.intent} /></td>
                  <td><strong>{q.lead_quality_score ?? 0}</strong></td>
                  <td>{q.event_type ?? '-'}</td>
                  <td>{q.company ?? '-'}</td>
                  <td>{q.decision_maker_name ?? '-'}</td>
                  <td>{q.budget_range ?? '-'}</td>
                  <td>{q.guest_count ?? '-'}</td>
                  <td>{q.timeline ?? '-'}</td>
                  <td>
                    {verified.length === 0 ? (
                      <span className="note">-</span>
                    ) : (
                      <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                        {verified.map((b) => (
                          <VerifiedBadge
                            key={b.id}
                            subjectType={(b.subject_type ?? 'event') as BadgeSubjectType}
                            verified
                          />
                        ))}
                      </span>
                    )}
                  </td>
                  <td>{date(q.created_at)}</td>
                </tr>
              );
            })}
            {!loading && inquiries.length === 0 && (
              <tr>
                <td colSpan={10} className="note">No qualified inquiries yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
