import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { apiGet, apiSend } from '../../lib/api';

/**
 * Divini Partners - Profile editor (blueprint section 9).
 *
 * Edits the profile sections (hero, about, services, packages, gallery,
 * documents) plus the brand/theme controls (logo, cover, colors, button style,
 * and the 10 templates from blueprint 9.5). Writes to /api/profile. The Divini
 * shell stays Divini-branded; these controls style the partner's profile body.
 */

type Theme = {
  logo_url: string | null;
  cover_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  button_style: string | null;
  template: string | null;
};

type State = {
  draft: { sections: Record<string, any>; completion_status: string; strength: number };
  theme: Theme | null;
  slug: string | null;
};

// Blueprint 9.5 - the ten co-branded profile templates.
const TEMPLATES: { key: string; name: string; blurb: string }[] = [
  { key: 'estate', name: 'The Estate', blurb: 'Grand venue hero with full-bleed cover.' },
  { key: 'atelier', name: 'The Atelier', blurb: 'Editorial, gallery-forward layout.' },
  { key: 'concierge', name: 'The Concierge', blurb: 'Service-led, packages up top.' },
  { key: 'maison', name: 'The Maison', blurb: 'Classic split hero with crest.' },
  { key: 'pavilion', name: 'The Pavilion', blurb: 'Airy, spacious, photo grid.' },
  { key: 'soiree', name: 'The Soiree', blurb: 'Warm, event-energy, bold type.' },
  { key: 'gallery', name: 'The Gallery', blurb: 'Portfolio-first for creatives.' },
  { key: 'roster', name: 'The Roster', blurb: 'Structured services + credentials.' },
  { key: 'havenly', name: 'The Haven', blurb: 'Soft, hospitality, rounded.' },
  { key: 'signature', name: 'The Signature', blurb: 'Minimal luxury, lots of whitespace.' },
];

const BUTTON_STYLES = ['rounded', 'pill', 'square'];

