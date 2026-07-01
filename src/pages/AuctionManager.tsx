import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

/**
 * Nonprofit Auction Management (Phase 2).
 *
 * A nonprofit catalogues donated items for a fundraising auction, takes bids,
 * awards a winner, then sends that winner through checkout (never auto-charged).
 * Every read/write goes through the org-scoped, IDOR-safe routes under
 * /api/auction:
 *   GET    /auction/items                 list items (+ current high bid)
 *   POST   /auction/items                 intake an item
 *   PATCH  /auction/items/:id             edit an item
 *   DELETE /auction/items/:id             remove an item
 *   GET    /auction/items/:id/bids        list bids
 *   POST   /auction/items/:id/bids        record a bid
 *   POST   /auction/items/:id/award       set the winner
 *   POST   /auction/items/:id/checkout    initiate hosted checkout
 *   PATCH  /auction/items/:id/payment     set payment status
 * A forged item id from another tenant is rejected server-side.
 */

// ---- Types (mirror server row shapes) --------------------------------------

type Item = {
  id: string;
  fundraising_event_id: string | null;
  organization_id: string | null;
  donor_name: string | null;
  item_name: string | null;
  description: string | null;
  estimated_value: string | null;
  image_urls: unknown;
  restrictions: string | null;
  expiration_date: string | null;
  pickup_info: string | null;
  winning_bidder_name: string | null;
  winning_bidder_org_id: string | null;
  winning_bid: string | null;
  payment_status: string | null;
  status: string | null;
  current_high_bid?: number;
};

type Bid = {
  id: string;
  bidder_name: string | null;
  bidder_org_id: string | null;
  amount: string | null;
  created_at: string;
};

const STATUSES = ['open', 'closed', 'awarded', 'cancelled'] as const;
const PAY_STATUSES = ['unpaid', 'pending', 'paid'] as const;

const EMPTY_INTAKE = {
  item_name: '',
  donor_name: '',
  description: '',
  estimated_value: '',
  image_urls: '',
  restrictions: '',
  expiration_date: '',
  pickup_info: '',
};

function money(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  if (!Number.isFinite(n)) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function imagesOf(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
    } catch {
      /* fall through */
    }
  }
  return [];
}

