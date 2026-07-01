import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

// Phase 1 (Workstream A) - Account Assignments. Assign vendor team members as
// owner / collaborator / backup of an account (a venue, client org, or event by
// id), and list current assignments. Backed by /api/account-assignments and
// /api/vendor-team (for the member dropdown). Mutations are gated server-side on
// assign_accounts; the page hides the form when /me says the user lacks it.
//
// Self-contained: no route is registered here (the integration lead wires it).
// Default export, no required props.

type Member = { id: string; name: string | null; email: string | null; vendor_role: string | null };
type SubjectType = 'venue' | 'client' | 'event';
type AssignmentRole = 'owner' | 'collaborator' | 'backup';

type Assignment = {
  id: string;
  member_id: string | null;
  subject_type: SubjectType | null;
  subject_id: string | null;
  role: AssignmentRole | null;
  created_at: string;
};

type MeResp = { role: string | null; can: Record<string, boolean> };

const SUBJECT_TYPES: SubjectType[] = ['venue', 'client', 'event'];
const ROLES: AssignmentRole[] = ['owner', 'collaborator', 'backup'];

export default function AccountAssignments() {
  const [members, setMembers] = useState<Member[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [canAssign, setCanAssign] = useState(false);

  const [memberId, setMemberId] = useState('');
  const [subjectType, setSubjectType] = useState<SubjectType>('venue');
  const [subjectId, setSubjectId] = useState('');
  const [role, setRole] = useState<AssignmentRole>('owner');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [meRes, memRes, listRes] = await Promise.all([
        apiGet<MeResp>('/vendor-team/me'),
        apiGet<{ members: Member[] }>('/vendor-team'),
        apiGet<{ assignments: Assignment[] }>('/account-assignments'),
      ]);
      setCanAssign(!!meRes.can?.assign_accounts);
      setMembers(memRes.members || []);
      if (memRes.members?.length && !memberId) setMemberId(memRes.members[0].id);
      setAssignments(listRes.assignments || []);
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

  function memberLabel(id: string | null): string {
    const m = members.find((x) => x.id === id);
    if (!m) return id || '(unknown)';
    return m.name || m.email || '(unnamed)';
  }

  async function assign() {
    if (!memberId) { setError('Pick a team member.'); return; }
    if (!subjectId.trim()) { setError('Enter the subject id.'); return; }
    setSaving(true);
    setOk(null);
    try {
      await apiSend('POST', '/account-assignments', {
        member_id: memberId,
        subject_type: subjectType,
        subject_id: subjectId.trim(),
        role,
      });
      setSubjectId('');
      setOk('Assignment saved.');
      setError(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(a: Assignment) {
    setSaving(true);
    try {
      await apiSend('DELETE', `/account-assignments/${a.id}`);
      setError(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="aa">
      <style>{CSS}</style>

      <header className="aa-head">
        <span className="aa-kicker">Vendor Workspace</span>
        <h1 className="aa-title">Account Assignments</h1>
        <p className="aa-sub">
          Give each venue, client, or event an owner on your team, plus optional backups and
          collaborators. New intake for that account routes to the owner first.
        </p>
      </header>

      {error && <div className="aa-error">{error}</div>}
      {ok && <div className="aa-ok">{ok}</div>}

      {canAssign && (
        <section className="aa-section">
          <h2>Assign an account</h2>
          <div className="aa-form">
            <label>Member
              <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                {members.length === 0 && <option value="">(no team members)</option>}
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name || m.email || m.id}</option>
                ))}
              </select>
            </label>
            <label>Subject type
              <select value={subjectType} onChange={(e) => setSubjectType(e.target.value as SubjectType)}>
                {SUBJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label>Subject id
              <input value={subjectId} placeholder="venue / client / event uuid" onChange={(e) => setSubjectId(e.target.value)} />
            </label>
            <label>Role
              <select value={role} onChange={(e) => setRole(e.target.value as AssignmentRole)}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <button type="button" className="aa-btn" onClick={assign} disabled={saving || members.length === 0}>
              {saving ? 'Saving.' : 'Assign'}
            </button>
          </div>
        </section>
      )}

      <section className="aa-section">
        <h2>Current assignments</h2>
        {loading ? (
          <p className="aa-muted">Loading.</p>
        ) : assignments.length === 0 ? (
          <p className="aa-muted">No assignments yet.{canAssign ? ' Assign your first account above.' : ''}</p>
        ) : (
          <div className="aa-list">
            {assignments.map((a) => (
              <div key={a.id} className="aa-row">
                <div className="aa-info">
                  <span className={`aa-rolepill aa-${a.role}`}>{a.role}</span>
                  <span className="aa-member">{memberLabel(a.member_id)}</span>
                  <span className="aa-subject">{a.subject_type}: <code>{a.subject_id}</code></span>
                </div>
                {canAssign && (
                  <button type="button" className="aa-del" onClick={() => remove(a)} disabled={saving}>
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const CSS = `
.aa { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:980px; }
.aa *,.aa *::before,.aa *::after { box-sizing:border-box; }
.aa h1,.aa h2 { font-family:'Cormorant Garamond',Georgia,serif; margin:0; }
.aa-head { margin-bottom:18px; }
.aa-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.aa-title { font-size:28px; color:var(--e); line-height:1.1; }
.aa-sub { font-size:13px; color:var(--mut); margin:4px 0 0; max-width:640px; }
.aa-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.aa-ok { background:rgba(30,93,74,.1); border:1px solid rgba(30,93,74,.3); color:var(--e2); padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.aa-section { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:18px; margin-bottom:14px; }
.aa-section h2 { font-size:20px; color:var(--e); margin-bottom:12px; }
.aa-muted { color:var(--mut); font-size:12.5px; }
.aa label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; }
.aa input,.aa select { font:inherit; font-size:13px; padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; color:var(--ink); }
.aa-form { display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap; }
.aa-form label { flex:1; min-width:150px; }
.aa-list { display:flex; flex-direction:column; gap:8px; }
.aa-row { display:flex; align-items:center; justify-content:space-between; gap:12px; border:1px solid var(--ln); border-radius:10px; padding:10px 14px; background:var(--iv); }
.aa-info { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.aa-rolepill { font-size:10.5px; text-transform:uppercase; letter-spacing:.5px; color:#fff; padding:3px 9px; border-radius:20px; font-weight:600; }
.aa-owner { background:var(--e); }
.aa-collaborator { background:var(--g); }
.aa-backup { background:var(--mut); }
.aa-member { font-size:13.5px; color:var(--e); font-weight:600; }
.aa-subject { font-size:12px; color:var(--mut); }
.aa-subject code { font-size:11px; background:#fff; border:1px solid var(--ln); padding:1px 6px; border-radius:6px; }
.aa-del { background:none; border:0; color:#9a3a28; font:inherit; font-size:12px; cursor:pointer; }
.aa-del:disabled { opacity:.5; cursor:default; }
.aa-btn { background:var(--e); color:#fff; border:0; border-radius:9px; font:inherit; font-size:13px; font-weight:600; padding:10px 22px; cursor:pointer; }
.aa-btn:hover { background:var(--e2); }
.aa-btn:disabled { opacity:.6; cursor:default; }
@media (max-width:680px){ .aa-row { flex-direction:column; align-items:flex-start; } }
`;