export default function ProfileEditor() {
  const nav = useNavigate();
  const { session } = useAuth();
  const [state, setState] = useState<State | null>(null);
  const [sections, setSections] = useState<Record<string, any>>({});
  const [theme, setTheme] = useState<Theme>({
    logo_url: '', cover_url: '', primary_color: '#123c2e', secondary_color: '#1E5D4A',
    accent_color: '#C9A35B', button_style: 'rounded', template: 'signature',
  });
  const [tab, setTab] = useState<'content' | 'theme' | 'account'>('content');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  // Profile owner email transfer.
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferMsg, setTransferMsg] = useState('');
  const [transferErr, setTransferErr] = useState('');

  async function load() {
    try {
      const s = await apiGet<State>('/profile');
      setState(s);
      setSections(s.draft?.sections ?? {});
      if (s.theme) setTheme((t) => ({ ...t, ...clean(s.theme as Theme) }));
    } catch (e: any) {
      setErr(e?.message ?? 'Could not load your profile.');
    }
  }
  useEffect(() => { if (session) load(); /* eslint-disable-line */ }, [session]);

  function clean(t: Theme): Partial<Theme> {
    const o: any = {};
    Object.entries(t).forEach(([k, v]) => { if (v != null) o[k] = v; });
    return o;
  }
  function setField(sec: string, field: string, value: unknown) {
    setSections((p) => ({ ...p, [sec]: { ...(p[sec] ?? {}), [field]: value } }));
  }

  async function saveContent() {
    setBusy(true); setErr(''); setMsg('');
    try {
      await apiSend('PUT', '/profile/onboarding', { sections });
      await load();
      flash('Content saved');
    } catch (e: any) { setErr(e?.message ?? 'Could not save content.'); }
    finally { setBusy(false); }
  }
  async function saveTheme() {
    setBusy(true); setErr(''); setMsg('');
    try {
      await apiSend('PUT', '/profile/theme', theme);
      await load();
      flash('Theme saved');
    } catch (e: any) { setErr(e?.message ?? 'Could not save theme.'); }
    finally { setBusy(false); }
  }
  function flash(t: string) { setMsg(t); setTimeout(() => setMsg(''), 2000); }

  async function transferOwner() {
    setTransferErr(''); setTransferMsg('');
    const email = newOwnerEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setTransferErr('Enter a valid email address.');
      return;
    }
    const ok = window.confirm(
      `Transfer ownership of this profile to ${email}? ` +
        `They will receive an email to set their password and take over the account. ` +
        `You will lose owner access to this profile.`,
    );
    if (!ok) return;
    setTransferBusy(true);
    try {
      await apiSend('POST', '/profile/transfer-owner', { newEmail: email });
      setTransferMsg(
        `Ownership transfer started. ${email} has been emailed a link to set their password and take over.`,
      );
      setNewOwnerEmail('');
    } catch (e: any) {
      setTransferErr(e?.message ?? 'Could not transfer ownership.');
    } finally {
      setTransferBusy(false);
    }
  }

  const status = state?.draft?.completion_status ?? 'Draft';

  return (
    <div className="dppe">
      <style>{CSS}</style>
      <header className="dppe-top">
        <div className="dppe-brand">
          <span className="dppe-logo">D</span>
          <div><div className="dppe-name">Divini Partners</div><div className="dppe-by">by Divini Group</div></div>
        </div>
        <div className="dppe-topactions">
          <span className="dppe-status">{status}</span>
          {state?.slug && <button className="dppe-ghost" onClick={() => nav(`/preview/${state.slug}`)}>Preview public profile</button>}
          <button className="dppe-ghost" onClick={() => nav('/app')}>Back to dashboard</button>
        </div>
      </header>

      <div className="dppe-wrap">
        <h1 className="dppe-h1">Edit your profile</h1>
        <p className="dppe-sub">Shape your co-branded profile. The Divini shell stays Divini-branded; your theme styles the profile body.</p>
        {err && <div className="dppe-err">{err}</div>}
        {msg && <div className="dppe-ok">{msg}</div>}

        <div className="dppe-tabs">
          <button className={tab === 'content' ? 'on' : ''} onClick={() => setTab('content')}>Content</button>
          <button className={tab === 'theme' ? 'on' : ''} onClick={() => setTab('theme')}>Theme and template</button>
          <button className={tab === 'account' ? 'on' : ''} onClick={() => setTab('account')}>Account</button>
        </div>

        {tab === 'content' && (
          <div className="dppe-panel">
            <Section title="Hero">
              <Row>
                <Field label="Profile name"><input value={sections.basics?.name ?? ''} onChange={(e) => setField('basics', 'name', e.target.value)} /></Field>
                <Field label="Tagline"><input value={sections.basics?.tagline ?? ''} onChange={(e) => setField('basics', 'tagline', e.target.value)} /></Field>
              </Row>
              <Row>
                <Field label="City"><input value={sections.basics?.city ?? ''} onChange={(e) => setField('basics', 'city', e.target.value)} /></Field>
                <Field label="Region"><input value={sections.basics?.region ?? ''} onChange={(e) => setField('basics', 'region', e.target.value)} /></Field>
              </Row>
            </Section>

            <Section title="About">
              <Field label="About"><textarea rows={6} value={sections.about?.body ?? ''} onChange={(e) => setField('about', 'body', e.target.value)} /></Field>
            </Section>

            <Section title="Services">
              <List items={sections.services?.items ?? []} onChange={(i) => setField('services', 'items', i)} fields={[{ k: 'name', l: 'Name' }, { k: 'description', l: 'Description' }]} singular="service" />
            </Section>

            <Section title="Packages">
              <List items={sections.packages?.items ?? []} onChange={(i) => setField('packages', 'items', i)} fields={[{ k: 'name', l: 'Name' }, { k: 'description', l: 'Included' }, { k: 'priceNote', l: 'Pricing note' }]} singular="package" />
            </Section>

            <Section title="Gallery">
              <List items={(sections.gallery?.images ?? []).map((u: any) => (typeof u === 'string' ? { url: u } : u))} onChange={(i) => setField('gallery', 'images', i)} fields={[{ k: 'url', l: 'Image URL' }, { k: 'caption', l: 'Caption' }]} singular="image" />
            </Section>

            <Section title="Documents">
              <p className="dppe-help">Manage uploaded documents from onboarding. Details from documents stay pending until verified.</p>
              <List items={sections.documents?.items ?? []} onChange={(i) => setField('documents', 'items', i)} fields={[{ k: 'label', l: 'Label' }, { k: 'url', l: 'Reference' }]} singular="document" />
            </Section>

            <div className="dppe-actions"><button className="dppe-btn" onClick={saveContent} disabled={busy}>Save content</button></div>
          </div>
        )}

        {tab === 'theme' && (
          <div className="dppe-panel">
            <Section title="Brand assets">
              <Row>
                <Field label="Logo URL"><input value={theme.logo_url ?? ''} onChange={(e) => setTheme((t) => ({ ...t, logo_url: e.target.value }))} placeholder="https://" /></Field>
                <Field label="Cover image URL"><input value={theme.cover_url ?? ''} onChange={(e) => setTheme((t) => ({ ...t, cover_url: e.target.value }))} placeholder="https://" /></Field>
              </Row>
            </Section>

            <Section title="Colors">
              <div className="dppe-colors">
                <ColorField label="Primary" value={theme.primary_color} onChange={(v) => setTheme((t) => ({ ...t, primary_color: v }))} />
                <ColorField label="Secondary" value={theme.secondary_color} onChange={(v) => setTheme((t) => ({ ...t, secondary_color: v }))} />
                <ColorField label="Accent" value={theme.accent_color} onChange={(v) => setTheme((t) => ({ ...t, accent_color: v }))} />
              </div>
            </Section>

            <Section title="Button style">
              <div className="dppe-btnstyles">
                {BUTTON_STYLES.map((bs) => (
                  <button key={bs} className={`dppe-bs ${theme.button_style === bs ? 'on' : ''}`} onClick={() => setTheme((t) => ({ ...t, button_style: bs }))}>
                    <span className={`dppe-bsdemo ${bs}`}>Button</span>
                    <span className="dppe-bsname">{bs}</span>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Template">
              <div className="dppe-templates">
                {TEMPLATES.map((tp) => (
                  <button key={tp.key} className={`dppe-tpl ${theme.template === tp.key ? 'on' : ''}`} onClick={() => setTheme((t) => ({ ...t, template: tp.key }))}>
                    <span className="dppe-tplname">{tp.name}</span>
                    <span className="dppe-tplblurb">{tp.blurb}</span>
                  </button>
                ))}
              </div>
            </Section>

            <div className="dppe-actions"><button className="dppe-btn" onClick={saveTheme} disabled={busy}>Save theme</button></div>
          </div>
        )}

        {tab === 'account' && (
          <div className="dppe-panel">
            <Section title="Profile owner email">
              <p className="dppe-help">
                Signed in as <strong>{session?.user?.email ?? 'your account'}</strong>. Transfer
                ownership of this profile to another email. The new owner receives an email to set
                their password and take over the account. This is irreversible from here once they
                take over, so make sure the address is correct.
              </p>
              <Field label="New owner email">
                <input
                  type="email"
                  value={newOwnerEmail}
                  onChange={(e) => setNewOwnerEmail(e.target.value)}
                  placeholder="new-owner@business.com"
                />
              </Field>
              {transferErr && <div className="dppe-err" style={{ marginTop: 10 }}>{transferErr}</div>}
              {transferMsg && <div className="dppe-ok" style={{ marginTop: 10 }}>{transferMsg}</div>}
              <div className="dppe-actions">
                <button className="dppe-btn" onClick={transferOwner} disabled={transferBusy}>
                  {transferBusy ? 'Transferring...' : 'Transfer ownership'}
                </button>
              </div>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="dppe-section"><div className="dppe-sectitle">{title}</div>{children}</div>;
}
function Row({ children }: { children: React.ReactNode }) { return <div className="dppe-row">{children}</div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="dppe-field"><span className="dppe-lbl">{label}</span>{children}</label>;
}
function ColorField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string) => void }) {
  return (
    <label className="dppe-color">
      <span className="dppe-lbl">{label}</span>
      <span className="dppe-colorrow">
        <input type="color" value={value || '#123c2e'} onChange={(e) => onChange(e.target.value)} />
        <input className="dppe-hex" value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="#123c2e" />
      </span>
    </label>
  );
}
function List({
  items, onChange, fields, singular,
}: { items: any[]; onChange: (i: any[]) => void; fields: { k: string; l: string }[]; singular: string }) {
  function upd(i: number, k: string, v: string) { const n = items.slice(); n[i] = { ...(n[i] ?? {}), [k]: v }; onChange(n); }
  return (
    <div className="dppe-list">
      {items.length === 0 && <p className="dppe-help">No {singular}s yet.</p>}
      {items.map((it, i) => (
        <div className="dppe-listcard" key={i}>
          {fields.map((f) => (
            <label className="dppe-field" key={f.k}><span className="dppe-lbl">{f.l}</span><input value={it?.[f.k] ?? ''} onChange={(e) => upd(i, f.k, e.target.value)} /></label>
          ))}
          <button className="dppe-mini reject" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>Remove</button>
        </div>
      ))}
      <button className="dppe-btn ghost" onClick={() => onChange([...items, {}])}>Add {singular}</button>
    </div>
  );
}

const CSS = `
.dppe{--e:#123c2e;--e2:#1E5D4A;--gold:#C9A35B;--ivory:#F7F4EE;--ink:#2c2a26;--muted:#7d776c;--line:#e7e1d6;
  min-height:100vh;background:var(--ivory);color:var(--ink);font-family:Inter,system-ui,sans-serif;}
.dppe *{box-sizing:border-box;}
.dppe-top{display:flex;align-items:center;justify-content:space-between;padding:16px 28px;background:#fff;border-bottom:1px solid var(--line);}
.dppe-brand{display:flex;align-items:center;gap:11px;}
.dppe-logo{width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,var(--gold),#b58e44);color:var(--e);display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-weight:700;font-size:20px;}
.dppe-name{font-family:'Cormorant Garamond',serif;font-size:18px;color:var(--e);font-weight:600;}
.dppe-by{font-size:10px;letter-spacing:.4px;text-transform:uppercase;color:var(--muted);}
.dppe-topactions{display:flex;align-items:center;gap:10px;}
.dppe-status{font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;padding:4px 10px;border-radius:999px;background:rgba(201,163,91,.18);color:var(--e);border:1px solid rgba(201,163,91,.45);}
.dppe-wrap{max-width:960px;margin:0 auto;padding:26px 28px 64px;}
.dppe-h1{font-family:'Cormorant Garamond',serif;font-size:32px;color:var(--e);margin:0 0 4px;}
.dppe-sub{color:var(--muted);font-size:14px;margin:0 0 20px;}
.dppe-tabs{display:flex;gap:8px;border-bottom:1px solid var(--line);margin-bottom:22px;}
.dppe-tabs button{background:transparent;border:0;border-bottom:2px solid transparent;font:inherit;font-size:14px;font-weight:600;color:var(--muted);padding:10px 6px;cursor:pointer;}
.dppe-tabs button.on{color:var(--e);border-bottom-color:var(--gold);}
.dppe-panel{display:flex;flex-direction:column;gap:22px;}
.dppe-section{background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px;}
.dppe-sectitle{font-family:'Cormorant Garamond',serif;font-size:20px;color:var(--e);margin-bottom:14px;}
.dppe-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:12px;}
.dppe-field{display:flex;flex-direction:column;gap:6px;margin-bottom:10px;}
.dppe-lbl{font-size:11.5px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--muted);}
.dppe input,.dppe textarea{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:10px;font:inherit;font-size:14px;background:#fff;color:var(--ink);}
.dppe input:focus,.dppe textarea:focus{outline:none;border-color:var(--e2);}
.dppe-help{font-size:13px;color:var(--muted);}
.dppe-list{display:flex;flex-direction:column;gap:12px;}
.dppe-listcard{display:flex;flex-direction:column;gap:8px;border:1px solid var(--line);border-radius:11px;padding:14px;background:var(--ivory);}
.dppe-colors{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;}
.dppe-color{display:flex;flex-direction:column;gap:6px;}
.dppe-colorrow{display:flex;gap:8px;align-items:center;}
.dppe-colorrow input[type=color]{width:46px;height:42px;padding:2px;border-radius:10px;border:1px solid var(--line);cursor:pointer;}
.dppe-hex{flex:1;}
.dppe-btnstyles{display:flex;gap:12px;flex-wrap:wrap;}
.dppe-bs{display:flex;flex-direction:column;align-items:center;gap:8px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 18px;cursor:pointer;font:inherit;}
.dppe-bs.on{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold) inset;}
.dppe-bsdemo{background:var(--e);color:#fff;font-size:12px;font-weight:600;padding:8px 16px;}
.dppe-bsdemo.rounded{border-radius:9px;}
.dppe-bsdemo.pill{border-radius:999px;}
.dppe-bsdemo.square{border-radius:0;}
.dppe-bsname{font-size:11.5px;color:var(--muted);text-transform:capitalize;}
.dppe-templates{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;}
.dppe-tpl{display:flex;flex-direction:column;gap:4px;text-align:left;background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px;cursor:pointer;font:inherit;transition:.15s;}
.dppe-tpl:hover{border-color:var(--e2);}
.dppe-tpl.on{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold) inset;background:#fbf7ee;}
.dppe-tplname{font-family:'Cormorant Garamond',serif;font-size:17px;color:var(--e);}
.dppe-tplblurb{font-size:12px;color:var(--muted);line-height:1.4;}
.dppe-actions{display:flex;justify-content:flex-end;}
.dppe-btn{background:var(--e);color:#fff;border:0;border-radius:10px;font:inherit;font-size:13.5px;font-weight:600;padding:11px 20px;cursor:pointer;}
.dppe-btn:hover{background:var(--e2);}
.dppe-btn.ghost{background:transparent;color:var(--e);border:1px solid var(--line);align-self:flex-start;}
.dppe-btn:disabled{opacity:.5;cursor:default;}
.dppe-ghost{background:transparent;border:1px solid var(--line);border-radius:10px;color:var(--e);font:inherit;font-size:13px;font-weight:600;padding:9px 15px;cursor:pointer;}
.dppe-ghost:hover{border-color:var(--e2);}
.dppe-mini{background:var(--e);color:#fff;border:0;border-radius:8px;font:inherit;font-size:12px;font-weight:600;padding:6px 12px;cursor:pointer;align-self:flex-start;}
.dppe-mini.reject{background:transparent;color:#a3382f;border:1px solid #f0cfca;}
.dppe-err{background:#fbe9e7;color:#a3382f;border-radius:10px;padding:10px 13px;font-size:13px;margin-bottom:14px;}
.dppe-ok{background:rgba(31,122,77,.12);color:#1f7a4d;border-radius:10px;padding:10px 13px;font-size:13px;margin-bottom:14px;}
@media(max-width:680px){.dppe-row,.dppe-colors{grid-template-columns:1fr;}}
`;
