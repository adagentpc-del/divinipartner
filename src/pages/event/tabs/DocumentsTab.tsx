import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

/**
 * Documents tab.
 *
 * "AI bid package" (POST /events/:id/bid-package) produces a read-only,
 * vendor-ready summary assembled from the event record - a document to share,
 * not something vendors can act on.
 *
 * "Suggest bid items" is the actionable counterpart: describe the event in
 * plain language, POST /intelligence/scope-builder turns that into detected
 * procurement categories with a budget skeleton (the event's total budget
 * split across categories), each suggested item is click-to-edit, and
 * "Push to bid marketplace" posts one bid per item via the existing, already-
 * working POST /api/bids (same call BidsTab.tsx uses) so vendors and venues
 * can see and bid on them.
 */
type BidPackage = {
  generated_at: string;
  event: { name: string; type: string | null; date_time: string | null; guest_count: number | null; budget: string | null; status: string | null };
  venue: Record<string, unknown>;
  scope: { goals: string | null; required_services: string[]; services_count: number };
  notes: string;
};

type EventRow = {
  id: string;
  type: string | null;
  guest_count: number | null;
  budget: string | null;
  event_goals: string | null;
};

type ScopeCategory = { category: string; label: string; confidence: number; matched: string[] };
type BudgetLine = { category: string; label: string; pct: number; amount: number };
type Scope = {
  event_type: string | null;
  guest_count: number | null;
  budget: number | null;
  categories: ScopeCategory[];
  budget_skeleton: BudgetLine[];
  notes: string;
};

type SuggestedItem = {
  key: string;
  category: string;
  scope: string;
  budget_min: string; // form-bound strings, same convention as BidsTab.tsx
  budget_max: string;
};

const TIER_OPTIONS = ['premier', 'partner', 'free', 'private'];

let keySeq = 0;
function nextKey(): string {
  keySeq += 1;
  return `item-${keySeq}`;
}

/** +/-15% negotiation band around a suggested per-category amount. Rounded to
 *  the nearest $5 so vendors see a clean range, not a jagged split. */
function bandFromAmount(amount: number): { min: string; max: string } {
  const round5 = (n: number) => String(Math.max(0, Math.round(n / 5) * 5));
  return { min: round5(amount * 0.85), max: round5(amount * 1.15) };
}

