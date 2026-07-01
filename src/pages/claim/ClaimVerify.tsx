import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { getToken } from '../../lib/api';

/**
 * Claim verification page. Calls POST /api/claim/verify then
 * POST /api/claim/verify/confirm. Collects full name, role, business email, the
 * verification code, and the exact agreement checkbox.
 *
 * Confirming converts the listing into a Free Partner account, which requires a
 * signed-in user. If the visitor is not signed in we prompt them to sign in.
 *
 * ZERO em dashes anywhere (hard rule). Self-contained styles, Divini brand.
 */

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

const AGREEMENT_TEXT =
  'I confirm that I am the owner or an authorized representative of this business, that the information I provide is accurate, and that I have the authority to claim and manage this profile on Divini Partners by Divini Group. I understand that the existing listing was generated from publicly available information and that claiming it converts it into a verified Free Partner account I control.';

const STYLES = `
.cvf{--emerald:#1E5D4A;--emerald-deep:#123c2e;--emerald-mid:#174838;--champagne:#D9CCB0;--ink:#2c2a26;--muted:#7d776c;--line:#e7e1d6;--ivory:#f7f4ee;--bg:#f3efe6;background:var(--bg);color:var(--ink);min-height:100vh;font-family:Inter,system-ui,sans-serif}
.cvf .wrap{max-width:560px;margin:0 auto;padding:34px 22px 80px}
.cvf h1,.cvf h2,.cvf h3{font-family:'Cormorant Garamond',serif;color:var(--emerald-deep);margin:0}
.cvf .brandbar{display:flex;align-items:center;gap:11px;margin-bottom:22px}
.cvf .brandbar .mk{width:38px;height:38px;border-radius:9px;background:var(--emerald-deep);color:var(--champagne);display:grid;place-items:center;font-family:'Cormorant Garamond',serif;font-weight:700;font-size:21px}
.cvf .brandbar .nm{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;color:var(--emerald-deep);line-height:1}
.cvf .brandbar .tg{font-size:9.5px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-top:2px}
.cvf .card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:26px}
.cvf h1.title{font-size:28px;margin-bottom:4px}
.cvf .lead{font-size:13.5px;color:var(--muted);line-height:1.55;margin:0 0 20px}
.cvf .row{margin-bottom:14px}
.cvf label{display:block;font-size:12px;color:var(--muted);font-weight:600;margin:0 0 6px}
.cvf input{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:10px;font-family:Inter;font-size:14px;background:#fff;color:var(--ink);box-sizing:border-box}
.cvf input:focus{outline:none;border-color:var(--emerald)}
.cvf .agree{display:flex;gap:10px;align-items:flex-start;background:var(--ivory);border:1px solid var(--line);border-radius:11px;padding:13px;margin:6px 0 16px}
.cvf .agree input{width:18px;height:18px;margin-top:2px;flex-shrink:0}
.cvf .agree span{font-size:12.5px;color:var(--ink);line-height:1.5}
.cvf .btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--line);background:#fff;color:var(--emerald-deep);font-family:Inter;font-size:14px;font-weight:600;padding:12px 20px;border-radius:11px;cursor:pointer;transition:.15s;width:100%}
.cvf .btn:hover{border-color:var(--emerald);background:var(--ivory)}
.cvf .btn.primary{background:var(--emerald);border-color:var(--emerald);color:#fff}
.cvf .btn.primary:hover{background:var(--emerald-mid)}
.cvf .btn:disabled{opacity:.5;cursor:not-allowed}
.cvf .btn.ghost{background:transparent;margin-top:10px}
.cvf .msg{padding:11px 14px;border-radius:10px;font-size:13.5px;margin-top:14px}
.cvf .msg.ok{background:#eef6f1;border:1px solid #cfe6da;color:var(--emerald-deep)}
.cvf .msg.err{background:#fbeeee;border:1px solid #ecd2d2;color:#7a3030}
.cvf .msg.info{background:#f6f1e6;border:1px solid var(--champagne);color:var(--emerald-deep)}
.cvf .note{font-size:12px;color:var(--muted);margin-top:14px;line-height:1.5}
`;

type StartResult = {
  verificationId: string;
  method: 'email_domain' | 'email_code' | 'manual';
  autoVerified: boolean;
  codeIssued: boolean;
  maskedEmail?: string | null;
};

