import React, { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

/**
 * WS-2 - Preferred Partners. An org curates the vendors AND sponsors (and
 * venues, planners, and more) it wants to work with again. Reads/writes go
 * through /api/preferred-partners, which is scoped to the caller's own org.
 *
 * The "Suggested from your events" strip surfaces the real partners you have
 * already worked with (vendors from your event rosters, sponsors from your
 * fundraising events), one tap to save. Saved partners get a tier, an optional
 * note, and can be removed. Self-contained styling under .pp-. Zero em dashes.
 */

type Kind = 'vendor' | 'sponsor' | 'venue' | 'planner' | 'supplier' | 'installer';
type Tier = 'preferred' | 'approved' | 'exclusive' | 'recommended' | 'vip';

const KINDS: { key: Kind; label: string; suggestable: boolean }[] = [
  { key: 'vendor', label: 'Vendors', suggestable: true },
  { key: 'sponsor', label: 'Sponsors', suggestable: true },
  { key: 'venue', label: 'Venues', suggestable: false },
  { key: 'planner', label: 'Planners', suggestable: false },
  { key: 'supplier', label: 'Suppliers', suggestable: false },
  { key: 'installer', label: 'Installers', suggestable: false },
];

const TIERS: Tier[] = ['preferred', 'approved', 'exclusive', 'recommended', 'vip'];

type Partner = {
  id: string;
  partner_org_id: string | null;
  partner_kind: Kind;
  tier: Tier | null;
  label: string | null;
  note: string | null;
  last_worked_at: string | null;
  times_worked: number | null;
  partner_name: string | null;
};

type Suggestion = {
  partner_org_id: string;
  partner_name: string | null;
  partner_kind: Kind;
  times_worked: number;
  last_worked_at: string | null;
  last_event_id: string | null;
};

function when(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { dateStyle: 'medium' });
}