export default function DocumentsTab({ eventId }: { eventId: string }) {
  const [ev, setEv] = useState<EventRow | null>(null);
  const [pkg, setPkg] = useState<BidPackage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [description, setDescription] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [scope, setScope] = useState<Scope | null>(null);
  const [items, setItems] = useState<SuggestedItem[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [tierAccess, setTierAccess] = useState('premier');
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ event: EventRow }>(`/events/${eventId}`)
      .then((r) => {
        setEv(r.event);
        setDescription(r.event.event_goals ?? '');
      })
      .catch((e) => setErr((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function generate() {
    setBusy(true);
    setErr(null);
    try {
      const r = await apiSend<{ package: BidPackage }>('POST', `/events/${eventId}/bid-package`);
      setPkg(r.package);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function suggest() {
    if (!description.trim()) {
      setErr('Describe the event before suggesting bid items.');
      return;
    }
    setSuggesting(true);
    setErr(null);
    setPublishResult(null);
    try {
      const r = await apiSend<{ scope: Scope }>('POST', '/intelligence/scope-builder', {
        description,
        guest_count: ev?.guest_count ?? undefined,
        budget: ev?.budget ? Number(ev.budget) : undefined,
        event_type: ev?.type || undefined,
      });
      setScope(r.scope);
      const lines = r.scope.budget_skeleton.length > 0
        ? r.scope.budget_skeleton
        : r.scope.categories.map((c) => ({ category: c.category, label: c.label, pct: 0, amount: 0 }));
      setItems(
        lines.map((line) => {
          const band = line.amount > 0 ? bandFromAmount(line.amount) : { min: '', max: '' };
          return {
            key: nextKey(),
            category: line.label,
            scope: `Source and confirm ${line.label.toLowerCase()} for this event.${description ? ` Client notes: ${description}` : ''}`,
            budget_min: band.min,
            budget_max: band.max,
          };
        }),
      );
      setEditingKey(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSuggesting(false);
    }
  }

  function updateItem(key: string, patch: Partial<SuggestedItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key));
    if (editingKey === key) setEditingKey(null);
  }

  function addItem() {
    const key = nextKey();
    setItems((prev) => [...prev, { key, category: '', scope: '', budget_min: '', budget_max: '' }]);
    setEditingKey(key);
  }

  async function publish() {
    const ready = items.filter((it) => it.category.trim());
    if (ready.length === 0) {
      setErr('Add at least one item with a category before publishing.');
      return;
    }
    setPublishing(true);
    setErr(null);
    setPublishResult(null);
    try {
      for (const it of ready) {
        await apiSend('POST', '/bids', {
          event_id: eventId,
          category: it.category.trim(),
          scope: it.scope.trim() || null,
          budget_min: it.budget_min ? Number(it.budget_min) : null,
          budget_max: it.budget_max ? Number(it.budget_max) : null,
          tier_access: tierAccess,
          rush: false,
          post: true,
        });
      }
      setPublishResult(`Published ${ready.length} bid${ready.length === 1 ? '' : 's'} to the Bid Board. Switch to the Bids tab to see and share them.`);
      setItems([]);
      setScope(null);
      setEditingKey(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  const suggestedTotal = items.reduce((s, it) => s + (Number(it.budget_max) || 0), 0);
  const eventBudget = ev?.budget ? Number(ev.budget) : null;

  return (
    <div>
      <style>{D_CSS}</style>
      {err ? <p className="ew-error">{err}</p> : null}

      <div className="ew-doc-sugg">
        <div className="ew-doc-title">Suggest bid items</div>
        <p className="ew-muted">Describe the event and we will suggest procurement categories, split across your budget, ready to publish to the bid marketplace.</p>
        <label className="ew-doc-desc">Describe your event
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="e.g. Wedding reception for 180 guests. We need catering, florals for centerpieces, a DJ, and lighting."
          />
        </label>
        <div className="ew-doc-actions">
          <button type="button" className="ew-btn" disabled={suggesting} onClick={suggest}>
            {suggesting ? 'Suggesting...' : 'Suggest bid items'}
          </button>
        </div>

        {scope ? (
          <p className="ew-muted ew-doc-scopenote">
            Detected {scope.event_type ?? 'event'}
            {scope.guest_count != null ? `, ${scope.guest_count} guests` : ''}
            {scope.budget != null ? `, $${scope.budget.toLocaleString()} budget` : ' (set an event budget to get suggested dollar ranges)'}.
          </p>
        ) : null}

        {items.length > 0 ? (
          <>
            {publishResult ? <p className="ew-doc-success">{publishResult}</p> : null}
            <div className="ew-doc-items">
              {items.map((it) => (
                <SuggestedItemRow
                  key={it.key}
                  item={it}
                  editing={editingKey === it.key}
                  onEdit={() => setEditingKey(it.key)}
                  onCancel={() => setEditingKey(null)}
                  onChange={(patch) => updateItem(it.key, patch)}
                  onRemove={() => removeItem(it.key)}
                />
              ))}
            </div>
            <div className="ew-doc-editrow">
              <button type="button" className="ew-btn ghost sm" onClick={addItem}>+ Add item</button>
              <label>Tier access
                <select value={tierAccess} onChange={(e) => setTierAccess(e.target.value)}>
                  {TIER_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </div>
            {eventBudget && suggestedTotal > eventBudget ? (
              <p className="ew-doc-warn">Suggested budgets total ${suggestedTotal.toLocaleString()}, above the event budget of ${eventBudget.toLocaleString()}. Adjust before publishing.</p>
            ) : null}
            <div className="ew-doc-actions">
              <button type="button" className="ew-btn" disabled={publishing} onClick={publish}>
                {publishing ? 'Publishing...' : 'Push to bid marketplace'}
              </button>
            </div>
          </>
        ) : null}
      </div>

      <div className="ew-doc-gen">
        <div>
          <div className="ew-doc-title">AI bid package</div>
          <p className="ew-muted">Assemble a vendor-ready package from this event's record.</p>
        </div>
        <button type="button" className="ew-btn ghost" onClick={generate} disabled={busy}>
          {busy ? 'Generating...' : 'Generate package'}
        </button>
      </div>

      {pkg ? (
        <div className="ew-doc-pkg">
          <div className="ew-doc-pkghead">
            <span className="ew-doc-pkgname">{pkg.event.name}</span>
            <span className="ew-doc-pkgts">Generated {new Date(pkg.generated_at).toLocaleString()}</span>
          </div>
          <dl className="ew-doc-dl">
            <div><dt>Type</dt><dd>{pkg.event.type ?? 'Not set'}</dd></div>
            <div><dt>Date</dt><dd>{pkg.event.date_time ? new Date(pkg.event.date_time).toLocaleString() : 'Not scheduled'}</dd></div>
            <div><dt>Guests</dt><dd>{pkg.event.guest_count ?? 'Not set'}</dd></div>
            <div><dt>Budget</dt><dd>{pkg.event.budget ? `$${Number(pkg.event.budget).toLocaleString()}` : 'Not set'}</dd></div>
            <div><dt>Required services</dt><dd>{pkg.scope.required_services.join(', ') || 'None listed'}</dd></div>
            <div><dt>Goals</dt><dd>{pkg.scope.goals ?? 'Not captured'}</dd></div>
          </dl>
          <p className="ew-doc-note">{pkg.notes}</p>
        </div>
      ) : (
        <div className="ew-empty">
          <p>No package generated yet. Generate one to share event details with vendors. Uploaded files such as contracts and certificates of insurance are managed in the shared document library.</p>
        </div>
      )}
    </div>
  );
}

function SuggestedItemRow({
  item, editing, onEdit, onCancel, onChange, onRemove,
}: {
  item: SuggestedItem;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onChange: (patch: Partial<SuggestedItem>) => void;
  onRemove: () => void;
}) {
  if (!editing) {
    return (
      <div className="ew-doc-item">
        <div className="ew-doc-itemmain">
          <span className="ew-doc-itemcat">{item.category || 'Untitled item'}</span>
          <span className="ew-doc-itembudget">
            {item.budget_min || item.budget_max
              ? `$${Number(item.budget_min || 0).toLocaleString()} - $${Number(item.budget_max || 0).toLocaleString()}`
              : 'No budget suggested'}
          </span>
        </div>
        {item.scope ? <p className="ew-doc-itemscope">{item.scope}</p> : null}
        <div className="ew-doc-itemactions">
          <button type="button" className="ew-btn ghost sm" onClick={onEdit}>Edit</button>
          <button type="button" className="ew-btn ghost sm" onClick={onRemove}>Remove</button>
        </div>
      </div>
    );
  }
  return (
    <div className="ew-doc-item is-editing">
      <label>Category
        <input value={item.category} onChange={(e) => onChange({ category: e.target.value })} placeholder="e.g. Florals and Decor" />
      </label>
      <label>Scope
        <textarea value={item.scope} onChange={(e) => onChange({ scope: e.target.value })} rows={2} />
      </label>
      <div className="ew-doc-editrow">
        <label>Budget min ($)
          <input value={item.budget_min} onChange={(e) => onChange({ budget_min: e.target.value })} placeholder="optional" />
        </label>
        <label>Budget max ($)
          <input value={item.budget_max} onChange={(e) => onChange({ budget_max: e.target.value })} placeholder="optional" />
        </label>
      </div>
      <div className="ew-doc-itemactions">
        <button type="button" className="ew-btn ghost sm" onClick={onCancel}>Done</button>
        <button type="button" className="ew-btn ghost sm" onClick={onRemove}>Remove</button>
      </div>
    </div>
  );
}

const D_CSS = `
.ew-doc-sugg { background: #fff; border: 1px solid #e7e1d6; border-radius: 12px; padding: 18px; margin-bottom: 20px; }
.ew-doc-gen { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; background: rgba(247,244,238,.6); border: 1px dashed #e7e1d6; border-radius: 12px; padding: 16px 18px; margin-bottom: 18px; }
.ew-doc-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 20px; color: #123c2e; }
.ew-doc-pkg { background: #fff; border: 1px solid #e7e1d6; border-radius: 12px; padding: 18px; }
.ew-doc-pkghead { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; border-bottom: 1px solid #e7e1d6; padding-bottom: 10px; margin-bottom: 12px; }
.ew-doc-pkgname { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22px; color: #123c2e; }
.ew-doc-pkgts { font-size: 11px; color: #b3aa99; }
.ew-doc-dl { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 18px; margin: 0; }
.ew-doc-dl div { display: flex; flex-direction: column; gap: 2px; }
.ew-doc-dl dt { font-size: 10.5px; letter-spacing: .4px; text-transform: uppercase; color: #9a8a5e; font-weight: 600; }
.ew-doc-dl dd { margin: 0; font-size: 13.5px; color: #2c2a26; }
.ew-doc-note { margin: 14px 0 0; font-size: 12px; color: #7d776c; font-style: italic; }
.ew-doc-success { margin: 10px 0 0; font-size: 12.5px; color: #1E5D4A; font-weight: 600; background: rgba(30,93,74,.08); border: 1px solid rgba(30,93,74,.25); border-radius: 9px; padding: 10px 12px; }
.ew-doc-warn { margin: 10px 0 0; font-size: 12.5px; color: #8a5a1a; font-weight: 600; background: rgba(201,163,91,.12); border: 1px solid rgba(201,163,91,.35); border-radius: 9px; padding: 10px 12px; }
.ew-doc-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }
.ew-doc-desc { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 600; color: #7d776c; margin: 12px 0; }
.ew-doc-desc textarea { font: inherit; font-size: 13px; padding: 8px 10px; border: 1px solid #e7e1d6; border-radius: 8px; background: #fff; color: #2c2a26; }
.ew-doc-scopenote { margin: 10px 0 0; }
.ew-doc-items { margin-top: 14px; display: flex; flex-direction: column; gap: 10px; }
.ew-doc-item { border: 1px solid #e7e1d6; border-radius: 10px; padding: 12px 14px; }
.ew-doc-item.is-editing { background: rgba(247,244,238,.5); display: flex; flex-direction: column; gap: 10px; }
.ew-doc-item.is-editing label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 600; color: #7d776c; }
.ew-doc-item.is-editing input, .ew-doc-item.is-editing textarea { font: inherit; font-size: 13px; padding: 8px 10px; border: 1px solid #e7e1d6; border-radius: 8px; background: #fff; color: #2c2a26; }
.ew-doc-itemmain { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.ew-doc-itemcat { font-weight: 700; color: #123c2e; font-size: 14px; }
.ew-doc-itembudget { font-size: 12.5px; color: #7d776c; font-variant-numeric: tabular-nums; }
.ew-doc-itemscope { margin: 6px 0 0; font-size: 12.5px; color: #4a463e; line-height: 1.5; }
.ew-doc-itemactions { display: flex; gap: 8px; margin-top: 8px; }
.ew-doc-editrow { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-end; margin-top: 10px; }
.ew-doc-editrow label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 600; color: #7d776c; flex: 1 1 160px; }
.ew-doc-editrow select, .ew-doc-editrow input { font: inherit; font-size: 13px; padding: 8px 10px; border: 1px solid #e7e1d6; border-radius: 8px; background: #fff; color: #2c2a26; }
.ew-btn.sm { padding: 6px 12px; font-size: 12px; }
@media (max-width: 720px) { .ew-doc-dl { grid-template-columns: 1fr; } }
`;
