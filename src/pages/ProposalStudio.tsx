import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

/**
 * Divini Proposal Studio - converts a Pipeline opportunity into a clear,
 * professional proposal (docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md).
 * Deterministic: totals are pure arithmetic on line items the user enters,
 * never a generated price. Every save appends a version; sending mints a
 * public share link the client opens with no account.
 */

type Status = 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired';

type Proposal = {
  id: string;
  title: string;
  client_name: string | null;
  client_email: string | null;
  status: Status;
  discount_cents: string;
  tax_cents: string;
  valid_until: string | null;
  notes: string | null;
  share_token: string | null;
  opportunity_id: string | null;
};

type LineItem = { id: string; description: string; quantity: string; unit_price_cents: string };
type Totals = { subtotal_cents: number; discount_cents: number; tax_cents: number; total_cents: number };
type Detail = { proposal: Proposal; line_items: LineItem[]; totals: Totals; version_count: number };
type Opportunity = { id: string; name: string };
type VersionRow = { version_number: number; created_at: string };

function money(cents: number | string): string {
  const n = Number(cents) / 100;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

const EMPTY_CREATE = { title: '', client_name: '', client_email: '', opportunity_id: '' };

export default function ProposalStudio() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_CREATE);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [p, o] = await Promise.all([
        apiGet<{ proposals: Proposal[] }>('/proposal-studio/proposals'),
        apiGet<{ opportunities: Opportunity[] }>('/pipeline/opportunities').catch(() => ({ opportunities: [] })),
      ]);
      setProposals(p.proposals);
      setOpportunities(o.opportunities);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiSend<Detail>('POST', '/proposal-studio/proposals', {
        title: form.title.trim(),
        client_name: form.client_name.trim() || undefined,
        client_email: form.client_email.trim() || undefined,
        opportunity_id: form.opportunity_id || undefined,
      });
      setForm(EMPTY_CREATE);
      setCreating(false);
      setSelectedId(r.proposal.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (selectedId) {
    return <ProposalDetail id={selectedId} onBack={() => { setSelectedId(null); void load(); }} />;
  }

  return (
    <div className="pxs">
      <style>{CSS}</style>
      <header className="pxs-head">
        <div>
          <h1>Divini Proposal Studio</h1>
          <p className="pxs-sub">Turn an opportunity into a clear, professional proposal. Every number traces to a line item you entered.</p>
        </div>
        <button className="pxs-btn" onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : 'New proposal'}</button>
      </header>

      {loading && <p className="pxs-muted">Loading.</p>}
      {error && <p className="pxs-error">{error}</p>}

      {creating && (
        <form className="pxs-card pxs-form" onSubmit={create}>
          <input placeholder="Proposal title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input placeholder="Client name (optional)" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
          <input placeholder="Client email (optional)" value={form.client_email} onChange={(e) => setForm({ ...form, client_email: e.target.value })} />
          <select value={form.opportunity_id} onChange={(e) => setForm({ ...form, opportunity_id: e.target.value })}>
            <option value="">Not linked to an opportunity</option>
            {opportunities.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <button type="submit" className="pxs-btn" disabled={busy}>{busy ? 'Creating.' : 'Create proposal'}</button>
        </form>
      )}

      <div className="pxs-grid">
        {proposals.map((p) => (
          <div className="pxs-card pxs-item" key={p.id} onClick={() => setSelectedId(p.id)} role="button">
            <div className="pxs-item-top">
              <span className="pxs-item-name">{p.title}</span>
              <span className={'pxs-badge ' + p.status}>{p.status}</span>
            </div>
            {p.client_name && <div className="pxs-item-sub">{p.client_name}</div>}
          </div>
        ))}
        {!loading && proposals.length === 0 && (
          <div className="pxs-empty">No proposals yet. Start one from an opportunity, or on its own.</div>
        )}
      </div>
    </div>
  );
}

function ProposalDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [items, setItems] = useState<{ description: string; quantity: string; unit_price_cents: string }[]>([]);
  const [header, setHeader] = useState({ title: '', client_name: '', client_email: '', notes: '', discount: '0', tax: '0', valid_until: '' });
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const d = await apiGet<Detail>(`/proposal-studio/proposals/${id}`);
      setDetail(d);
      setItems(d.line_items.map((i) => ({ description: i.description, quantity: i.quantity, unit_price_cents: String(Number(i.unit_price_cents) / 100) })));
      setHeader({
        title: d.proposal.title,
        client_name: d.proposal.client_name ?? '',
        client_email: d.proposal.client_email ?? '',
        notes: d.proposal.notes ?? '',
        discount: String(Number(d.proposal.discount_cents) / 100),
        tax: String(Number(d.proposal.tax_cents) / 100),
        valid_until: d.proposal.valid_until ?? '',
      });
      const v = await apiGet<{ versions: VersionRow[] }>(`/proposal-studio/proposals/${id}/versions`);
      setVersions(v.versions);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, [id]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await apiSend('PATCH', `/proposal-studio/proposals/${id}`, {
        title: header.title.trim(),
        client_name: header.client_name.trim() || null,
        client_email: header.client_email.trim() || null,
        notes: header.notes.trim() || null,
        valid_until: header.valid_until || null,
        discount_cents: Math.round(Number(header.discount || 0) * 100),
        tax_cents: Math.round(Number(header.tax || 0) * 100),
        line_items: items
          .filter((i) => i.description.trim())
          .map((i) => ({ description: i.description.trim(), quantity: Number(i.quantity) || 1, unit_price_cents: Math.round(Number(i.unit_price_cents || 0) * 100) })),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await save();
      await apiSend('POST', `/proposal-studio/proposals/${id}/send`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="pxs"><style>{CSS}</style><p className="pxs-muted">Loading.</p></div>;
  if (!detail) return <div className="pxs"><style>{CSS}</style><p className="pxs-error">{error ?? 'Proposal not found.'}</p></div>;

  const shareUrl = detail.proposal.share_token ? `${window.location.origin}/p/${detail.proposal.share_token}` : null;

  return (
    <div className="pxs">
      <style>{CSS}</style>
      <button className="pxs-back" onClick={onBack}>&larr; All proposals</button>
      <header className="pxs-head">
        <div>
          <h1>{detail.proposal.title}</h1>
          <p className="pxs-sub"><span className={'pxs-badge ' + detail.proposal.status}>{detail.proposal.status}</span> &middot; {versions.length} version{versions.length === 1 ? '' : 's'} saved</p>
        </div>
      </header>

      {error && <p className="pxs-error">{error}</p>}

      {shareUrl && (
        <div className="pxs-card pxs-share">
          <span>Client link:</span>
          <a href={shareUrl} target="_blank" rel="noreferrer">{shareUrl}</a>
        </div>
      )}

      <div className="pxs-card pxs-form">
        <input placeholder="Title" value={header.title} onChange={(e) => setHeader({ ...header, title: e.target.value })} />
        <input placeholder="Client name" value={header.client_name} onChange={(e) => setHeader({ ...header, client_name: e.target.value })} />
        <input placeholder="Client email" value={header.client_email} onChange={(e) => setHeader({ ...header, client_email: e.target.value })} />
        <input type="date" value={header.valid_until} onChange={(e) => setHeader({ ...header, valid_until: e.target.value })} />
        <textarea rows={3} placeholder="Notes / terms" value={header.notes} onChange={(e) => setHeader({ ...header, notes: e.target.value })} />

        <div className="pxs-sectiontitle">Line items</div>
        {items.map((it, i) => (
          <div className="pxs-lineitem" key={i}>
            <input placeholder="Description" value={it.description} onChange={(e) => setItems((cur) => cur.map((x, idx) => (idx === i ? { ...x, description: e.target.value } : x)))} />
            <input type="number" min="0" step="1" placeholder="Qty" value={it.quantity} onChange={(e) => setItems((cur) => cur.map((x, idx) => (idx === i ? { ...x, quantity: e.target.value } : x)))} />
            <input type="number" min="0" step="0.01" placeholder="Unit price ($)" value={it.unit_price_cents} onChange={(e) => setItems((cur) => cur.map((x, idx) => (idx === i ? { ...x, unit_price_cents: e.target.value } : x)))} />
            <button type="button" className="pxs-remove" onClick={() => setItems((cur) => cur.filter((_, idx) => idx !== i))}>&times;</button>
          </div>
        ))}
        <button type="button" className="pxs-btn ghost" onClick={() => setItems((cur) => [...cur, { description: '', quantity: '1', unit_price_cents: '0' }])}>Add line item</button>

        <div className="pxs-totals">
          <div><span>Subtotal</span><span>{money(detail.totals.subtotal_cents)}</span></div>
          <div>
            <span>Discount ($)</span>
            <input type="number" min="0" step="0.01" value={header.discount} onChange={(e) => setHeader({ ...header, discount: e.target.value })} />
          </div>
          <div>
            <span>Tax ($)</span>
            <input type="number" min="0" step="0.01" value={header.tax} onChange={(e) => setHeader({ ...header, tax: e.target.value })} />
          </div>
          <div className="pxs-total-row"><span>Total</span><span>{money(detail.totals.total_cents)}</span></div>
        </div>

        <div className="pxs-form-actions">
          <button className="pxs-btn ghost" onClick={save} disabled={busy}>{busy ? 'Saving.' : 'Save'}</button>
          {detail.proposal.status === 'draft' && (
            <button className="pxs-btn" onClick={send} disabled={busy}>{busy ? 'Sending.' : 'Send to client'}</button>
          )}
        </div>
      </div>

      {versions.length > 0 && (
        <>
          <div className="pxs-sectiontitle">Version history</div>
          <div className="pxs-versions">
            {versions.map((v) => (
              <div className="pxs-version-row" key={v.version_number}>
                <span>Version {v.version_number}</span>
                <span className="pxs-version-date">{new Date(v.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const CSS = `
.pxs { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --ink:#2c2a26; --mut:#6b6459; --ln:#e7e1d6;
  --bg:#fbf9f4; font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:920px;
  margin:0 auto; padding:24px 20px 56px; }
.pxs *,.pxs *::before,.pxs *::after { box-sizing:border-box; }
.pxs-back { background:none; border:none; color:var(--e2); font-size:13px; font-weight:600; cursor:pointer; padding:0 0 12px; }
.pxs-head { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; flex-wrap:wrap; }
.pxs-head h1 { font-size:24px; margin:0 0 6px; color:var(--e); font-weight:800; }
.pxs-sub { font-size:14px; color:var(--mut); margin:0; max-width:560px; line-height:1.5; }
.pxs-muted { font-size:12px; color:var(--mut); margin:10px 0 0; }
.pxs-error { font-size:13px; color:#9a3a28; margin:8px 0; }
.pxs-sectiontitle { font-size:13px; font-weight:700; color:var(--e); text-transform:uppercase; letter-spacing:.4px; margin:18px 0 8px; }

.pxs-btn { background:var(--e); color:#fff; border:none; border-radius:9px; padding:9px 16px;
  font-size:13.5px; font-weight:600; cursor:pointer; white-space:nowrap; }
.pxs-btn.ghost { background:#fff; color:var(--e); border:1px solid var(--ln); }
.pxs-btn:disabled { opacity:.6; cursor:default; }

.pxs-card { background:#fff; border:1px solid var(--ln); border-radius:12px; padding:14px 16px; cursor:default; }
.pxs-form { display:flex; flex-direction:column; gap:10px; margin-top:16px; }
.pxs-form input, .pxs-form select, .pxs-form textarea { border:1px solid var(--ln); border-radius:8px; padding:8px 11px; font-size:13.5px; font-family:inherit; width:100%; }
.pxs-form-actions { display:flex; gap:8px; margin-top:6px; }

.pxs-empty { border:1px dashed var(--ln); border-radius:12px; padding:18px; color:var(--mut); font-size:13.5px; margin-top:12px; grid-column:1/-1; }

.pxs-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:10px; margin-top:16px; }
.pxs-item-top { display:flex; justify-content:space-between; align-items:center; gap:8px; }
.pxs-item-name { font-weight:700; font-size:13.5px; color:var(--e); }
.pxs-item-sub { font-size:11.5px; color:var(--mut); margin-top:3px; }
.pxs-badge { font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.3px; padding:2px 7px; border-radius:999px; background:var(--bg); color:var(--mut); border:1px solid var(--ln); }
.pxs-badge.sent, .pxs-badge.viewed { background:#fbf3e1; color:#8a6a1f; border-color:#eddcb0; }
.pxs-badge.accepted { background:#eaf3ee; color:#1E5D4A; border-color:#c7e0d1; }
.pxs-badge.declined { background:#fbe9e6; color:#9a3a28; border-color:#f0c9c1; }

.pxs-lineitem { display:grid; grid-template-columns:1fr 70px 110px 30px; gap:6px; align-items:center; }
.pxs-remove { background:none; border:none; color:#9a3a28; font-size:18px; cursor:pointer; line-height:1; }

.pxs-totals { border-top:1px solid var(--ln); padding-top:10px; display:flex; flex-direction:column; gap:6px; }
.pxs-totals > div { display:flex; justify-content:space-between; align-items:center; font-size:13px; gap:10px; }
.pxs-totals input { max-width:120px; }
.pxs-total-row { font-weight:700; font-size:15px; color:var(--e); border-top:1px dashed var(--ln); padding-top:8px; margin-top:2px; }

.pxs-share { display:flex; gap:8px; align-items:center; margin-top:14px; font-size:12.5px; flex-wrap:wrap; }
.pxs-share a { color:var(--e2); word-break:break-all; }

.pxs-versions { display:flex; flex-direction:column; gap:4px; }
.pxs-version-row { display:flex; justify-content:space-between; font-size:12px; color:var(--mut); border-bottom:1px dashed var(--ln); padding:5px 0; }

@media(max-width:600px){ .pxs { padding:18px 14px 44px; } .pxs-head h1 { font-size:20px; } .pxs-lineitem { grid-template-columns:1fr 60px 90px 26px; } }
`;