export default function PreferredPartners() {
  const [kind, setKind] = useState<Kind>('vendor');
  const [partners, setPartners] = useState<Partner[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const suggestable = KINDS.find((k) => k.key === kind)?.suggestable ?? false;

  const load = useCallback(async (k: Kind) => {
    setLoading(true);
    setError(null);
    try {
      const [p, s] = await Promise.all([
        apiGet<{ partners: Partner[] }>(`/preferred-partners?kind=${k}`),
        KINDS.find((x) => x.key === k)?.suggestable
          ? apiGet<{ suggestions: Suggestion[] }>(`/preferred-partners/suggestions?kind=${k}`)
          : Promise.resolve({ suggestions: [] as Suggestion[] }),
      ]);
      setPartners(p.partners ?? []);
      setSuggestions(s.suggestions ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load your preferred partners.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(kind);
  }, [kind, load]);

  async function saveSuggestion(s: Suggestion) {
    setBusyId(s.partner_org_id);
    try {
      await apiSend('POST', '/preferred-partners', {
        partner_org_id: s.partner_org_id,
        partner_kind: s.partner_kind,
        tier: 'preferred',
        times_worked: s.times_worked,
        last_worked_at: s.last_worked_at,
        last_event_id: s.last_event_id,
      });
      await load(kind);
    } catch (e: any) {
      setError(e?.message ?? 'Could not save that partner.');
    } finally {
      setBusyId(null);
    }
  }

  async function setTier(p: Partner, tier: Tier) {
    setBusyId(p.id);
    try {
      await apiSend('PATCH', `/preferred-partners/${p.id}`, { tier });
      setPartners((rows) => rows.map((r) => (r.id === p.id ? { ...r, tier } : r)));
    } catch (e: any) {
      setError(e?.message ?? 'Could not update.');
    } finally {
      setBusyId(null);
    }
  }

  async function saveNote(p: Partner, note: string) {
    try {
      await apiSend('PATCH', `/preferred-partners/${p.id}`, { note });
      setPartners((rows) => rows.map((r) => (r.id === p.id ? { ...r, note } : r)));
    } catch (e: any) {
      setError(e?.message ?? 'Could not save the note.');
    }
  }

  async function remove(p: Partner) {
    setBusyId(p.id);
    try {
      await apiSend('DELETE', `/preferred-partners/${p.id}`);
      setPartners((rows) => rows.filter((r) => r.id !== p.id));
      if (suggestable) void load(kind);
    } catch (e: any) {
      setError(e?.message ?? 'Could not remove.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="pp">
      <style>{CSS}</style>
      <div className="pp-head">
        <h1>Preferred Partners</h1>
        <p className="pp-sub">
          Save the vendors and sponsors you want to work with again. Next year, invite them back in
          one step.
        </p>
      </div>

      <div className="pp-tabs">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            className={`pp-tab ${kind === k.key ? 'active' : ''}`}
            onClick={() => setKind(k.key)}
          >
            {k.label}
          </button>
        ))}
      </div>

      {error && <div className="pp-error">{error}</div>}

      {suggestable && suggestions.length > 0 && (
        <div className="pp-suggest">
          <div className="pp-suggest-title">Suggested from your events</div>
          <div className="pp-suggest-row">
            {suggestions.map((s) => (
              <div key={s.partner_org_id} className="pp-chip">
                <div className="pp-chip-name">{s.partner_name ?? 'Partner'}</div>
                <div className="pp-chip-meta">
                  {s.times_worked}x{when(s.last_worked_at) ? ` - last ${when(s.last_worked_at)}` : ''}
                </div>
                <button
                  type="button"
                  className="pp-chip-btn"
                  disabled={busyId === s.partner_org_id}
                  onClick={() => saveSuggestion(s)}
                >
                  {busyId === s.partner_org_id ? 'Saving...' : 'Save'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="pp-empty">Loading...</div>
      ) : partners.length === 0 ? (
        <div className="pp-empty">
          No saved {KINDS.find((k) => k.key === kind)?.label.toLowerCase()} yet.
          {suggestable ? ' Save one from the suggestions above.' : ''}
        </div>
      ) : (
        <div className="pp-list">
          {partners.map((p) => (
            <div key={p.id} className="pp-card">
              <div className="pp-card-main">
                <div className="pp-card-name">{p.partner_name ?? 'Partner'}</div>
                <div className="pp-card-meta">
                  {p.times_worked ? `${p.times_worked}x together` : 'Saved partner'}
                  {when(p.last_worked_at) ? ` - last ${when(p.last_worked_at)}` : ''}
                </div>
                <input
                  className="pp-note"
                  defaultValue={p.note ?? ''}
                  placeholder="Add a note (e.g. great for galas)"
                  onBlur={(e) => {
                    if (e.target.value !== (p.note ?? '')) void saveNote(p, e.target.value);
                  }}
                />
              </div>
              <div className="pp-card-side">
                <select
                  className="pp-tier"
                  value={p.tier ?? 'preferred'}
                  disabled={busyId === p.id}
                  onChange={(e) => setTier(p, e.target.value as Tier)}
                >
                  {TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="pp-remove"
                  disabled={busyId === p.id}
                  onClick={() => remove(p)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const CSS = `
.pp { max-width: 900px; margin: 0 auto; padding: 24px 16px; }
.pp-head h1 { font-size: 24px; margin: 0 0 4px; }
.pp-sub { opacity: .75; margin: 0 0 18px; }
.pp-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
.pp-tab { border: 1px solid #d7dbe3; background: #fff; border-radius: 999px; padding: 7px 14px;
  font-size: 14px; cursor: pointer; color: #333; }
.pp-tab.active { background: #111827; color: #fff; border-color: #111827; }
.pp-error { background: #fdecea; color: #a12; border: 1px solid #f5c6c0; border-radius: 8px;
  padding: 10px 12px; margin-bottom: 14px; font-size: 14px; }
.pp-suggest { background: #f6f8fc; border: 1px solid #e3e8f0; border-radius: 12px; padding: 14px; margin-bottom: 18px; }
.pp-suggest-title { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; opacity: .7; margin-bottom: 10px; }
.pp-suggest-row { display: flex; flex-wrap: wrap; gap: 10px; }
.pp-chip { background: #fff; border: 1px solid #dfe4ec; border-radius: 10px; padding: 10px 12px; min-width: 170px; }
.pp-chip-name { font-weight: 600; font-size: 14px; }
.pp-chip-meta { font-size: 12px; opacity: .6; margin: 2px 0 8px; }
.pp-chip-btn { border: none; background: #2563eb; color: #fff; border-radius: 8px; padding: 5px 12px; font-size: 13px; cursor: pointer; }
.pp-chip-btn:disabled { opacity: .6; cursor: default; }
.pp-list { display: flex; flex-direction: column; gap: 10px; }
.pp-card { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start;
  border: 1px solid #e3e8f0; border-radius: 12px; padding: 14px 16px; background: #fff; }
.pp-card-main { flex: 1; min-width: 0; }
.pp-card-name { font-weight: 600; font-size: 16px; }
.pp-card-meta { font-size: 13px; opacity: .6; margin: 2px 0 8px; }
.pp-note { width: 100%; max-width: 420px; border: 1px solid #dfe4ec; border-radius: 8px; padding: 7px 10px; font-size: 13px; }
.pp-card-side { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.pp-tier { border: 1px solid #dfe4ec; border-radius: 8px; padding: 6px 8px; font-size: 13px; text-transform: capitalize; }
.pp-remove { border: none; background: transparent; color: #a12; font-size: 13px; cursor: pointer; }
.pp-empty { opacity: .65; padding: 24px 0; text-align: center; }
`;
