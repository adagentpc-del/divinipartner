import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiSend, apiUpload } from '../../lib/api';

/**
 * Divini Partners - My Decks and Programs.
 *
 * One owner-facing surface (reachable from every role dashboard's profile nav:
 * venue, vendor, sponsor, nonprofit) to:
 *   (1) upload pitch decks / marketing collateral (file or external link) and
 *       set each one public or private, and
 *   (2) create custom programs / offerings (title, summary, details, price /
 *       terms, call to action) that render on the public profile.
 *
 * Decks upload through the existing multipart pipeline (apiUpload -> multer ->
 * local disk storage). Public decks + active programs are surfaced on the public
 * profile (/api/profile-extras/public/:slug). The Divini shell stays Divini
 * branded. Zero em dashes.
 */

type Deck = {
  id: string;
  title: string;
  kind: string;
  storage_key: string | null;
  file_url: string | null;
  file_name: string | null;
  content_type: string | null;
  visibility: string;
  sort: number;
  created_at: string;
};

type Program = {
  id: string;
  title: string;
  summary: string | null;
  details: string | null;
  price_terms: string | null;
  cta_label: string | null;
  cta_url: string | null;
  active: boolean;
  sort: number;
};

const DECK_KINDS = [
  { key: 'deck', label: 'Pitch deck' },
  { key: 'brochure', label: 'Brochure' },
  { key: 'one_pager', label: 'One pager' },
  { key: 'case_study', label: 'Case study' },
  { key: 'media_kit', label: 'Media kit' },
  { key: 'other', label: 'Other' },
];

function kindLabel(kind: string): string {
  return DECK_KINDS.find((k) => k.key === kind)?.label ?? 'Deck';
}

