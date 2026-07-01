/**
 * Vendor network + invite center (/network).
 *
 * A venue or partner uses this to:
 *   1. Build their vendor network from partners already on Divini Partners,
 *      reusing the starred / preferred-vendor API.
 *   2. Invite vendors AND clients to create their profile for FREE, by email or
 *      a shareable link. Invites are attributed to the inviter (referral) and
 *      accepting one leads to free registration.
 *
 * Self-contained, brand-consistent styling (emerald / champagne gold / ivory,
 * Cormorant Garamond + Inter). Zero em dashes.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiSend } from '../../lib/api';

type Starred = {
  id: string;
  vendor_org_id: string;
  vendor_name?: string | null;
  label?: string | null;
};

type SearchResult = {
  organization_id: string | null;
  name: string | null;
  kind: string | null;
  category: string | null;
  city: string | null;
  region: string | null;
};

type Invite = {
  id: string;
  invitee_email: string;
  invitee_name?: string | null;
  role: string;
  status: string;
  token: string;
  link: string;
  created_at: string;
};

type InviteRole = 'vendor' | 'client';

export default function VendorNetwork() {
  const nav = useNavigate();

  // Network (starred / preferred vendors already on the platform)
  const [starred, setStarred] = useState<Starred[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [netBusy, setNetBusy] = useState(false);

  // Invites
  const [invites, setInvites] = useState<Invite[]>([]);
  const [iName, setIName] = useState('');
  const [iEmail, setIEmail] = useState('');
  const [iRole, setIRole] = useState<InviteRole>('vendor');
  const [iMsg, setIMsg] = useState('');
  const [iBusy, setIBusy] = useState(false);
  const [lastLink, setLastLink] = useState('');
  const [copied, setCopied] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  async function loadStarred() {
    try {
      const r = await apiGet<{ starred: Starred[] }>('/starred');
      setStarred(r.starred ?? []);
    } catch {
      /* ignore */
    }
  }

  async function loadInvites() {
    try {
      const r = await apiGet<{ invites: Invite[] }>('/invites');
      setInvites(r.invites ?? []);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void loadStarred();
    void loadInvites();
  }, []);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const r = await apiGet<{ results: SearchResult[] }>(
        `/marketplace/search?q=${encodeURIComponent(query.trim())}&limit=12`,
      );
      setResults(r.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  const starredIds = new Set(starred.map((s) => s.vendor_org_id));

  async function addToNetwork(orgId: string, label?: string | null) {
    setNetBusy(true);
    setErr('');
    try {
      await apiSend('POST', '/starred', { vendor_org_id: orgId, label: label ?? null });
      await loadStarred();
      setNote('Added to your vendor network.');
    } catch (e: any) {
      setErr(e?.message ?? 'Could not add to your network.');
    } finally {
      setNetBusy(false);
    }
  }

  async function removeFromNetwork(orgId: string) {
    setNetBusy(true);
    setErr('');
    try {
      await apiSend('DELETE', `/starred/${orgId}`);
      await loadStarred();
    } catch (e: any) {
      setErr(e?.message ?? 'Could not update your network.');
    } finally {
      setNetBusy(false);
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setNote('');
    if (!iEmail.trim() || !iEmail.includes('@')) {
      setErr('Enter a valid email to send an invite.');
      return;
    }
    setIBusy(true);
    try {
      const r = await apiSend<{ invite: Invite; link: string }>('POST', '/invites', {
        email: iEmail.trim(),
        name: iName.trim() || undefined,
        role: iRole,
        message: iMsg.trim() || undefined,
      });
      setLastLink(r.link);
      setIName('');
      setIEmail('');
      setIMsg('');
      setNote('Invite sent. Share the link below so they can create their free profile.');
      await loadInvites();
    } catch (e: any) {
      setErr(e?.message ?? 'Could not send the invite.');
    } finally {
      setIBusy(false);
    }
  }

  async function revoke(id: string) {
    try {
      await apiSend('POST', `/invites/${id}/revoke`);
      await loadInvites();
    } catch {
      /* ignore */
    }
  }

  async function copy(text: string, tag: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      /* clipboard may be unavailable */
    }
  }

  return (
    <div className="vn">
      <style>{CSS}</style>

      <header className="vn-top">
        <button type="button" className="vn-back" onClick={() => nav('/app')}>
          Back to dashboard
        </button>
        <div>
          <div className="vn-kicker">Your vendor network</div>
          <h1>Build your network and invite vendors and clients</h1>
          <p className="vn-lede">
            Add the partners you already work with, and invite vendors and clients to create their
            Divini Partners profile for free. Every invite is credited to you.
          </p>
        </div>
      </header>

      {err && <div className="vn-alert vn-err">{err}</div>}
      {note && <div className="vn-alert vn-ok">{note}</div>}

      <div className="vn-cols">
        {/* ------------------------------ Network ------------------------------ */}
        <section className="vn-card">
          <h2>Your vendor network</h2>
          <p className="vn-sub">
            Vendors you have added from Divini Partners. Clients can book your trusted partners
            faster.
          </p>

          {starred.length === 0 ? (
            <div className="vn-empty">
              No vendors added yet. Search below to add partners you already work with on the
              platform.
            </div>
          ) : (
            <ul className="vn-list">
              {starred.map((s) => (
                <li key={s.id} className="vn-row">
                  <div className="vn-avatar" aria-hidden="true">
                    {(s.vendor_name ?? 'V').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="vn-rowmain">
                    <div className="vn-rowname">{s.vendor_name ?? 'Partner'}</div>
                    {s.label ? <div className="vn-rowmeta">{s.label}</div> : null}
                  </div>
                  <button
                    type="button"
                    className="vn-btn ghost sm"
                    disabled={netBusy}
                    onClick={() => removeFromNetwork(s.vendor_org_id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="vn-divider" />

          <h3>Add a vendor already on Divini Partners</h3>
          <form className="vn-searchrow" onSubmit={runSearch}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search vendors by name or category"
            />
            <button type="submit" className="vn-btn" disabled={searching}>
              {searching ? 'Searching' : 'Search'}
            </button>
          </form>

          {results.length > 0 && (
            <ul className="vn-list vn-results">
              {results.map((r) => {
                const id = r.organization_id ?? '';
                const already = starredIds.has(id);
                return (
                  <li key={id || r.name || Math.random()} className="vn-row">
                    <div className="vn-avatar" aria-hidden="true">
                      {(r.name ?? 'V').slice(0, 1).toUpperCase()}
                    </div>
                    <div className="vn-rowmain">
                      <div className="vn-rowname">{r.name ?? 'Partner'}</div>
                      <div className="vn-rowmeta">
                        {[r.kind, r.category, r.city ?? r.region].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {already ? (
                      <span className="vn-tag">In network</span>
                    ) : (
                      <button
                        type="button"
                        className="vn-btn sm"
                        disabled={netBusy || !id}
                        onClick={() => addToNetwork(id, r.category)}
                      >
                        Add
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ------------------------------ Invites ------------------------------ */}
        <section className="vn-card">
          <h2>Invite vendors and clients</h2>
          <p className="vn-sub">
            Invite a vendor or client to create their profile free. Send by email or share a link.
            We credit the referral to you.
          </p>

          <form className="vn-form" onSubmit={sendInvite}>
            <div className="vn-roletoggle">
              <button
                type="button"
                className={'vn-roleopt' + (iRole === 'vendor' ? ' on' : '')}
                onClick={() => setIRole('vendor')}
              >
                Vendor
              </button>
              <button
                type="button"
                className={'vn-roleopt' + (iRole === 'client' ? ' on' : '')}
                onClick={() => setIRole('client')}
              >
                Client
              </button>
            </div>

            <label className="vn-lbl">Name (optional)</label>
            <input value={iName} onChange={(e) => setIName(e.target.value)} placeholder="Their name or business" />

            <label className="vn-lbl">Email</label>
            <input
              type="email"
              value={iEmail}
              onChange={(e) => setIEmail(e.target.value)}
              placeholder="name@example.com"
            />

            <label className="vn-lbl">Personal note (optional)</label>
            <textarea
              value={iMsg}
              onChange={(e) => setIMsg(e.target.value)}
              placeholder="Add a short note about why you are inviting them."
              rows={3}
            />

            <button type="submit" className="vn-btn full" disabled={iBusy}>
              {iBusy ? 'Sending' : `Invite ${iRole} to join free`}
            </button>
          </form>

          {lastLink && (
            <div className="vn-share">
              <div className="vn-sharelbl">Shareable invite link</div>
              <div className="vn-sharerow">
                <input readOnly value={lastLink} onFocus={(e) => e.currentTarget.select()} />
                <button type="button" className="vn-btn sm" onClick={() => copy(lastLink, 'last')}>
                  {copied === 'last' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="vn-sharehint">Anyone with this link can create their free profile.</p>
            </div>
          )}

          <div className="vn-divider" />

          <h3>Sent invites</h3>
          {invites.length === 0 ? (
            <div className="vn-empty">No invites sent yet.</div>
          ) : (
            <ul className="vn-list">
              {invites.map((iv) => (
                <li key={iv.id} className="vn-row">
                  <div className="vn-rowmain">
                    <div className="vn-rowname">{iv.invitee_name || iv.invitee_email}</div>
                    <div className="vn-rowmeta">
                      {iv.invitee_name ? iv.invitee_email + ' · ' : ''}
                      {iv.role}
                    </div>
                  </div>
                  <span className={'vn-status s-' + iv.status}>{iv.status}</span>
                  <button type="button" className="vn-btn ghost sm" onClick={() => copy(iv.link, iv.id)}>
                    {copied === iv.id ? 'Copied' : 'Link'}
                  </button>
                  {iv.status !== 'accepted' && iv.status !== 'revoked' ? (
                    <button type="button" className="vn-btn ghost sm" onClick={() => revoke(iv.id)}>
                      Revoke
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

const CSS = `
.vn{--em:#123c2e;--em2:#1E5D4A;--gold:#C9A35B;--ivory:#F7F4EE;--ink:#2c2a26;--muted:#7d776c;--line:#e7e1d6;
  min-height:100vh;background:#f3efe6;color:var(--ink);font-family:Inter,system-ui,sans-serif;padding:32px 24px 56px}
.vn *,.vn *::before,.vn *::after{box-sizing:border-box}
.vn h1,.vn h2,.vn h3{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;margin:0;color:var(--em)}
.vn-top{max-width:1120px;margin:0 auto 22px}
.vn-back{background:transparent;border:1px solid var(--line);border-radius:999px;color:var(--em);font:inherit;font-size:12.5px;
  padding:6px 14px;cursor:pointer;margin-bottom:16px}
.vn-back:hover{border-color:var(--em);background:rgba(18,60,46,.04)}
.vn-kicker{font-size:10.5px;letter-spacing:1.4px;text-transform:uppercase;color:var(--gold);font-weight:700}
.vn-top h1{font-size:30px;margin:4px 0 6px;line-height:1.08}
.vn-lede{font-size:13.5px;color:var(--muted);max-width:640px;line-height:1.55;margin:0}
.vn-alert{max-width:1120px;margin:0 auto 14px;border-radius:11px;padding:11px 14px;font-size:13px}
.vn-err{background:#fbe9e7;color:#a3382f;border:1px solid #f0c8c2}
.vn-ok{background:#eaf5ee;color:#1f7a4d;border:1px solid #c4e3cf}
.vn-cols{max-width:1120px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}
@media(max-width:880px){.vn-cols{grid-template-columns:1fr}}
.vn-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px 22px 24px;
  box-shadow:0 30px 60px -48px rgba(18,60,46,.4)}
.vn-card h2{font-size:23px}
.vn-card h3{font-size:17px;margin-bottom:8px}
.vn-sub{font-size:12.5px;color:var(--muted);line-height:1.5;margin:6px 0 16px}
.vn-empty{font-size:12.5px;color:var(--muted);border:1px dashed var(--line);background:rgba(247,244,238,.55);
  border-radius:11px;padding:16px;line-height:1.5}
.vn-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.vn-results{margin-top:12px}
.vn-row{display:flex;align-items:center;gap:11px;border:1px solid var(--line);border-radius:11px;padding:10px 12px}
.vn-avatar{width:34px;height:34px;flex:0 0 34px;border-radius:9px;background:var(--em);color:var(--gold);
  display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px}
.vn-rowmain{flex:1 1 auto;min-width:0}
.vn-rowname{font-size:13.5px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vn-rowmeta{font-size:11.5px;color:var(--muted);text-transform:capitalize;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vn-tag{font-size:11px;color:var(--em);background:rgba(201,163,91,.2);border:1px solid rgba(201,163,91,.5);
  border-radius:999px;padding:3px 10px;font-weight:600}
.vn-divider{height:1px;background:var(--line);margin:18px 0}
.vn-searchrow{display:flex;gap:8px;margin-bottom:4px}
.vn input,.vn textarea{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:10px;font-size:14px;
  font-family:Inter;color:var(--ink);background:#fff}
.vn input:focus,.vn textarea:focus{outline:none;border-color:var(--em2)}
.vn textarea{resize:vertical}
.vn-btn{background:var(--em);color:#fff;border:0;border-radius:10px;font:inherit;font-size:13px;font-weight:600;
  padding:11px 18px;cursor:pointer;transition:background .15s ease;white-space:nowrap}
.vn-btn:hover{background:var(--em2)}
.vn-btn:disabled{opacity:.5;cursor:default}
.vn-btn.sm{padding:7px 13px;font-size:12px;border-radius:9px}
.vn-btn.full{width:100%;margin-top:6px}
.vn-btn.ghost{background:transparent;color:var(--em);border:1px solid var(--line)}
.vn-btn.ghost:hover{border-color:var(--em);background:rgba(18,60,46,.04)}
.vn-form{display:flex;flex-direction:column;gap:4px}
.vn-lbl{font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);margin:10px 0 2px}
.vn-roletoggle{display:flex;gap:8px;margin-bottom:4px}
.vn-roleopt{flex:1 1 0;background:#fff;border:1px solid var(--line);border-radius:10px;font:inherit;font-size:13px;
  font-weight:600;color:var(--muted);padding:10px;cursor:pointer}
.vn-roleopt.on{border-color:var(--gold);background:#fbf7ee;color:var(--em);box-shadow:0 0 0 1px var(--gold) inset}
.vn-share{margin-top:16px;border:1px solid rgba(201,163,91,.5);background:#fbf7ee;border-radius:12px;padding:14px}
.vn-sharelbl{font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--em);margin-bottom:8px}
.vn-sharerow{display:flex;gap:8px}
.vn-sharehint{font-size:11.5px;color:var(--muted);margin:8px 0 0}
.vn-status{font-size:11px;border-radius:999px;padding:3px 10px;font-weight:600;text-transform:capitalize}
.vn-status.s-sent{background:#eef0f4;color:#5a6472}
.vn-status.s-opened{background:#fbf7ee;color:#9a7c34;border:1px solid rgba(201,163,91,.5)}
.vn-status.s-accepted{background:#eaf5ee;color:#1f7a4d}
.vn-status.s-revoked{background:#f4eeee;color:#9a6a64}
`;