export default function ClaimVerify() {
  const { slug = '' } = useParams();
  const nav = useNavigate();
  const { session } = useAuth();

  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [code, setCode] = useState('');
  const [start, setStart] = useState<StartResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);

  async function beginClaim() {
    setMsg(null);
    if (!fullName.trim() || !role.trim() || !businessEmail.trim()) {
      setMsg({ kind: 'err', text: 'Please complete your name, role, and business email.' });
      return;
    }
    if (!agreed) {
      setMsg({ kind: 'err', text: 'Please accept the agreement to continue.' });
      return;
    }
    setBusy(true);
    try {
      const token = getToken();
      const res = await fetch(`${BASE}/api/claim/verify`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ slug, fullName, role, businessEmail, agreementAccepted: agreed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not start the claim.');
      setStart(data as StartResult);
      if (data.method === 'email_domain' && data.autoVerified) {
        setMsg({ kind: 'ok', text: 'Your email domain matches the listing. You can finish claiming now.' });
      } else if (data.method === 'email_code') {
        setMsg({ kind: 'info', text: `We sent a verification code to ${data.maskedEmail}. Enter it below.` });
      } else {
        setMsg({ kind: 'info', text: 'Your claim has been submitted for manual review by our team.' });
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Could not start the claim.' });
    } finally {
      setBusy(false);
    }
  }

  async function confirmClaim() {
    setMsg(null);
    if (!session?.user) {
      setMsg({ kind: 'info', text: 'Please sign in to finish claiming and create your free partner account.' });
      return;
    }
    setBusy(true);
    try {
      const token = getToken();
      const res = await fetch(`${BASE}/api/claim/verify/confirm`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ slug, code: code || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.pending) {
          setMsg({ kind: 'info', text: 'This claim is pending manual review by our team.' });
          return;
        }
        throw new Error(data?.error || 'Could not confirm the claim.');
      }
      setMsg({ kind: 'ok', text: 'Your profile is claimed. Redirecting to your dashboard...' });
      setTimeout(() => nav('/app'), 1400);
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Could not confirm the claim.' });
    } finally {
      setBusy(false);
    }
  }

  const showConfirm = start && (start.autoVerified || start.codeIssued);

  return (
    <div className="cvf">
      <style>{STYLES}</style>
      <div className="wrap">
        <div className="brandbar">
          <div className="mk">D</div>
          <div>
            <div className="nm">Divini Partners</div>
            <div className="tg">by Divini Group</div>
          </div>
        </div>

        <div className="card">
          <h1 className="title">Claim this profile</h1>
          <p className="lead">
            Verify that you own or represent this business to take ownership of the listing. Claiming
            is free and converts the profile into a Free Partner account you control.
          </p>

          {!start && (
            <>
              <div className="row">
                <label>Full name</label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
              </div>
              <div className="row">
                <label>Your role at the business</label>
                <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Owner, manager, director" />
              </div>
              <div className="row">
                <label>Business email</label>
                <input value={businessEmail} onChange={(e) => setBusinessEmail(e.target.value)} placeholder="you@business.com" type="email" />
              </div>
              <label className="agree">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                <span>{AGREEMENT_TEXT}</span>
              </label>
              <button className="btn primary" onClick={beginClaim} disabled={busy}>
                {busy ? 'Verifying...' : 'Start verification'}
              </button>
            </>
          )}

          {showConfirm && (
            <>
              {start!.codeIssued && (
                <div className="row">
                  <label>Verification code</label>
                  <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6 digit code" inputMode="numeric" />
                </div>
              )}
              {!session?.user && (
                <button
                  className="btn ghost"
                  onClick={() =>
                    nav(
                      `/register?email=${encodeURIComponent(businessEmail)}`,
                    )
                  }
                >
                  Create an account to finish claiming
                </button>
              )}
              <button className="btn primary" onClick={confirmClaim} disabled={busy} style={{ marginTop: 10 }}>
                {busy ? 'Confirming...' : 'Finish claiming'}
              </button>
            </>
          )}

          {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}

          <p className="note">
            This listing was generated from publicly available information. Claiming it does not by
            itself grant verified, preferred, or partnered status; those are earned separately.
          </p>
        </div>
      </div>
    </div>
  );
}
