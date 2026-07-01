import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

/**
 * Strategic Partner secure onboarding form. Route: /partner-onboarding/:code
 *
 * Public-ish: access is gated by the unguessable onboarding_code in the URL (no
 * sign-in required). The partner submits legal/tax/contact info, their W-9 (as a
 * document URL/id reference), ACH banking, the partner agreement, and a typed
 * signature. On success we show a MASKED confirmation (****last4) and never
 * redisplay the full account number.
 *
 * Calls GET /api/partner-onboarding/:code then POST /api/partner-onboarding/:code.
 *
 * ZERO em dashes anywhere (hard rule). Self-contained styles, Divini brand.
 */

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

const AGREEMENT_TEXT =
  'I confirm that I am the partner named above or an authorized representative, that the tax, banking, and identity information I provide is accurate and current, and that Divini Partners by Divini Group may use it to issue commission payouts. I understand that my banking details are stored encrypted and are never displayed in full after submission.';

const STYLES = `
.pob{--emerald:#1E5D4A;--emerald-deep:#123c2e;--emerald-mid:#174838;--champagne:#D9CCB0;--ink:#2c2a26;--muted:#7d776c;--line:#e7e1d6;--ivory:#f7f4ee;--bg:#f3efe6;background:var(--bg);color:var(--ink);min-height:100vh;font-family:Inter,system-ui,sans-serif}
.pob .wrap{max-width:620px;margin:0 auto;padding:34px 22px 80px}
.pob h1,.pob h2,.pob h3{font-family:'Cormorant Garamond',serif;color:var(--emerald-deep);margin:0}
.pob .brandbar{display:flex;align-items:center;gap:11px;margin-bottom:22px}
.pob .brandbar .mk{width:38px;height:38px;border-radius:9px;background:var(--emerald-deep);color:var(--champagne);display:grid;place-items:center;font-family:'Cormorant Garamond',serif;font-weight:700;font-size:21px}
.pob .brandbar .nm{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:700;color:var(--emerald-deep);line-height:1}
.pob .brandbar .tg{font-size:9.5px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-top:2px}
.pob .card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:26px;margin-bottom:18px}
.pob h1.title{font-size:28px;margin-bottom:4px}
.pob .lead{font-size:13.5px;color:var(--muted);line-height:1.55;margin:0 0 20px}
.pob h3.sec{font-size:18px;margin:4px 0 14px;padding-top:4px}
.pob .row{margin-bottom:14px}
.pob .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:520px){.pob .grid2{grid-template-columns:1fr}}
.pob label{display:block;font-size:12px;color:var(--muted);font-weight:600;margin:0 0 6px}
.pob input,.pob select,.pob textarea{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:10px;font-family:Inter;font-size:14px;background:#fff;color:var(--ink);box-sizing:border-box}
.pob textarea{min-height:60px;resize:vertical}
.pob input:focus,.pob select:focus,.pob textarea:focus{outline:none;border-color:var(--emerald)}
.pob .agree{display:flex;gap:10px;align-items:flex-start;background:var(--ivory);border:1px solid var(--line);border-radius:11px;padding:13px;margin:6px 0 16px}
.pob .agree input{width:18px;height:18px;margin-top:2px;flex-shrink:0}
.pob .agree span{font-size:12.5px;color:var(--ink);line-height:1.5}
.pob .btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--line);background:#fff;color:var(--emerald-deep);font-family:Inter;font-size:14px;font-weight:600;padding:12px 20px;border-radius:11px;cursor:pointer;transition:.15s;width:100%}
.pob .btn:hover{border-color:var(--emerald);background:var(--ivory)}
.pob .btn.primary{background:var(--emerald);border-color:var(--emerald);color:#fff}
.pob .btn.primary:hover{background:var(--emerald-mid)}
.pob .btn:disabled{opacity:.5;cursor:not-allowed}
.pob .msg{padding:11px 14px;border-radius:10px;font-size:13.5px;margin-top:14px}
.pob .msg.ok{background:#eef6f1;border:1px solid #cfe6da;color:var(--emerald-deep)}
.pob .msg.err{background:#fbeeee;border:1px solid #ecd2d2;color:#7a3030}
.pob .msg.warn{background:#fcf6e8;border:1px solid #ecddb6;color:#7a5b1f}
.pob .lock{font-size:12px;color:var(--muted);margin-top:8px;line-height:1.5}
.pob .mask{font-family:ui-monospace,Menlo,monospace;font-size:18px;letter-spacing:1px;color:var(--emerald-deep)}
.pob .pill{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:3px 9px;border-radius:999px;background:var(--ivory);border:1px solid var(--line);color:var(--emerald-deep)}
`;

