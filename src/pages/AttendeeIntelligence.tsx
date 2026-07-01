import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { apiGet, apiSend } from '../lib/api';

/**
 * Intelligence Moat - F11 Attendee Intelligence.
 *
 * Engagement analytics for a single event, derived from the guest hub's
 * event_registrations (RSVP / check-in / no-show) plus the attendee_engagement
 * counters (booth visits, QR scans, sponsor interactions, sessions, leads,
 * survey responses). Shows the funnel rates, the engagement aggregates, and the
 * engagement + audience-quality scores. A small form below records engagement
 * counters for one registration (PUT /attendee-intel/:eventId/engagement).
 *
 * The event id comes from the route param :eventId, falling back to ?event=.
 * All numbers are computed server-side; this page only renders via lib/api.ts.
 */

type Analytics = {
  invitations: number;
  rsvps: number;
  checkIns: number;
  rsvpRate: number;
  checkInRate: number;
  attendanceRate: number;
  noShowRate: number;
  boothVisits: number;
  qrScans: number;
  sponsorInteractions: number;
  sessionsAttended: number;
  leads: number;
  surveyResponses: number;
  surveyRate: number;
  engagementScore: number;
  audienceQuality: 'high' | 'medium' | 'low';
};

type AnalyticsResult = { eventId: string; analytics: Analytics };

const pct = (n: unknown): string => {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? `${Math.round(v * 100)}%` : '-';
};
const numFmt = (n: unknown): string => {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? v.toLocaleString() : '-';
};

const QUALITY_LABEL: Record<Analytics['audienceQuality'], string> = {
  high: 'High quality audience',
  medium: 'Medium quality audience',
  low: 'Low quality audience',
};

export default function AttendeeIntelligence() {
  const params = useParams<{ eventId?: string }>();
  const [search] = useSearchParams();
  const eventId = params.eventId ?? search.get('event') ?? '';

  const [data, setData] = useState<Analytics | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  // Engagement capture form.
  const [regId, setRegId] = useState('');
  const [booth, setBooth] = useState('0');
  const [qr, setQr] = useState('0');
  const [sponsor, setSponsor] = useState('0');
  const [sessions, setSessions] = useState('0');
  const [leads, setLeads] = useState('0');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');

  async function load() {
    if (!eventId) {
      setErr('No event selected.');
      return;
    }
    setLoading(true);
    setErr('');
    try {
      const res = await apiGet<AnalyticsResult>(`/attendee-intel/${eventId}`);
      setData(res.analytics);
    } catch (e) {
      setErr((e as Error).message ?? 'Could not load attendee analytics.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function saveEngagement(e: React.FormEvent) {
    e.preventDefault();
    if (!regId.trim()) {
      setErr('A registration id is required to record engagement.');
      return;
    }
    setSaving(true);
    setErr('');
    setSaved('');
    try {
      await apiSend('PUT', `/attendee-intel/${eventId}/engagement`, {
        registrationId: regId.trim(),
        boothVisits: Number(booth) || 0,
        qrScans: Number(qr) || 0,
        sponsorInteractions: Number(sponsor) || 0,
        sessionsAttended: Number(sessions) || 0,
        leads: Number(leads) || 0,
      });
      setSaved('Engagement recorded.');
      await load();
    } catch (e2) {
      setErr((e2 as Error).message ?? 'Could not record engagement.');
    } finally {
      setSaving(false);
    }
  }

  const funnel: [string, string][] = data
    ? [
        ['Invitations', numFmt(data.invitations)],
        ['RSVPs', numFmt(data.rsvps)],
        ['Check-ins', numFmt(data.checkIns)],
        ['RSVP rate', pct(data.rsvpRate)],
        ['Check-in rate', pct(data.checkInRate)],
        ['Attendance rate', pct(data.attendanceRate)],
        ['No-show rate', pct(data.noShowRate)],
      ]
    : [];

  const engagement: [string, string][] = data
    ? [
        ['Booth visits', numFmt(data.boothVisits)],
        ['QR scans', numFmt(data.qrScans)],
        ['Sponsor interactions', numFmt(data.sponsorInteractions)],
        ['Sessions attended', numFmt(data.sessionsAttended)],
        ['Leads generated', numFmt(data.leads)],
        ['Survey responses', numFmt(data.surveyResponses)],
        ['Survey rate', pct(data.surveyRate)],
        ['Engagement score', `${data.engagementScore}/100`],
      ]
    : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Attendee Intelligence</h1>
          <div className="sub">
            Who showed up, how engaged they were, and how strong this audience is.
          </div>
        </div>
      </div>

      {err && <div className="err">{err}</div>}
      {loading && <div className="note">Loading…</div>}

      {data && (
        <div className="card" style={{ marginBottom: 16 }}>
          <strong>{QUALITY_LABEL[data.audienceQuality]}</strong>
          <span className="note"> engagement score {data.engagementScore}/100</span>
        </div>
      )}

      {data && (
        <>
          <div className="sectitle">Attendance funnel</div>
          <div
            className="stat-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))',
              gap: 12,
              marginBottom: 24,
            }}
          >
            {funnel.map(([label, value]) => (
              <div className="card" key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
                <div className="note">{label}</div>
              </div>
            ))}
          </div>

          <div className="sectitle">Engagement</div>
          <div
            className="stat-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))',
              gap: 12,
              marginBottom: 24,
            }}
          >
            {engagement.map(([label, value]) => (
              <div className="card" key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
                <div className="note">{label}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="sectitle">Record engagement</div>
      <form className="card" onSubmit={saveEngagement}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
            gap: 12,
          }}
        >
          <label>
            <div className="note">Registration id</div>
            <input value={regId} onChange={(e) => setRegId(e.target.value)} placeholder="uuid" />
          </label>
          <label>
            <div className="note">Booth visits</div>
            <input type="number" min={0} value={booth} onChange={(e) => setBooth(e.target.value)} />
          </label>
          <label>
            <div className="note">QR scans</div>
            <input type="number" min={0} value={qr} onChange={(e) => setQr(e.target.value)} />
          </label>
          <label>
            <div className="note">Sponsor interactions</div>
            <input type="number" min={0} value={sponsor} onChange={(e) => setSponsor(e.target.value)} />
          </label>
          <label>
            <div className="note">Sessions attended</div>
            <input type="number" min={0} value={sessions} onChange={(e) => setSessions(e.target.value)} />
          </label>
          <label>
            <div className="note">Leads</div>
            <input type="number" min={0} value={leads} onChange={(e) => setLeads(e.target.value)} />
          </label>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="btn primary" type="submit" disabled={saving || !eventId}>
            {saving ? 'Saving…' : 'Save engagement'}
          </button>
          {saved && <span className="note">{saved}</span>}
        </div>
      </form>
    </>
  );
}
