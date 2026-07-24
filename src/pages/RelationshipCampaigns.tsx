import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

/**
 * WS-3 - Relationship Campaigns. An org sends one message to its saved partners
 * (WS-2 preferred vendors/sponsors) or a past event's roster, to drive repeat
 * annual events and rebookings. Draft, resolve the audience, send a test, then
 * approve the send. Every send carries a one-click rebook CTA. Self-contained
 * styling under .rc-. Zero em dashes.
 */

type Campaign = {
  id: string;
  name: string;
  audience: any;
  subject: string | null;
  body_html: string | null;
  cta_kind: string | null;
  cta_ref: string | null;
  cta_url: string | null;
  status: string;
  recipient_count: number | null;
  sent_count: number | null;
};

type Recipient = { id: string; email: string; name: string | null; status: string };
type EventOpt = { id: string; name: string };

const AUDIENCES = [
  { key: 'pref_vendor', label: 'Preferred Vendors', audience: { kind: 'preferred', partner_kind: 'vendor' } },
  { key: 'pref_sponsor', label: 'Preferred Sponsors', audience: { kind: 'preferred', partner_kind: 'sponsor' } },
  { key: 'event_roster', label: "A past event's roster", audience: { kind: 'event_roster' } },
] as const;

const CTAS = [
  { key: 'clone_playbook', label: 'Rebook via playbook', needsEvent: false },
  { key: 'open_rfp', label: 'Open the RFP on an event', needsEvent: true },
  { key: 'sponsorship_packages', label: 'Renew sponsorship', needsEvent: true },
  { key: 'create_event', label: 'Start a new event', needsEvent: false },
  { key: 'custom', label: 'Custom link', needsEvent: false },
] as const;