export default function ProfileDecksPrograms() {
  const nav = useNavigate();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Deck upload form.
  const fileRef = useRef<HTMLInputElement>(null);
  const [deckTitle, setDeckTitle] = useState('');
  const [deckKind, setDeckKind] = useState('deck');
  const [deckVisibility, setDeckVisibility] = useState('public');
  const [deckUrl, setDeckUrl] = useState('');
  const [deckBusy, setDeckBusy] = useState(false);

  // Program form.
  const [pTitle, setPTitle] = useState('');
  const [pSummary, setPSummary] = useState('');
  const [pDetails, setPDetails] = useState('');
  const [pPrice, setPPrice] = useState('');
  const [pCtaLabel, setPCtaLabel] = useState('');
  const [pCtaUrl, setPCtaUrl] = useState('');
  const [pBusy, setPBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [d, p] = await Promise.all([
        apiGet<{ decks: Deck[] }>('/profile-extras/decks'),
        apiGet<{ programs: Program[] }>('/profile-extras/programs'),
      ]);
      setDecks(Array.isArray(d.decks) ? d.decks : []);
      setPrograms(Array.isArray(p.programs) ? p.programs : []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadDeck() {
    setDeckBusy(true);
    setError(null);
    try {
      const file = fileRef.current?.files?.[0] ?? null;
      if (!file && !deckUrl.trim()) {
        throw new Error('Choose a file or paste an external link.');
      }
      if (file) {
        const form = new FormData();
        form.append('file', file);
        form.append('title', deckTitle.trim() || file.name);
        form.append('kind', deckKind);
        form.append('visibility', deckVisibility);
        await apiUpload<{ deck: Deck }>('/profile-extras/decks', form);
      } else {
        if (!deckTitle.trim()) throw new Error('Add a title for the linked deck.');
        await apiSend<{ deck: Deck }>('POST', '/profile-extras/decks', {
          title: deckTitle.trim(),
          kind: deckKind,
          visibility: deckVisibility,
          fileUrl: deckUrl.trim(),
        });
      }
      setDeckTitle('');
      setDeckUrl('');
      setDeckKind('deck');
      setDeckVisibility('public');
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeckBusy(false);
    }
  }

  async function toggleDeckVisibility(deck: Deck) {
    const next = deck.visibility === 'public' ? 'private' : 'public';
    try {
      await apiSend<{ deck: Deck }>('PATCH', `/profile-extras/decks/${deck.id}`, { visibility: next });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeDeck(id: string) {
    if (!window.confirm('Remove this deck? This cannot be undone.')) return;
    try {
      await apiSend('DELETE', `/profile-extras/decks/${id}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function deckLink(deck: Deck): string {
    if (deck.file_url) return deck.file_url;
    const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    return `${BASE}/api/profile-extras/decks/${deck.id}/download`;
  }

  async function createProgram() {
    setPBusy(true);
    setError(null);
    try {
      if (!pTitle.trim()) throw new Error('Give your program a title.');
      await apiSend<{ program: Program }>('POST', '/profile-extras/programs', {
        title: pTitle.trim(),
        summary: pSummary.trim() || undefined,
        details: pDetails.trim() || undefined,
        priceTerms: pPrice.trim() || undefined,
        ctaLabel: pCtaLabel.trim() || undefined,
        ctaUrl: pCtaUrl.trim() || undefined,
        active: true,
      });
      setPTitle('');
      setPSummary('');
      setPDetails('');
      setPPrice('');
      setPCtaLabel('');
      setPCtaUrl('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPBusy(false);
    }
  }

  async function toggleProgram(program: Program) {
    try {
      await apiSend<{ program: Program }>('PATCH', `/profile-extras/programs/${program.id}`, {
        active: !program.active,
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeProgram(id: string) {
    if (!window.confirm('Delete this program? This cannot be undone.')) return;
    try {
      await apiSend('DELETE', `/profile-extras/programs/${id}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="dpdk">
      <style>{CSS}</style>

      <header className="dpdk-top">
        <div className="dpdk-brand">
          <span className="dpdk-logo">D</span>
          <div>
            <div className="dpdk-name">Divini Partners</div>
            <div className="dpdk-by">by Divini Group</div>
          </div>
        </div>
        <div className="dpdk-topactions">
          <button className="dpdk-ghost" onClick={() => nav('/profile')}>Profile editor</button>
          <button className="dpdk-ghost" onClick={() => nav('/app')}>Back to dashboard</button>
        </div>
      </header>

      <main className="dpdk-main">
        <div className="dpdk-head">
          <h1>Decks and Programs</h1>
          <p>
            Upload pitch decks and marketing collateral, and publish custom programs or offerings.
            Anything marked public appears on your public profile.
          </p>
        </div>

        {error && <div className="dpdk-error">{error}</div>}
        {loading && <div className="dpdk-muted">Loading.</div>}

        {!loading && (
          <>
            {/* ---- Decks ---- */}
            <section className="dpdk-section">
              <h2>Pitch decks and collateral</h2>

              <div className="dpdk-form">
                <div className="dpdk-row">
                  <label className="dpdk-field">
                    <span>Title</span>
                    <input
                      value={deckTitle}
                      placeholder="2024 Capabilities Deck"
                      onChange={(e) => setDeckTitle(e.target.value)}
                    />
                  </label>
                  <label className="dpdk-field">
                    <span>Type</span>
                    <select value={deckKind} onChange={(e) => setDeckKind(e.target.value)}>
                      {DECK_KINDS.map((k) => (
                        <option key={k.key} value={k.key}>{k.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="dpdk-field">
                    <span>Visibility</span>
                    <select value={deckVisibility} onChange={(e) => setDeckVisibility(e.target.value)}>
                      <option value="public">Public (shows on profile)</option>
                      <option value="private">Private (only you)</option>
                    </select>
                  </label>
                </div>
                <div className="dpdk-row">
                  <label className="dpdk-field">
                    <span>Upload a file (PDF, image, or doc)</span>
                    <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.csv" />
                  </label>
                  <label className="dpdk-field">
                    <span>or paste an external link</span>
                    <input
                      value={deckUrl}
                      placeholder="https://..."
                      onChange={(e) => setDeckUrl(e.target.value)}
                    />
                  </label>
                </div>
                <button className="dpdk-btn" disabled={deckBusy} onClick={uploadDeck}>
                  {deckBusy ? 'Adding.' : 'Add deck'}
                </button>
              </div>

              {decks.length === 0 ? (
                <div className="dpdk-empty">No decks yet. Upload your capabilities deck or media kit above.</div>
              ) : (
                <ul className="dpdk-list">
                  {decks.map((deck) => (
                    <li className="dpdk-item" key={deck.id}>
                      <div className="dpdk-itemmain">
                        <a href={deckLink(deck)} target="_blank" rel="noreferrer" className="dpdk-itemtitle">
                          {deck.title}
                        </a>
                        <span className="dpdk-tags">
                          <span className="dpdk-tag">{kindLabel(deck.kind)}</span>
                          <span className={`dpdk-tag ${deck.visibility === 'public' ? 'is-public' : 'is-private'}`}>
                            {deck.visibility === 'public' ? 'Public' : 'Private'}
                          </span>
                          {deck.file_url && <span className="dpdk-tag">Link</span>}
                        </span>
                      </div>
                      <div className="dpdk-itemactions">
                        <button className="dpdk-mini" onClick={() => toggleDeckVisibility(deck)}>
                          {deck.visibility === 'public' ? 'Make private' : 'Make public'}
                        </button>
                        <button className="dpdk-mini danger" onClick={() => removeDeck(deck.id)}>Remove</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ---- Programs ---- */}
            <section className="dpdk-section">
              <h2>Custom programs and offerings</h2>

              <div className="dpdk-form">
                <div className="dpdk-row">
                  <label className="dpdk-field">
                    <span>Title</span>
                    <input
                      value={pTitle}
                      placeholder="Founding Sponsor Program"
                      onChange={(e) => setPTitle(e.target.value)}
                    />
                  </label>
                  <label className="dpdk-field">
                    <span>Price or terms</span>
                    <input
                      value={pPrice}
                      placeholder="From $5,000 / season"
                      onChange={(e) => setPPrice(e.target.value)}
                    />
                  </label>
                </div>
                <label className="dpdk-field">
                  <span>Summary</span>
                  <input
                    value={pSummary}
                    placeholder="A one-line description shown on the card."
                    onChange={(e) => setPSummary(e.target.value)}
                  />
                </label>
                <label className="dpdk-field">
                  <span>Details</span>
                  <textarea
                    value={pDetails}
                    placeholder="What is included, who it is for, and how it works."
                    onChange={(e) => setPDetails(e.target.value)}
                  />
                </label>
                <div className="dpdk-row">
                  <label className="dpdk-field">
                    <span>Call to action label</span>
                    <input
                      value={pCtaLabel}
                      placeholder="Request details"
                      onChange={(e) => setPCtaLabel(e.target.value)}
                    />
                  </label>
                  <label className="dpdk-field">
                    <span>Call to action link</span>
                    <input
                      value={pCtaUrl}
                      placeholder="https://..."
                      onChange={(e) => setPCtaUrl(e.target.value)}
                    />
                  </label>
                </div>
                <button className="dpdk-btn" disabled={pBusy} onClick={createProgram}>
                  {pBusy ? 'Saving.' : 'Add program'}
                </button>
              </div>

              {programs.length === 0 ? (
                <div className="dpdk-empty">No programs yet. Publish a sponsorship tier, package, or offering above.</div>
              ) : (
                <ul className="dpdk-list">
                  {programs.map((program) => (
                    <li className="dpdk-item" key={program.id}>
                      <div className="dpdk-itemmain">
                        <span className="dpdk-itemtitle">{program.title}</span>
                        {program.summary && <span className="dpdk-itemsub">{program.summary}</span>}
                        <span className="dpdk-tags">
                          {program.price_terms && <span className="dpdk-tag">{program.price_terms}</span>}
                          <span className={`dpdk-tag ${program.active ? 'is-public' : 'is-private'}`}>
                            {program.active ? 'Active' : 'Hidden'}
                          </span>
                        </span>
                      </div>
                      <div className="dpdk-itemactions">
                        <button className="dpdk-mini" onClick={() => toggleProgram(program)}>
                          {program.active ? 'Hide' : 'Activate'}
                        </button>
                        <button className="dpdk-mini danger" onClick={() => removeProgram(program.id)}>Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

const CSS = `
.dpdk{--e:#123c2e;--e2:#1E5D4A;--gold:#C9A35B;--ivory:#F7F4EE;--ink:#2c2a26;--muted:#7d776c;--line:#e7e1d6;
  min-height:100vh;background:var(--ivory);color:var(--ink);font-family:'Inter',system-ui,sans-serif;}
.dpdk *{box-sizing:border-box;}
.dpdk h1,.dpdk h2{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;margin:0;}
.dpdk-top{display:flex;align-items:center;justify-content:space-between;padding:14px 28px;background:var(--e);color:var(--ivory);}
.dpdk-brand{display:flex;align-items:center;gap:11px;}
.dpdk-logo{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,var(--gold),#b58e44);color:var(--e);display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-weight:700;font-size:19px;}
.dpdk-name{font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;line-height:1;}
.dpdk-by{font-size:10px;letter-spacing:.4px;text-transform:uppercase;color:rgba(247,244,238,.6);}
.dpdk-topactions{display:flex;gap:10px;}
.dpdk-ghost{background:transparent;border:1px solid rgba(201,163,91,.5);color:var(--gold);border-radius:8px;padding:7px 14px;font:inherit;font-size:13px;cursor:pointer;}
.dpdk-ghost:hover{background:rgba(201,163,91,.12);}
.dpdk-main{max-width:920px;margin:0 auto;padding:28px 24px 60px;}
.dpdk-head h1{font-size:30px;color:var(--e);}
.dpdk-head p{font-size:14px;color:var(--muted);line-height:1.6;margin:8px 0 0;max-width:640px;}
.dpdk-error{background:#fff3f1;border:1px solid #e7b7ab;color:#9a3a28;padding:10px 14px;border-radius:10px;font-size:13px;margin:16px 0;}
.dpdk-muted{color:var(--muted);font-size:14px;padding:18px 0;}
.dpdk-section{background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px;margin-top:22px;}
.dpdk-section h2{font-size:23px;color:var(--e);margin-bottom:14px;}
.dpdk-form{display:flex;flex-direction:column;gap:12px;border-bottom:1px solid var(--line);padding-bottom:18px;margin-bottom:18px;}
.dpdk-row{display:flex;gap:12px;flex-wrap:wrap;}
.dpdk-field{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:600;color:var(--ink);flex:1 1 200px;}
.dpdk-field span{color:var(--muted);text-transform:uppercase;letter-spacing:.4px;font-size:10.5px;}
.dpdk-field input,.dpdk-field select,.dpdk-field textarea{font:inherit;font-size:13.5px;font-weight:400;color:var(--ink);padding:9px 11px;border:1px solid var(--line);border-radius:9px;background:#fff;}
.dpdk-field textarea{min-height:88px;resize:vertical;}
.dpdk-btn{align-self:flex-start;background:var(--e);color:#fff;border:0;border-radius:9px;font:inherit;font-size:13px;font-weight:600;padding:9px 20px;cursor:pointer;}
.dpdk-btn:hover{background:var(--e2);}
.dpdk-btn[disabled]{opacity:.6;cursor:default;}
.dpdk-empty{background:rgba(247,244,238,.6);border:1px dashed var(--line);border-radius:11px;padding:18px;font-size:13px;color:var(--muted);}
.dpdk-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;}
.dpdk-item{display:flex;align-items:center;justify-content:space-between;gap:14px;border:1px solid var(--line);border-radius:12px;padding:13px 16px;flex-wrap:wrap;}
.dpdk-itemmain{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1 1 260px;}
.dpdk-itemtitle{font-weight:600;font-size:14.5px;color:var(--e);text-decoration:none;}
a.dpdk-itemtitle:hover{text-decoration:underline;}
.dpdk-itemsub{font-size:12.5px;color:var(--muted);line-height:1.5;}
.dpdk-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px;}
.dpdk-tag{font-size:10.5px;font-weight:600;letter-spacing:.3px;color:var(--muted);background:rgba(125,119,108,.12);border-radius:999px;padding:3px 10px;}
.dpdk-tag.is-public{color:var(--e);background:rgba(30,93,74,.14);}
.dpdk-tag.is-private{color:#9a3a28;background:rgba(154,58,40,.1);}
.dpdk-itemactions{display:flex;gap:8px;flex:0 0 auto;}
.dpdk-mini{background:transparent;border:1px solid var(--line);color:var(--e);border-radius:8px;font:inherit;font-size:12px;font-weight:600;padding:6px 12px;cursor:pointer;}
.dpdk-mini:hover{border-color:var(--e);background:rgba(18,60,46,.04);}
.dpdk-mini.danger{color:#9a3a28;}
.dpdk-mini.danger:hover{border-color:#9a3a28;background:rgba(154,58,40,.05);}
@media(max-width:620px){.dpdk-item{align-items:flex-start;}}
`;
