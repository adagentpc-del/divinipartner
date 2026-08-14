/**
 * Developer settings: API keys + outbound webhooks (moat roadmap Phase 2a).
 * Route: /account/developer.
 *
 * An API key authenticates as the creating user via
 * `Authorization: Bearer dvp_live_...` -- it can do anything that user's
 * session can do, scoped to their organization. The plaintext key is shown
 * exactly once, at creation.
 *
 * Zero em dashes.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { apiGet, apiSend } from '../lib/api';

type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

type WebhookEndpoint = {
  id: string;
  url: string;
  secret: string;
  enabled: boolean;
  event_types: string[];
  created_at: string;
};

const STYLES = `
.dvs{--emerald:#1E5D4A;--emerald-deep:#123c2e;--champagne:#D9CCB0;--ink:#2c2a26;--muted:#6b6459;--line:#e7e1d6;--ivory:#f7f4ee;font-family:Inter,system-ui,sans-serif;color:var(--ink);max-width:840px}
.dvs h1{font-family:'Cormorant Garamond',serif;color:var(--emerald-deep);font-size:30px;margin:0}
.dvs h2{font-size:16px;color:var(--emerald-deep);margin:0 0 4px}
.dvs .sub{font-size:13px;color:var(--muted);margin-top:3px}
.dvs .card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:16px}
.dvs .note{font-size:12.5px;color:var(--muted);line-height:1.5;margin:6px 0 12px}
.dvs .table-wrap{overflow-x:auto}
.dvs table{width:100%;min-width:560px;border-collapse:collapse;font-size:13px}
.dvs th{text-align:left;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.3px;padding:6px 8px;border-bottom:1px solid var(--line)}
.dvs td{padding:8px;border-bottom:1px solid var(--line);vertical-align:top}
.dvs code{background:var(--ivory);border:1px solid var(--line);border-radius:6px;padding:2px 6px;font-size:12px}
.dvs .btn{border:1px solid var(--line);background:#fff;color:var(--emerald-deep);font-family:Inter;font-size:13px;font-weight:600;padding:8px 12px;border-radius:9px;cursor:pointer}
.dvs .btn:hover{border-color:var(--emerald);background:var(--ivory)}
.dvs .btn.primary{background:var(--emerald);border-color:var(--emerald);color:#fff}
.dvs .btn.danger{color:#7a3030;border-color:#ecd2d2}
.dvs .btn:disabled{opacity:.5;cursor:not-allowed}
.dvs input[type=text],.dvs input[type=url]{border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:13px;font-family:Inter;width:100%;box-sizing:border-box}
.dvs .row{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:10px}
.dvs .col{flex:1;min-width:180px}
.dvs .msg{padding:10px 13px;border-radius:9px;font-size:13px;margin-bottom:14px}
.dvs .msg.err{background:#fbeeee;border:1px solid #ecd2d2;color:#7a3030}
.dvs .msg.ok{background:#eef6f1;border:1px solid #cfe6da;color:var(--emerald-deep);word-break:break-all}
.dvs .badge{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:var(--ivory);border:1px solid var(--line);color:var(--emerald-deep)}
.dvs .badge.off{color:var(--muted)}
.dvs label.chk{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;margin-right:12px}
`;

export default function DeveloperSettings() {
  const { session } = useAuth();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState('');
  const [newTypes, setNewTypes] = useState<Set<string>>(new Set());
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [k, w, m] = await Promise.all([
        apiGet<{ keys: ApiKeyRow[] }>('/api-keys'),
        apiGet<{ endpoints: WebhookEndpoint[] }>('/webhooks'),
        apiGet<{ eventTypes: string[] }>('/webhooks/meta'),
      ]);
      setKeys(k.keys);
      setEndpoints(w.endpoints);
      setEventTypes(m.eventTypes);
    } catch (e: any) {
      setErr(e.message ?? 'Could not load developer settings.');
    }
  }

  useEffect(() => {
    if (session) load();

  }, [session]);

  if (!session) return <div className="dvs"><div className="card">Sign in to manage API keys and webhooks.</div></div>;

  async function createKey() {
    if (!newKeyName.trim()) return;
    setBusy(true);
    setErr('');
    try {
      const res = await apiSend<{ key: string; apiKey: ApiKeyRow }>('POST', '/api-keys', { name: newKeyName.trim() });
      setNewKeyValue(res.key);
      setNewKeyName('');
      await load();
    } catch (e: any) {
      setErr(e.message ?? 'Could not create API key.');
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(id: string) {
    setBusy(true);
    setErr('');
    try {
      await apiSend('DELETE', `/api-keys/${id}`);
      await load();
    } catch (e: any) {
      setErr(e.message ?? 'Could not revoke key.');
    } finally {
      setBusy(false);
    }
  }

  async function createEndpoint() {
    if (!newUrl.trim()) return;
    setBusy(true);
    setErr('');
    try {
      await apiSend('POST', '/webhooks', { url: newUrl.trim(), event_types: [...newTypes] });
      setNewUrl('');
      setNewTypes(new Set());
      await load();
    } catch (e: any) {
      setErr(e.message ?? 'Could not create webhook endpoint.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleEndpoint(ep: WebhookEndpoint) {
    setBusy(true);
    setErr('');
    try {
      await apiSend('PATCH', `/webhooks/${ep.id}`, { enabled: !ep.enabled });
      await load();
    } catch (e: any) {
      setErr(e.message ?? 'Could not update webhook endpoint.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteEndpoint(id: string) {
    setBusy(true);
    setErr('');
    try {
      await apiSend('DELETE', `/webhooks/${id}`);
      await load();
    } catch (e: any) {
      setErr(e.message ?? 'Could not delete webhook endpoint.');
    } finally {
      setBusy(false);
    }
  }

  function toggleType(t: string) {
    setNewTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  return (
    <div className="dvs">
      <style>{STYLES}</style>
      <h1>Developer</h1>
      <p className="sub">API keys and outbound webhooks for programmatic access to your organization's data.</p>

      {err && <div className="msg err">{err}</div>}

      <div className="card">
        <h2>API keys</h2>
        <p className="note">
          An API key authenticates as you (Authorization: Bearer &lt;key&gt;) -- it can do anything
          your own account can do, scoped to your organization. The full key is shown once, right
          after you create it, and never again.
        </p>
        {newKeyValue && (
          <div className="msg ok">
            Copy this key now -- it will not be shown again: <code>{newKeyValue}</code>
            <div style={{ marginTop: 8 }}>
              <button className="btn" onClick={() => setNewKeyValue(null)}>Done</button>
            </div>
          </div>
        )}
        <div className="row">
          <div className="col">
            <input
              type="text"
              placeholder="Key name (e.g. Zapier integration)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
            />
          </div>
          <button className="btn primary" onClick={createKey} disabled={busy || !newKeyName.trim()}>
            Create key
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Prefix</th><th>Created</th><th>Last used</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td><code>{k.key_prefix}...</code></td>
                  <td>{new Date(k.created_at).toLocaleDateString()}</td>
                  <td>{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'Never'}</td>
                  <td>
                    {k.revoked_at ? <span className="badge off">Revoked</span> : <span className="badge">Active</span>}
                  </td>
                  <td>
                    {!k.revoked_at && (
                      <button className="btn danger" onClick={() => revokeKey(k.id)} disabled={busy}>Revoke</button>
                    )}
                  </td>
                </tr>
              ))}
              {keys.length === 0 && (
                <tr><td colSpan={6} style={{ color: 'var(--muted)' }}>No API keys yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Webhooks</h2>
        <p className="note">
          Register a URL to receive a signed HTTP POST when an event happens. Each delivery carries
          an X-Divini-Signature header (HMAC-SHA256 over the raw body, using the endpoint's own
          secret below) so you can verify it really came from Divini Partners. Leave event types
          unchecked to receive every type.
        </p>
        <div className="row">
          <div className="col">
            <input
              type="url"
              placeholder="https://example.com/webhooks/divini"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
            />
          </div>
        </div>
        <div className="row">
          {eventTypes.map((t) => (
            <label className="chk" key={t}>
              <input type="checkbox" checked={newTypes.has(t)} onChange={() => toggleType(t)} />
              <code>{t}</code>
            </label>
          ))}
        </div>
        <div className="row">
          <button className="btn primary" onClick={createEndpoint} disabled={busy || !newUrl.trim()}>
            Add webhook endpoint
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>URL</th><th>Events</th><th>Secret</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {endpoints.map((ep) => (
                <tr key={ep.id}>
                  <td>{ep.url}</td>
                  <td>{ep.event_types.length ? ep.event_types.join(', ') : 'All'}</td>
                  <td><code>{ep.secret}</code></td>
                  <td>{ep.enabled ? <span className="badge">Enabled</span> : <span className="badge off">Disabled</span>}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn" onClick={() => toggleEndpoint(ep)} disabled={busy}>
                      {ep.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button className="btn danger" onClick={() => deleteEndpoint(ep.id)} disabled={busy}>Delete</button>
                  </td>
                </tr>
              ))}
              {endpoints.length === 0 && (
                <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>No webhook endpoints yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