export default function RelationshipCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [events, setEvents] = useState<EventOpt[]>([]);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Draft form.
  const [name, setName] = useState('');
  const [audienceKey, setAudienceKey] = useState<(typeof AUDIENCES)[number]['key']>('pref_sponsor');
  const [audienceEvent, setAudienceEvent] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [ctaKind, setCtaKind] = useState<(typeof CTAS)[number]['key']>('clone_playbook');
  const [ctaEvent, setCtaEvent] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');

  async function loadList() {
    try {
      const [c, e] = await Promise.all([
        apiGet<{ campaigns: Campaign[] }>('/relationship-campaigns'),
        apiGet<{ events: EventOpt[] }>('/events').catch(() => ({ events: [] as EventOpt[] })),
      ]);
      setCampaigns(c.campaigns ?? []);
      setEvents(e.events ?? []);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not load campaigns.');
    }
  }

  useEffect(() => {
    void loadList();
  }, []);

  async function open(c: Campaign) {
    setSelected(c);
    setMsg(null);
    setErr(null);
    try {
      const r = await apiGet<{ campaign: Campaign; recipients: Recipient[] }>(`/relationship-campaigns/${c.id}`);
      setSelected(r.campaign);
      setRecipients(r.recipients ?? []);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not open campaign.');
    }
  }

  async function create() {
    if (!name.trim()) return setErr('Give the campaign a name.');
    setBusy(true);
    setErr(null);
    try {
      const aud = AUDIENCES.find((a) => a.key === audienceKey)!;
      const audience: any = { ...aud.audience };
      if (audience.kind === 'event_roster') audience.event_id = audienceEvent || null;
      const cta = CTAS.find((c) => c.key === ctaKind)!;
      const body_payload: any = {
        name: name.trim(),
        audience,
        subject: subject.trim() || null,
        body_html: body.trim() || null,
        cta_kind: ctaKind,
        cta_ref: cta.needsEvent ? ctaEvent || null : null,
        cta_url: ctaKind === 'custom' ? ctaUrl.trim() || null : null,
      };
      const r = await apiSend<{ campaign: Campaign }>('POST', '/relationship-campaigns', body_payload);
      setName('');
      setSubject('');
      setBody('');
      await loadList();
      await open(r.campaign);
      setMsg('Draft created. Resolve the audience, send a test, then send.');
    } catch (e: any) {
      setErr(e?.message ?? 'Could not create the campaign.');
    } finally {
      setBusy(false);
    }
  }

  async function resolve() {
    if (!selected) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await apiSend<{ recipients: Recipient[]; recipient_count: number }>(
        'POST',
        `/relationship-campaigns/${selected.id}/resolve`,
        {},
      );
      setRecipients(r.recipients ?? []);
      setSelected({ ...selected, recipient_count: r.recipient_count });
      setMsg(`${r.recipient_count} recipient${r.recipient_count === 1 ? '' : 's'} resolved.`);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not resolve the audience.');
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (!selected) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await apiSend<{ sent_to: string }>('POST', `/relationship-campaigns/${selected.id}/test`, {});
      setMsg(`Test sent to ${r.sent_to}.`);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not send the test.');
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!selected) return;
    if (!window.confirm('Send this campaign to all resolved recipients?')) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await apiSend<{ recipient_count: number; sent_count: number }>(
        'POST',
        `/relationship-campaigns/${selected.id}/send`,
        {},
      );
      setMsg(`Sent to ${r.sent_count} of ${r.recipient_count} recipients.`);
      await loadList();
      await open(selected);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not send.');
    } finally {
      setBusy(false);
    }
  }

  const needsEvent = CTAS.find((c) => c.key === ctaKind)?.needsEvent;

  return (
    <div className="rc">
      <style>{CSS}</style>
      <div className="rc-head">
        <h1>Relationship Campaigns</h1>
        <p className="rc-sub">
          Invite your saved vendors and sponsors back for next year in one message. Draft, send a
          test, then send with a one-click rebook link.
        </p>
      </div>

      {err && <div className="rc-error">{err}</div>}
      {msg && <div className="rc-msg">{msg}</div>}

      <div className="rc-grid">
        <div className="rc-col">
          <div className="rc-card">
            <h3>New campaign</h3>
            <label className="rc-l">Name</label>
            <input className="rc-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="2027 gala rebooking" />

            <label className="rc-l">Audience</label>
            <select className="rc-in" value={audienceKey} onChange={(e) => setAudienceKey(e.target.value as any)}>
              {AUDIENCES.map((a) => (
                <option key={a.key} value={a.key}>{a.label}</option>
              ))}
            </select>
            {audienceKey === 'event_roster' && (
              <select className="rc-in" value={audienceEvent} onChange={(e) => setAudienceEvent(e.target.value)}>
                <option value="">Pick an event...</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            )}

            <label className="rc-l">Subject</label>
            <input className="rc-in" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="We are doing it again - want your booth back?" />

            <label className="rc-l">Message</label>
            <textarea className="rc-in rc-ta" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your note. Basic HTML is supported." />

            <label className="rc-l">Call to action</label>
            <select className="rc-in" value={ctaKind} onChange={(e) => setCtaKind(e.target.value as any)}>
              {CTAS.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
            {needsEvent && (
              <select className="rc-in" value={ctaEvent} onChange={(e) => setCtaEvent(e.target.value)}>
                <option value="">Link to which event...</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            )}
            {ctaKind === 'custom' && (
              <input className="rc-in" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://..." />
            )}

            <button type="button" className="rc-btn" disabled={busy} onClick={create}>
              {busy ? 'Working...' : 'Create draft'}
            </button>
          </div>

          <div className="rc-card">
            <h3>Your campaigns</h3>
            {campaigns.length === 0 ? (
              <div className="rc-empty">No campaigns yet.</div>
            ) : (
              campaigns.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`rc-row ${selected?.id === c.id ? 'active' : ''}`}
                  onClick={() => open(c)}
                >
                  <span className="rc-row-name">{c.name}</span>
                  <span className={`rc-badge rc-${c.status}`}>{c.status}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rc-col">
          {selected ? (
            <div className="rc-card">
              <h3>{selected.name}</h3>
              <div className="rc-detail">
                <span className={`rc-badge rc-${selected.status}`}>{selected.status}</span>
                <span className="rc-count">{selected.recipient_count ?? 0} recipients</span>
                {selected.sent_count != null && selected.status === 'sent' && (
                  <span className="rc-count">{selected.sent_count} sent</span>
                )}
              </div>
              {selected.subject && <p className="rc-subject">Subject: {selected.subject}</p>}

              <div className="rc-actions">
                <button type="button" className="rc-btn ghost" disabled={busy} onClick={resolve}>
                  Resolve audience
                </button>
                <button type="button" className="rc-btn ghost" disabled={busy} onClick={test}>
                  Send test to me
                </button>
                <button
                  type="button"
                  className="rc-btn"
                  disabled={busy || (selected.recipient_count ?? 0) === 0}
                  onClick={send}
                >
                  Send to all
                </button>
              </div>

              <div className="rc-reclist">
                {recipients.length === 0 ? (
                  <div className="rc-empty">Resolve the audience to preview recipients.</div>
                ) : (
                  recipients.slice(0, 100).map((r) => (
                    <div key={r.id} className="rc-rec">
                      <span>{r.name ? `${r.name} - ` : ''}{r.email}</span>
                      <span className={`rc-badge rc-${r.status}`}>{r.status}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="rc-card rc-empty">Select or create a campaign to get started.</div>
          )}
        </div>
      </div>
    </div>
  );
}

const CSS = `
.rc { max-width: 1080px; margin: 0 auto; padding: 24px 16px; }
.rc-head h1 { font-size: 24px; margin: 0 0 4px; }
.rc-sub { opacity: .75; margin: 0 0 16px; }
.rc-error { background: #fdecea; color: #a12; border: 1px solid #f5c6c0; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; }
.rc-msg { background: #eaf6ee; color: #17603a; border: 1px solid #bfe3cc; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; }
.rc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 760px) { .rc-grid { grid-template-columns: 1fr; } }
.rc-col { display: flex; flex-direction: column; gap: 16px; }
.rc-card { border: 1px solid #e3e8f0; border-radius: 12px; padding: 16px; background: #fff; }
.rc-card h3 { margin: 0 0 12px; font-size: 16px; }
.rc-l { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: .4px; opacity: .6; margin: 10px 0 4px; }
.rc-in { width: 100%; border: 1px solid #dfe4ec; border-radius: 8px; padding: 8px 10px; font-size: 14px; box-sizing: border-box; }
.rc-ta { min-height: 96px; resize: vertical; font-family: inherit; }
.rc-btn { margin-top: 14px; border: none; background: #123c2e; color: #fff; border-radius: 8px; padding: 10px 16px; font-size: 14px; font-weight: 600; cursor: pointer; }
.rc-btn.ghost { background: #fff; color: #123c2e; border: 1px solid #cdd6cf; }
.rc-btn:disabled { opacity: .55; cursor: default; }
.rc-row { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 10px; border: 1px solid #eceff4; border-radius: 8px; padding: 9px 11px; background: #fbfcfe; cursor: pointer; margin-bottom: 7px; }
.rc-row.active { border-color: #123c2e; }
.rc-row-name { font-weight: 600; font-size: 14px; }
.rc-badge { font-size: 11px; text-transform: uppercase; letter-spacing: .4px; border-radius: 999px; padding: 3px 9px; background: #eef1f6; color: #55606f; }
.rc-badge.rc-sent { background: #e4f5ea; color: #17603a; }
.rc-badge.rc-draft { background: #f3f0e9; color: #7a6f57; }
.rc-badge.rc-failed { background: #fdecea; color: #a12; }
.rc-detail { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
.rc-count { font-size: 13px; opacity: .7; }
.rc-subject { font-size: 14px; opacity: .85; }
.rc-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 14px; }
.rc-actions .rc-btn { margin-top: 0; }
.rc-reclist { border-top: 1px solid #eceff4; padding-top: 10px; max-height: 340px; overflow: auto; }
.rc-rec { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; padding: 5px 0; border-bottom: 1px solid #f4f6f9; }
.rc-empty { opacity: .6; padding: 16px 0; text-align: center; }
`;