type Shell = {
  onboarding: {
    code: string;
    status: 'awaiting' | 'submitted' | 'verified';
    partnerName: string | null;
    legal_name: string | null;
    business_name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    tax_classification: string | null;
    payment_preference: string | null;
    bank_name: string | null;
    account_type: string | null;
    account_last4: string | null;
    agreement_accepted: boolean;
    w9_on_file: boolean;
  };
};

type Confirmation = {
  ok: boolean;
  confirmation: {
    status: string;
    bank_name: string | null;
    account_type: string | null;
    account_last4: string | null;
    masked: string | null;
    bankCaptured: boolean;
    encryptionConfigured: boolean;
  };
  warning: string | null;
};

const TAX_CLASSES = [
  ['', 'Select tax classification'],
  ['individual', 'Individual / Sole Proprietor'],
  ['llc', 'LLC'],
  ['s_corp', 'S Corporation'],
  ['c_corp', 'C Corporation'],
  ['partnership', 'Partnership'],
  ['nonprofit', 'Nonprofit / Tax-Exempt'],
] as const;

export default function PartnerOnboarding() {
  const { code = '' } = useParams();
  const [shell, setShell] = useState<Shell['onboarding'] | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [loading, setLoading] = useState(true);

  // form fields
  const [legalName, setLegalName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [taxClass, setTaxClass] = useState('');
  const [w9Url, setW9Url] = useState('');
  const [paymentPref, setPaymentPref] = useState('ach');
  const [bankName, setBankName] = useState('');
  const [routing, setRouting] = useState('');
  const [account, setAccount] = useState('');
  const [accountType, setAccountType] = useState('checking');
  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState('');

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'warn'; text: string } | null>(null);
  const [done, setDone] = useState<Confirmation['confirmation'] | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/partner-onboarding/${encodeURIComponent(code)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Link not found.');
        return r.json() as Promise<Shell>;
      })
      .then((d) => {
        setShell(d.onboarding);
        setLegalName(d.onboarding.legal_name || '');
        setBusinessName(d.onboarding.business_name || '');
        setEmail(d.onboarding.email || '');
        setPhone(d.onboarding.phone || '');
        setAddress(d.onboarding.address || '');
        setTaxClass(d.onboarding.tax_classification || '');
        setPaymentPref(d.onboarding.payment_preference || 'ach');
        setBankName(d.onboarding.bank_name || '');
        setAccountType(d.onboarding.account_type || 'checking');
      })
      .catch((e) => setLoadErr(e.message || 'Could not load this onboarding link.'))
      .finally(() => setLoading(false));
  }, [code]);

  async function submit() {
    setMsg(null);
    if (!legalName.trim()) return setMsg({ kind: 'err', text: 'Legal name is required.' });
    if (!taxClass) return setMsg({ kind: 'err', text: 'Please select your tax classification.' });
    if (!agreed) return setMsg({ kind: 'err', text: 'Please accept the partner agreement.' });
    if (!signature.trim()) return setMsg({ kind: 'err', text: 'Please type your signature.' });
    if (account.trim() && !routing.trim()) {
      return setMsg({ kind: 'err', text: 'Routing number is required with an account number.' });
    }
    setBusy(true);
    try {
      const r = await fetch(`${BASE}/api/partner-onboarding/${encodeURIComponent(code)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legal_name: legalName.trim(),
          business_name: businessName.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          tax_classification: taxClass,
          w9_doc_url: w9Url.trim() || null,
          payment_preference: paymentPref,
          bank_name: bankName.trim() || null,
          routing_number: routing.trim() || null,
          account_number: account.trim() || null,
          account_type: accountType,
          agreement_accepted: agreed,
          signature: signature.trim(),
        }),
      });
      const body = (await r.json().catch(() => ({}))) as Confirmation & { error?: string };
      if (!r.ok) throw new Error(body?.error || 'Submission failed.');
      setDone(body.confirmation);
      if (body.warning) setMsg({ kind: 'warn', text: body.warning });
      // clear the sensitive fields from memory immediately
      setRouting('');
      setAccount('');
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message || 'Submission failed.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pob">
      <style>{STYLES}</style>
      <div className="wrap">
        <div className="brandbar">
          <div className="mk">D</div>
          <div>
            <div className="nm">Divini Partners</div>
            <div className="tg">Strategic Partner Onboarding</div>
          </div>
        </div>

        {loading && <div className="card">Loading your secure onboarding link...</div>}

        {!loading && loadErr && (
          <div className="card">
            <h1 className="title">Link unavailable</h1>
            <p className="lead">{loadErr}</p>
            <p className="lock">If you believe this is an error, contact the Divini Partners team.</p>
          </div>
        )}

        {!loading && !loadErr && done && (
          <div className="card">
            <span className="pill">Submitted</span>
            <h1 className="title" style={{ marginTop: 10 }}>You are all set</h1>
            <p className="lead">
              Thank you. Your onboarding details have been received securely. Our team will review and
              verify your information.
            </p>
            {done.bankCaptured && (
              <div className="row">
                <label>Bank account on file</label>
                <div className="mask">{done.masked || '****'}</div>
                <p className="lock">
                  {done.bank_name ? `${done.bank_name} ` : ''}
                  {done.account_type ? `(${done.account_type}) ` : ''}
                  For your security the full account number is never shown again.
                </p>
              </div>
            )}
            {msg && msg.kind === 'warn' && <div className="msg warn">{msg.text}</div>}
          </div>
        )}

        {!loading && !loadErr && shell && !done && (
          <>
            <div className="card">
              <h1 className="title">
                {shell.partnerName ? `Welcome, ${shell.partnerName}` : 'Partner onboarding'}
              </h1>
              <p className="lead">
                Please complete your tax, identity, and payout details so we can issue your commission
                payouts. Your banking information is encrypted and is never displayed in full after you
                submit.
              </p>

              <h3 className="sec">Identity and tax</h3>
              <div className="grid2">
                <div className="row">
                  <label>Legal name *</label>
                  <input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
                </div>
                <div className="row">
                  <label>Business name</label>
                  <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
                </div>
              </div>
              <div className="grid2">
                <div className="row">
                  <label>Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="row">
                  <label>Phone</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
              <div className="row">
                <label>Mailing address</label>
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="grid2">
                <div className="row">
                  <label>Tax classification *</label>
                  <select value={taxClass} onChange={(e) => setTaxClass(e.target.value)}>
                    {TAX_CLASSES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="row">
                  <label>W-9 document link</label>
                  <input
                    placeholder="https://... (uploaded W-9 URL)"
                    value={w9Url}
                    onChange={(e) => setW9Url(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="card">
              <h3 className="sec">Payout method</h3>
              <div className="grid2">
                <div className="row">
                  <label>Payment preference</label>
                  <select value={paymentPref} onChange={(e) => setPaymentPref(e.target.value)}>
                    <option value="ach">ACH (bank transfer)</option>
                    <option value="check">Check</option>
                    <option value="paypal">PayPal</option>
                    <option value="wire">Wire</option>
                  </select>
                </div>
                <div className="row">
                  <label>Account type</label>
                  <select value={accountType} onChange={(e) => setAccountType(e.target.value)}>
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                  </select>
                </div>
              </div>
              <div className="row">
                <label>Bank name</label>
                <input value={bankName} onChange={(e) => setBankName(e.target.value)} />
              </div>
              <div className="grid2">
                <div className="row">
                  <label>Routing number</label>
                  <input
                    inputMode="numeric"
                    autoComplete="off"
                    value={routing}
                    onChange={(e) => setRouting(e.target.value)}
                  />
                </div>
                <div className="row">
                  <label>Account number</label>
                  <input
                    inputMode="numeric"
                    autoComplete="off"
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                  />
                </div>
              </div>
              <p className="lock">
                Your routing and account numbers are encrypted on submission. We store only the last 4
                digits in a readable form for your reference.
              </p>
            </div>

            <div className="card">
              <h3 className="sec">Agreement and signature</h3>
              <div className="agree">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span>{AGREEMENT_TEXT}</span>
              </div>
              <div className="row">
                <label>Type your full name to sign *</label>
                <input value={signature} onChange={(e) => setSignature(e.target.value)} />
              </div>
              <button className="btn primary" disabled={busy} onClick={submit}>
                {busy ? 'Submitting securely...' : 'Submit onboarding'}
              </button>
              {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
