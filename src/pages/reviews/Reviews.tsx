import React, { useEffect, useMemo, useState } from 'react';
import { apiGet, apiSend } from '../../lib/api';

// Phase 7 - Reviews (blueprint 27). Leave reviews across marketplace
// relationships, fill in requested reviews, and view reviews you have given and
// received. Self-contained styles in the Divini Partners palette.

type CriteriaDef = { key: string; label: string };
type Relationship = { key: string; label: string; targetType: string };
type Meta = { relationships: Relationship[]; criteria: Record<string, CriteriaDef[]> };

type Review = {
  id: string;
  relationship?: string;
  target_type?: string;
  rating?: number | string | null;
  criteria?: Record<string, number> | null;
  body?: string | null;
  status?: string | null;
  created_at?: string;
};

function stars(rating?: number | string | null) {
  const n = Number(rating);
  if (!Number.isFinite(n)) return 'n/a';
  const full = Math.round(n);
  return '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full));
}

export default function Reviews() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [given, setGiven] = useState<Review[]>([]);
  const [received, setReceived] = useState<Review[]>([]);
  const [requests, setRequests] = useState<Review[]>([]);
  const [tab, setTab] = useState<'given' | 'received' | 'requests'>('given');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // composer state
  const [relationship, setRelationship] = useState<string>('');
  const [revieweeOrg, setRevieweeOrg] = useState('');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [m, g, rc, rq] = await Promise.all([
        apiGet<Meta>('/reviews/meta'),
        apiGet<{ reviews: Review[] }>('/reviews'),
        apiGet<{ reviews: Review[] }>('/reviews/received'),
        apiGet<{ reviews: Review[] }>('/reviews/requests'),
      ]);
      setMeta(m);
      setGiven(g.reviews || []);
      setReceived(rc.reviews || []);
      setRequests(rq.reviews || []);
      if (!relationship && m.relationships[0]) setRelationship(m.relationships[0].key);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const targetType = useMemo(
    () => meta?.relationships.find((r) => r.key === relationship)?.targetType ?? 'org',
    [meta, relationship],
  );
  const criteria = meta?.criteria?.[targetType] ?? [];

  async function submit() {
    if (!relationship) return;
    setSaving(true);
    try {
      await apiSend('POST', '/reviews', {
        relationship,
        reviewee_org_id: revieweeOrg || undefined,
        criteria: scores,
        body: body || undefined,
      });
      setScores({});
      setBody('');
      setRevieweeOrg('');
      await load();
      setTab('given');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function submitRequest(id: string, c: Record<string, number>, note: string) {
    try {
      await apiSend('POST', `/reviews/${id}/submit`, { criteria: c, body: note || undefined });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const list = tab === 'given' ? given : tab === 'received' ? received : requests;

  return (
    <div className="rv">
      <style>{CSS}</style>

      <header className="rv-head">
        <div>
          <span className="rv-kicker">Trust and Reputation</span>
          <h1 className="rv-title">Reviews</h1>
          <p className="rv-sub">Leave post-event reviews and see the feedback you have earned.</p>
        </div>
      </header>

      {error && <div className="rv-error">{error}</div>}

      <section className="rv-composer">
        <h2>Leave a review</h2>
        <div className="rv-form">
          <label>Relationship
            <select value={relationship} onChange={(e) => { setRelationship(e.target.value); setScores({}); }}>
              {(meta?.relationships ?? []).map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </label>
          <label>Reviewee organization id (optional)
            <input value={revieweeOrg} onChange={(e) => setRevieweeOrg(e.target.value)} placeholder="org uuid" />
          </label>
        </div>

        <div className="rv-criteria">
          {criteria.map((c) => (
            <div key={c.key} className="rv-crit">
              <span className="rv-crit-label">{c.label}</span>
              <div className="rv-stars" role="radiogroup" aria-label={c.label}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`rv-star ${(scores[c.key] ?? 0) >= n ? 'on' : ''}`}
                    onClick={() => setScores((s) => ({ ...s, [c.key]: n }))}
                    aria-label={`${n} star${n === 1 ? '' : 's'}`}
                  >{'★'}</button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <label className="rv-body-label">Comments
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="What stood out about working together?" />
        </label>

        <button type="button" className="rv-btn" disabled={saving || criteria.length === 0} onClick={submit}>
          {saving ? 'Submitting.' : 'Submit review'}
        </button>
      </section>

      <div className="rv-tabs">
        <button type="button" className={tab === 'given' ? 'on' : ''} onClick={() => setTab('given')}>Given ({given.length})</button>
        <button type="button" className={tab === 'received' ? 'on' : ''} onClick={() => setTab('received')}>Received ({received.length})</button>
        <button type="button" className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>Requests ({requests.length})</button>
      </div>

      {loading ? (
        <div className="rv-empty">Loading reviews.</div>
      ) : list.length === 0 ? (
        <div className="rv-empty">
          {tab === 'requests' ? 'No pending review requests.' : tab === 'received' ? 'No reviews about you yet.' : 'No reviews written yet.'}
        </div>
      ) : (
        <div className="rv-list">
          {list.map((r) => (
            <ReviewCard
              key={r.id}
              review={r}
              meta={meta}
              isRequest={tab === 'requests'}
              onSubmit={submitRequest}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({
  review,
  meta,
  isRequest,
  onSubmit,
}: {
  review: Review;
  meta: Meta | null;
  isRequest: boolean;
  onSubmit: (id: string, c: Record<string, number>, note: string) => void;
}) {
  const targetType = review.target_type ?? 'org';
  const criteria = meta?.criteria?.[targetType] ?? [];
  const relLabel = meta?.relationships.find((x) => x.key === review.relationship)?.label ?? review.relationship ?? 'Review';
  const [scores, setScores] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');

  if (isRequest) {
    return (
      <article className="rv-card">
        <div className="rv-card-top">
          <span className="rv-rel">{relLabel}</span>
          <span className="rv-status requested">requested</span>
        </div>
        <p className="rv-card-sub">A review was requested from you. Rate and submit.</p>
        <div className="rv-criteria sm">
          {criteria.map((c) => (
            <div key={c.key} className="rv-crit">
              <span className="rv-crit-label">{c.label}</span>
              <div className="rv-stars">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" className={`rv-star ${(scores[c.key] ?? 0) >= n ? 'on' : ''}`} onClick={() => setScores((s) => ({ ...s, [c.key]: n }))}>{'★'}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <textarea className="rv-mini" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional comments" />
        <button type="button" className="rv-btn sm" onClick={() => onSubmit(review.id, scores, note)}>Submit</button>
      </article>
    );
  }

  return (
    <article className="rv-card">
      <div className="rv-card-top">
        <span className="rv-rel">{relLabel}</span>
        {review.status && <span className={`rv-status ${review.status}`}>{review.status}</span>}
      </div>
      <div className="rv-rating">{stars(review.rating)} <span className="rv-rating-num">{review.rating != null ? Number(review.rating).toFixed(1) : ''}</span></div>
      {review.body && <p className="rv-text">{review.body}</p>}
      {review.criteria && (
        <ul className="rv-crit-list">
          {Object.entries(review.criteria).map(([k, v]) => (
            <li key={k}><span>{k}</span><strong>{v}/5</strong></li>
          ))}
        </ul>
      )}
    </article>
  );
}

const CSS = `
.rv { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:1100px; }
.rv *,.rv *::before,.rv *::after { box-sizing:border-box; }
.rv h1,.rv h2,.rv h3 { font-family:'Cormorant Garamond',Georgia,serif; margin:0; }
.rv-head { margin-bottom:20px; }
.rv-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.rv-title { font-size:28px; color:var(--e); line-height:1.1; }
.rv-sub { font-size:13px; color:var(--mut); margin:4px 0 0; }
.rv-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.rv-composer { background:#fff; border:1px solid var(--ln); border-radius:16px; padding:20px 22px; margin-bottom:24px; }
.rv-composer h2 { font-size:21px; color:var(--e); margin-bottom:14px; }
.rv-form { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px; }
.rv-form label,.rv-body-label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; }
.rv-form input,.rv-form select,.rv textarea { font:inherit; font-size:13px; color:var(--ink); padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; }
.rv textarea { min-height:64px; resize:vertical; }
.rv-criteria { display:grid; grid-template-columns:repeat(2,1fr); gap:10px 24px; margin-bottom:14px; }
.rv-criteria.sm { grid-template-columns:1fr; margin:8px 0; }
.rv-crit { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.rv-crit-label { font-size:12.5px; color:var(--ink); }
.rv-stars { display:inline-flex; gap:2px; }
.rv-star { background:none; border:0; cursor:pointer; font-size:18px; line-height:1; color:var(--ln); padding:0 1px; }
.rv-star.on { color:var(--g); }
.rv-body-label { margin-bottom:14px; }
.rv-btn { background:var(--e); color:#fff; border:0; border-radius:9px; font:inherit; font-size:12.5px; font-weight:600; padding:9px 18px; cursor:pointer; }
.rv-btn:hover { background:var(--e2); }
.rv-btn.sm { padding:7px 14px; font-size:11.5px; }
.rv-btn:disabled { opacity:.55; cursor:default; }
.rv-tabs { display:flex; gap:6px; border-bottom:1px solid var(--ln); margin-bottom:16px; }
.rv-tabs button { background:none; border:0; border-bottom:2px solid transparent; font:inherit; font-size:13px; font-weight:600; color:var(--mut); padding:8px 12px; cursor:pointer; }
.rv-tabs button.on { color:var(--e); border-bottom-color:var(--g); }
.rv-empty { padding:40px; text-align:center; color:var(--mut); border:1px dashed var(--ln); border-radius:14px; background:rgba(247,244,238,.55); }
.rv-list { display:grid; grid-template-columns:repeat(2,1fr); gap:14px; }
.rv-card { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:18px; }
.rv-card-top { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px; }
.rv-rel { font-size:11.5px; color:var(--g); font-weight:600; text-transform:capitalize; }
.rv-status { font-size:10px; letter-spacing:.5px; text-transform:uppercase; padding:2px 8px; border-radius:999px; font-weight:600; background:rgba(30,93,74,.12); color:var(--e2); }
.rv-status.requested { background:rgba(201,163,91,.2); color:#7a5e22; }
.rv-card-sub { font-size:12px; color:var(--mut); margin:0 0 6px; }
.rv-rating { font-size:18px; color:var(--g); letter-spacing:2px; }
.rv-rating-num { font-size:13px; color:var(--mut); letter-spacing:0; margin-left:6px; }
.rv-text { font-size:13px; color:var(--ink); line-height:1.55; margin:8px 0; }
.rv-crit-list { list-style:none; margin:8px 0 0; padding:0; display:grid; grid-template-columns:repeat(2,1fr); gap:4px 14px; }
.rv-crit-list li { display:flex; justify-content:space-between; font-size:11.5px; color:var(--mut); text-transform:capitalize; }
.rv-crit-list strong { color:var(--e); }
.rv-mini { width:100%; margin:6px 0 10px; }
@media (max-width:820px){ .rv-form,.rv-criteria,.rv-list { grid-template-columns:1fr; } }
`;
