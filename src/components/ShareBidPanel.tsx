import React, { useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

/**
 * ShareBidPanel lets an event owner mint, copy, and deactivate public share
 * links for a single bid, and see the view/register/submit funnel counts.
 * Links are lazy loaded the first time the panel is opened.
 *
 * Zero em dashes.
 */

type ShareLink = {
  id: string;
  bid_id: string;
  event_id: string | null;
  token: string;
  label: string | null;
  audience: 'vendor' | 'sponsor' | 'any';
  is_active: boolean;
  view_count: number;
  register_count: number;
  submit_count: number;
  created_at: string;
};

type Audience = 'any' | 'vendor' | 'sponsor';

function publicUrl(token: string): string {
  return `${window.location.origin}/b/${token}`;
}

export default function ShareBidPanel({ bidId }: { bidId: string }) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [audience, setAudience] = useState<Audience>('any');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await apiGet<{ links: ShareLink[] }>(`/bid-shares/bid/${bidId}`);
      setLinks(r.links);
      setLoaded(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Fetch on first mount of the panel (the panel itself only mounts when the
  // owner opens it, so this stays lazy per the requirement).
  React.useEffect(() => {
    void load();
    /* eslint-disable-next-line */
  }, [bidId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await apiSend<{ link: ShareLink }>('POST', '/bid-shares', {
        bid_id: bidId,
        label: label.trim() || undefined,
        audience,
      });
      setLinks((prev) => [r.link, ...prev]);
      setLabel('');
      setAudience('any');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(id: string) {
    setBusy(true);
    setErr(null);
    try {
      await apiSend('POST', `/bid-shares/${id}/deactivate`);
      setLinks((prev) => prev.filter((l) => l.id !== id));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy(link: ShareLink) {
    try {
      await navigator.clipboard.writeText(publicUrl(link.token));
      setCopiedId(link.id);
      window.setTimeout(() => {
        setCopiedId((cur) => (cur === link.id ? null : cur));
      }, 1600);
    } catch {
      setErr('Could not copy to clipboard.');
    }
  }

  const active = links.filter((l) => l.is_active);

  return (
    <div className="sbp-root">
      <style>{SBP_CSS}</style>

      {err ? <p className="sbp-error">{err}</p> : null}

      <form className="sbp-create" onSubmit={create}>
        <input
          className="sbp-label-input"
          placeholder="Label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <select
          className="sbp-aud-select"
          value={audience}
          onChange={(e) => setAudience(e.target.value as Audience)}
          aria-label="Audience"
        >
          <option value="any">Any</option>
          <option value="vendor">Vendor</option>
          <option value="sponsor">Sponsor</option>
        </select>
        <button type="button" className="sbp-btn" disabled={busy} onClick={(e) => void create(e)}>
          Create share link
        </button>
      </form>

      {loading && !loaded ? <p className="sbp-muted">Loading share links...</p> : null}

      {loaded && active.length === 0 && !loading ? (
        <p className="sbp-muted">No active share links yet. Create one to hand to a vendor or sponsor.</p>
      ) : null}

      {active.length > 0 ? (
        <ul className="sbp-list">
          {active.map((l) => (
            <li key={l.id} className="sbp-item">
              <div className="sbp-item-top">
                <code className="sbp-url">{publicUrl(l.token)}</code>
                <button type="button" className="sbp-btn ghost sm" disabled={busy} onClick={() => void copy(l)}>
                  {copiedId === l.id ? 'Copied' : 'Copy link'}
                </button>
              </div>
              <div className="sbp-item-meta">
                <span className="sbp-badge">{l.audience}</span>
                {l.label ? <span className="sbp-label-text">{l.label}</span> : null}
                <span className="sbp-stats">
                  {l.view_count} views - {l.register_count} registered - {l.submit_count} submitted
                </span>
                <button type="button" className="sbp-btn danger sm" disabled={busy} onClick={() => void deactivate(l.id)}>
                  Deactivate
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const SBP_CSS = `
.sbp-root { background: #faf8f3; border: 1px solid #e7e1d6; border-radius: 10px; padding: 14px; margin-top: 10px; display: flex; flex-direction: column; gap: 10px; }
.sbp-error { margin: 0; font-size: 12.5px; color: #8a3a3a; }
.sbp-muted { margin: 0; font-size: 12.5px; color: #6b6459; }
.sbp-create { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.sbp-create input, .sbp-create select { font: inherit; padding: 8px 10px; border: 1px solid #e7e1d6; border-radius: 8px; background: #fff; }
.sbp-label-input { flex: 1 1 160px; min-width: 140px; }
.sbp-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.sbp-item { background: #fff; border: 1px solid #e7e1d6; border-radius: 9px; padding: 11px 12px; display: flex; flex-direction: column; gap: 8px; }
.sbp-item-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sbp-url { flex: 1 1 220px; min-width: 160px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #123c2e; background: #f3f0e8; border: 1px solid #eae4d7; border-radius: 6px; padding: 6px 8px; overflow-wrap: anywhere; }
.sbp-item-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px; color: #6b6459; }
.sbp-badge { font-size: 10px; letter-spacing: .5px; text-transform: uppercase; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: rgba(30,93,74,.12); color: #1E5D4A; border: 1px solid rgba(30,93,74,.3); }
.sbp-label-text { color: #4a463e; font-weight: 600; }
.sbp-stats { color: #6b6459; }
.sbp-btn { font: inherit; cursor: pointer; border: none; border-radius: 8px; padding: 8px 12px; background: #1E5D4A; color: #fff; font-size: 12.5px; }
.sbp-btn:hover { background: #184c3d; }
.sbp-btn:disabled { opacity: .55; cursor: default; }
.sbp-btn.sm { padding: 6px 10px; font-size: 11.5px; }
.sbp-btn.ghost { background: transparent; border: 1px solid #cfc8ba; color: #4a463e; }
.sbp-btn.ghost:hover { background: #f0ece2; }
.sbp-btn.danger { background: #8a3a3a; }
.sbp-btn.danger:hover { background: #743030; }
`;