export default function AuctionManager(): React.ReactElement {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [intake, setIntake] = useState({ ...EMPTY_INTAKE });
  const [saving, setSaving] = useState(false);

  const [openItem, setOpenItem] = useState<string | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [highBid, setHighBid] = useState(0);
  const [bidForm, setBidForm] = useState({ bidder_name: '', amount: '' });
  const [awardForm, setAwardForm] = useState({ winning_bidder_name: '', winning_bid: '', winner_email: '' });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await apiGet<{ items: Item[] }>('/auction/items');
      setItems(r.items ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function flash(msg: string) {
    setNotice(msg);
    setError(null);
    window.setTimeout(() => setNotice(null), 4000);
  }

  async function createItem(e: React.FormEvent) {
    e.preventDefault();
    if (!intake.item_name.trim()) {
      setError('Item name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        item_name: intake.item_name.trim(),
        donor_name: intake.donor_name.trim() || null,
        description: intake.description.trim() || null,
        estimated_value: intake.estimated_value ? Number(intake.estimated_value) : 0,
        image_urls: intake.image_urls
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        restrictions: intake.restrictions.trim() || null,
        expiration_date: intake.expiration_date || null,
        pickup_info: intake.pickup_info.trim() || null,
      };
      await apiSend('POST', '/auction/items', payload);
      setIntake({ ...EMPTY_INTAKE });
      flash('Item added to the auction.');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(id: string) {
    if (!window.confirm('Remove this auction item? Its bids are deleted too.')) return;
    try {
      await apiSend('DELETE', `/auction/items/${id}`);
      if (openItem === id) setOpenItem(null);
      flash('Item removed.');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function setItemStatus(id: string, status: string) {
    try {
      await apiSend('PATCH', `/auction/items/${id}`, { status });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function openBids(id: string) {
    if (openItem === id) {
      setOpenItem(null);
      return;
    }
    setOpenItem(id);
    setBids([]);
    setHighBid(0);
    setBidForm({ bidder_name: '', amount: '' });
    const item = items.find((i) => i.id === id);
    setAwardForm({
      winning_bidder_name: item?.winning_bidder_name ?? '',
      winning_bid: item?.winning_bid ?? '',
      winner_email: '',
    });
    try {
      const r = await apiGet<{ bids: Bid[]; current_high_bid: number }>(`/auction/items/${id}/bids`);
      setBids(r.bids ?? []);
      setHighBid(r.current_high_bid ?? 0);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addBid(id: string, e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(bidForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('A positive bid amount is required.');
      return;
    }
    try {
      const r = await apiSend<{ bid: Bid; current_high_bid: number }>('POST', `/auction/items/${id}/bids`, {
        bidder_name: bidForm.bidder_name.trim() || null,
        amount,
      });
      setBids((b) => [r.bid, ...b].sort((x, y) => Number(y.amount) - Number(x.amount)));
      setHighBid(r.current_high_bid ?? amount);
      setBidForm({ bidder_name: '', amount: '' });
      flash('Bid recorded.');
      await load();
    } catch (e2) {
      setError((e2 as Error).message);
    }
  }

  async function award(id: string, e: React.FormEvent) {
    e.preventDefault();
    if (!awardForm.winning_bidder_name.trim()) {
      setError('Winner name is required to award.');
      return;
    }
    try {
      await apiSend('POST', `/auction/items/${id}/award`, {
        winning_bidder_name: awardForm.winning_bidder_name.trim(),
        winning_bid: awardForm.winning_bid ? Number(awardForm.winning_bid) : undefined,
        winner_email: awardForm.winner_email.trim() || undefined,
      });
      flash('Item awarded. The winner was notified that payment is due.');
      await load();
    } catch (e2) {
      setError((e2 as Error).message);
    }
  }

  async function checkout(id: string) {
    try {
      const r = await apiSend<{ redirect_url?: string; record_only?: boolean; message?: string }>(
        'POST',
        `/auction/items/${id}/checkout`,
        {},
      );
      if (r.redirect_url) {
        flash('Checkout initiated. Opening the secure payment page.');
        window.open(r.redirect_url, '_blank', 'noopener');
      } else if (r.record_only) {
        flash(r.message ?? 'Marked pending for offline collection.');
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function setPayment(id: string, payment_status: string) {
    try {
      await apiSend('PATCH', `/auction/items/${id}/payment`, { payment_status });
      flash(`Payment marked ${payment_status}.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="am">
      <style>{CSS}</style>

      <header className="am-head">
        <h1>Auction Management</h1>
        <p>Catalogue donated items, take bids, award winners, and collect payment. Bidders are never charged automatically.</p>
      </header>

      {error && <div className="am-error">{error}</div>}
      {notice && <div className="am-notice">{notice}</div>}

      <section className="am-card">
        <h2>Add an item</h2>
        <form onSubmit={createItem} className="am-grid">
          <label className="am-field">
            <span>Item name *</span>
            <input value={intake.item_name} onChange={(e) => setIntake({ ...intake, item_name: e.target.value })} placeholder="Weekend at the lake house" />
          </label>
          <label className="am-field">
            <span>Donor</span>
            <input value={intake.donor_name} onChange={(e) => setIntake({ ...intake, donor_name: e.target.value })} placeholder="The Marlowe Family" />
          </label>
          <label className="am-field">
            <span>Estimated value</span>
            <input type="number" min="0" step="0.01" value={intake.estimated_value} onChange={(e) => setIntake({ ...intake, estimated_value: e.target.value })} placeholder="1500" />
          </label>
          <label className="am-field">
            <span>Expiration date</span>
            <input type="date" value={intake.expiration_date} onChange={(e) => setIntake({ ...intake, expiration_date: e.target.value })} />
          </label>
          <label className="am-field wide">
            <span>Description</span>
            <textarea rows={2} value={intake.description} onChange={(e) => setIntake({ ...intake, description: e.target.value })} placeholder="Three-night stay for up to six guests." />
          </label>
          <label className="am-field wide">
            <span>Image URLs (one per line)</span>
            <textarea rows={2} value={intake.image_urls} onChange={(e) => setIntake({ ...intake, image_urls: e.target.value })} placeholder="https://..." />
          </label>
          <label className="am-field">
            <span>Restrictions</span>
            <input value={intake.restrictions} onChange={(e) => setIntake({ ...intake, restrictions: e.target.value })} placeholder="Blackout dates apply" />
          </label>
          <label className="am-field">
            <span>Pickup info</span>
            <input value={intake.pickup_info} onChange={(e) => setIntake({ ...intake, pickup_info: e.target.value })} placeholder="Coordinate with donor" />
          </label>
          <div className="am-row-actions wide">
            <button className="am-btn" type="submit" disabled={saving}>{saving ? 'Adding...' : 'Add item'}</button>
          </div>
        </form>
      </section>

      <section>
        <div className="am-card-head">
          <h2>Items ({items.length})</h2>
        </div>

        {loading ? (
          <div className="am-empty">Loading auction items.</div>
        ) : items.length === 0 ? (
          <div className="am-empty">No auction items yet. Add your first donated item above.</div>
        ) : (
          <div className="am-items">
            {items.map((it) => {
              const imgs = imagesOf(it.image_urls);
              const isOpen = openItem === it.id;
              return (
                <div className="am-item" key={it.id}>
                  <div className="am-item-top">
                    {imgs[0] ? (
                      <img className="am-thumb" src={imgs[0]} alt={it.item_name ?? 'item'} />
                    ) : (
                      <div className="am-thumb am-thumb-empty">No image</div>
                    )}
                    <div className="am-item-main">
                      <div className="am-item-title">
                        <strong>{it.item_name || 'Untitled item'}</strong>
                        <span className={`am-tag am-tag-${it.status ?? 'open'}`}>{it.status ?? 'open'}</span>
                        <span className={`am-tag am-pay-${it.payment_status ?? 'unpaid'}`}>{it.payment_status ?? 'unpaid'}</span>
                      </div>
                      {it.donor_name && <div className="am-muted">Donated by {it.donor_name}</div>}
                      {it.description && <div className="am-desc">{it.description}</div>}
                      <div className="am-stats">
                        <span>Est. {money(it.estimated_value)}</span>
                        <span>High bid {money(it.current_high_bid ?? 0)}</span>
                        {it.winning_bidder_name && <span>Won by {it.winning_bidder_name} at {money(it.winning_bid)}</span>}
                      </div>
                      {(it.restrictions || it.pickup_info || it.expiration_date) && (
                        <div className="am-fine">
                          {it.restrictions && <span>Restrictions: {it.restrictions}</span>}
                          {it.expiration_date && <span>Expires: {new Date(it.expiration_date).toLocaleDateString()}</span>}
                          {it.pickup_info && <span>Pickup: {it.pickup_info}</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="am-actions">
                    <button className="am-btn ghost" onClick={() => openBids(it.id)}>{isOpen ? 'Hide bids' : 'Bids & award'}</button>
                    <select value={it.status ?? 'open'} onChange={(e) => setItemStatus(it.id, e.target.value)}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {it.status === 'awarded' && (
                      <>
                        <button className="am-btn" onClick={() => checkout(it.id)} disabled={it.payment_status === 'paid'}>Collect payment</button>
                        <select value={it.payment_status ?? 'unpaid'} onChange={(e) => setPayment(it.id, e.target.value)}>
                          {PAY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </>
                    )}
                    <button className="am-btn danger" onClick={() => removeItem(it.id)}>Remove</button>
                  </div>

                  {isOpen && (
                    <div className="am-bidpanel">
                      <div className="am-bidcol">
                        <h3>Bids (high {money(highBid)})</h3>
                        <form onSubmit={(e) => addBid(it.id, e)} className="am-bidform">
                          <input value={bidForm.bidder_name} onChange={(e) => setBidForm({ ...bidForm, bidder_name: e.target.value })} placeholder="Bidder name" />
                          <input type="number" min="0" step="0.01" value={bidForm.amount} onChange={(e) => setBidForm({ ...bidForm, amount: e.target.value })} placeholder="Amount" />
                          <button className="am-btn" type="submit">Record bid</button>
                        </form>
                        {bids.length === 0 ? (
                          <div className="am-empty sm">No bids yet.</div>
                        ) : (
                          <ul className="am-bidlist">
                            {bids.map((b) => (
                              <li key={b.id}>
                                <span>{b.bidder_name || 'Anonymous'}</span>
                                <strong>{money(b.amount)}</strong>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="am-bidcol">
                        <h3>Award</h3>
                        <form onSubmit={(e) => award(it.id, e)} className="am-awardform">
                          <label className="am-field">
                            <span>Winner name *</span>
                            <input value={awardForm.winning_bidder_name} onChange={(e) => setAwardForm({ ...awardForm, winning_bidder_name: e.target.value })} placeholder="Winning bidder" />
                          </label>
                          <label className="am-field">
                            <span>Winning bid (blank = high bid)</span>
                            <input type="number" min="0" step="0.01" value={awardForm.winning_bid} onChange={(e) => setAwardForm({ ...awardForm, winning_bid: e.target.value })} placeholder={String(highBid || '')} />
                          </label>
                          <label className="am-field">
                            <span>Winner email (for notice)</span>
                            <input type="email" value={awardForm.winner_email} onChange={(e) => setAwardForm({ ...awardForm, winner_email: e.target.value })} placeholder="winner@example.com" />
                          </label>
                          <button className="am-btn" type="submit">Award item</button>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

const CSS = `
.am { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color:var(--ink);
  max-width:1100px; margin:0 auto; padding:24px 20px 64px; }
.am-head h1 { font-size:26px; margin:0 0 4px; color:var(--e); letter-spacing:-.01em; }
.am-head p { margin:0 0 18px; color:var(--mut); font-size:14px; }
.am-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.am-notice { background:rgba(30,93,74,.1); border:1px solid rgba(30,93,74,.3); color:var(--e2); padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.am-card { background:#fff; border:1px solid var(--ln); border-radius:16px; padding:20px 22px; margin-bottom:22px; }
.am-card h2, .am-card-head h2 { font-size:16px; margin:0 0 14px; color:var(--e); }
.am-card-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
.am-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:14px; }
.am-field { display:flex; flex-direction:column; gap:5px; }
.am-field.wide { grid-column:1 / -1; }
.am-field span { font-size:12px; color:var(--mut); font-weight:600; }
.am-field input, .am-field select, .am-field textarea, .am-bidform input, .am-actions select {
  font:inherit; font-size:13px; color:var(--ink); padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; }
.am-field textarea { resize:vertical; }
.am-row-actions { display:flex; gap:10px; }
.am-btn { font:inherit; font-size:13px; font-weight:600; padding:9px 16px; border-radius:10px; border:1px solid var(--e); background:var(--e); color:var(--iv); cursor:pointer; }
.am-btn:hover { background:var(--e2); }
.am-btn[disabled] { opacity:.5; cursor:not-allowed; }
.am-btn.ghost { background:#fff; color:var(--e); border:1px solid var(--ln); }
.am-btn.danger { background:#fff; color:#9a3a28; border:1px solid #e7b7ab; }
.am-empty { padding:40px; text-align:center; color:var(--mut); border:1px dashed var(--ln); border-radius:14px; background:rgba(247,244,238,.55); }
.am-empty.sm { padding:18px; }
.am-items { display:flex; flex-direction:column; gap:14px; }
.am-item { background:#fff; border:1px solid var(--ln); border-radius:16px; padding:16px 18px; }
.am-item-top { display:flex; gap:14px; }
.am-thumb { width:96px; height:96px; object-fit:cover; border-radius:12px; border:1px solid var(--ln); flex:none; background:var(--iv); }
.am-thumb-empty { display:flex; align-items:center; justify-content:center; color:var(--mut); font-size:11px; }
.am-item-main { flex:1; min-width:0; }
.am-item-title { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.am-item-title strong { font-size:15px; color:var(--ink); }
.am-tag { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; padding:2px 8px; border-radius:999px; background:var(--iv); color:var(--mut); border:1px solid var(--ln); }
.am-tag-open { color:var(--e2); border-color:rgba(30,93,74,.3); background:rgba(30,93,74,.08); }
.am-tag-awarded { color:#8a6a18; border-color:rgba(201,163,91,.5); background:rgba(201,163,91,.14); }
.am-tag-cancelled { color:#9a3a28; }
.am-pay-paid { color:var(--e2); border-color:rgba(30,93,74,.3); background:rgba(30,93,74,.08); }
.am-pay-pending { color:#8a6a18; border-color:rgba(201,163,91,.5); background:rgba(201,163,91,.14); }
.am-muted { font-size:12px; color:var(--mut); margin-top:3px; }
.am-desc { font-size:13px; color:var(--ink); margin-top:6px; }
.am-stats { display:flex; gap:16px; flex-wrap:wrap; margin-top:8px; font-size:13px; color:var(--e); font-weight:600; }
.am-fine { display:flex; gap:14px; flex-wrap:wrap; margin-top:6px; font-size:11.5px; color:var(--mut); }
.am-actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:14px; padding-top:12px; border-top:1px solid var(--ln); }
.am-bidpanel { display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-top:14px; padding-top:14px; border-top:1px dashed var(--ln); }
.am-bidcol h3 { font-size:13px; margin:0 0 10px; color:var(--e); }
.am-bidform { display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap; }
.am-bidform input { flex:1; min-width:90px; }
.am-bidlist { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px; }
.am-bidlist li { display:flex; justify-content:space-between; font-size:13px; padding:6px 10px; background:var(--iv); border-radius:8px; }
.am-awardform { display:flex; flex-direction:column; gap:10px; }
@media (max-width:760px) { .am-grid { grid-template-columns:1fr; } .am-bidpanel { grid-template-columns:1fr; } }
`;
