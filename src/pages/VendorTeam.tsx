import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

// Phase 1 (Workstream A) - Vendor Team management. A vendor org's admin manages
// its internal team: list members, add a member with a name/email and a vendor
// sub-role (from VENDOR_TEAM_ROLES), change a role or status, and remove a
// member. Backed by /api/vendor-team. Mutations are gated server-side on the
// acting user holding manage_team; the page also hides controls when /me says
// the user cannot manage the team.
//
// Self-contained: no route is registered here (the integration lead wires it).
// Default export, no required props.

type Member = {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  email: string | null;
  name: string | null;
  vendor_role: string | null;
  status: string | null;
  created_at: string;
};

type MeResp = { role: string | null; can: Record<string, boolean> };

export default function VendorTeam() {
  const [roles, setRoles] = useState<string[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [myRole, setMyRole] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('account_exec');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [rolesRes, meRes, listRes] = await Promise.all([
        apiGet<{ roles: string[] }>('/vendor-team/roles'),
        apiGet<MeResp>('/vendor-team/me'),
        apiGet<{ members: Member[] }>('/vendor-team'),
      ]);
      setRoles(rolesRes.roles || []);
      if (rolesRes.roles?.length && !rolesRes.roles.includes(role)) setRole(rolesRes.roles[0]);
      setCanManage(!!meRes.can?.manage_team);
      setMyRole(meRes.role ?? null);
      setMembers(listRes.members || []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function addMember() {
    if (!name.trim() && !email.trim()) {
      setError('Enter a name or email.');
      return;
    }
    setSaving(true);
    setOk(null);
    try {
      await apiSend('POST', '/vendor-team', {
        name: name.trim() || null,
        email: email.trim() || null,
        vendor_role: role,
      });
      setName('');
      setEmail('');
      setOk('Member added.');
      setError(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(m: Member, next: string) {
    setSaving(true);
    try {
      await apiSend('PATCH', `/vendor-team/${m.id}`, { vendor_role: next });
      setError(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(m: Member) {
    setSaving(true);
    try {
      await apiSend('DELETE', `/vendor-team/${m.id}`);
      setError(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="vt">
      <style>{CSS}</style>

      <header className="vt-head">
        <span className="vt-kicker">Vendor Workspace</span>
        <h1 className="vt-title">Team</h1>
        <p className="vt-sub">
          Build your internal team and set each person's role. Roles decide who can assign accounts,
          review intake, and approve quotes.
          {myRole ? <span className="vt-myrole"> Your role: {myRole}</span> : null}
        </p>
      </header>

      {error && <div className="vt-error">{error}</div>}
      {ok && <div className="vt-ok">{ok}</div>}

      {canManage && (
        <section className="vt-section">
          <h2>Add a team member</h2>
          <div className="vt-addrow">
            <label>Name
              <input value={name} placeholder="Full name" onChange={(e) => setName(e.target.value)} />
            </label>
            <label>Email
              <input value={email} placeholder="name@company.com" onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>Role
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <button type="button" className="vt-btn" onClick={addMember} disabled={saving}>
              {saving ? 'Saving.' : 'Add member'}
            </button>
          </div>
        </section>
      )}

      <section className="vt-section">
        <h2>Team members</h2>
        {loading ? (
          <p className="vt-muted">Loading.</p>
        ) : members.length === 0 ? (
          <p className="vt-muted">No team members yet.{canManage ? ' Add your first member above.' : ''}</p>
        ) : (
          <div className="vt-list">
            {members.map((m) => (
              <div key={m.id} className="vt-row">
                <div className="vt-who">
                  <span className="vt-name">{m.name || m.email || '(unnamed)'}</span>
                  {m.email && m.name ? <span className="vt-email">{m.email}</span> : null}
                  {m.status && m.status !== 'active' ? <span className="vt-tag">{m.status}</span> : null}
                </div>
                <div className="vt-controls">
                  {canManage ? (
                    <select
                      value={m.vendor_role || ''}
                      onChange={(e) => changeRole(m, e.target.value)}
                      disabled={saving}
                    >
                      {!m.vendor_role && <option value="">(no role)</option>}
                      {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <span className="vt-rolepill">{m.vendor_role || 'no role'}</span>
                  )}
                  {canManage && (
                    <button type="button" className="vt-del" onClick={() => remove(m)} disabled={saving}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const CSS = `
.vt { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:980px; }
.vt *,.vt *::before,.vt *::after { box-sizing:border-box; }
.vt h1,.vt h2 { font-family:'Cormorant Garamond',Georgia,serif; margin:0; }
.vt-head { margin-bottom:18px; }
.vt-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.vt-title { font-size:28px; color:var(--e); line-height:1.1; }
.vt-sub { font-size:13px; color:var(--mut); margin:4px 0 0; max-width:640px; }
.vt-myrole { color:var(--e2); font-weight:600; }
.vt-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.vt-ok { background:rgba(30,93,74,.1); border:1px solid rgba(30,93,74,.3); color:var(--e2); padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.vt-section { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:18px; margin-bottom:14px; }
.vt-section h2 { font-size:20px; color:var(--e); margin-bottom:12px; }
.vt-muted { color:var(--mut); font-size:12.5px; }
.vt label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; }
.vt input,.vt select { font:inherit; font-size:13px; padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; color:var(--ink); }
.vt-addrow { display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap; }
.vt-addrow label { flex:1; min-width:160px; }
.vt-list { display:flex; flex-direction:column; gap:8px; }
.vt-row { display:flex; align-items:center; justify-content:space-between; gap:12px; border:1px solid var(--ln); border-radius:10px; padding:10px 14px; background:var(--iv); }
.vt-who { display:flex; flex-direction:column; gap:2px; }
.vt-name { font-size:13.5px; color:var(--e); font-weight:600; }
.vt-email { font-size:11.5px; color:var(--mut); }
.vt-tag { font-size:10px; background:var(--mut); color:#fff; padding:1px 7px; border-radius:20px; align-self:flex-start; margin-top:2px; text-transform:uppercase; letter-spacing:.5px; }
.vt-controls { display:flex; align-items:center; gap:10px; }
.vt-rolepill { font-size:12px; color:var(--e2); background:rgba(30,93,74,.08); border:1px solid rgba(30,93,74,.2); padding:4px 10px; border-radius:20px; }
.vt-del { background:none; border:0; color:#9a3a28; font:inherit; font-size:12px; cursor:pointer; }
.vt-del:disabled { opacity:.5; cursor:default; }
.vt-btn { background:var(--e); color:#fff; border:0; border-radius:9px; font:inherit; font-size:13px; font-weight:600; padding:10px 22px; cursor:pointer; }
.vt-btn:hover { background:var(--e2); }
.vt-btn:disabled { opacity:.6; cursor:default; }
@media (max-width:680px){ .vt-row { flex-direction:column; align-items:flex-start; } }
`;
