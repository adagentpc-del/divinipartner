import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { apiGet, apiSend } from '../lib/api';
import { reportSignal } from '../lib/fingerprint';

/**
 * Get started: role + plan + account-name selection. Shown to a verified,
 * signed-in user who does not yet have an organization (account). Posts to
 * /api/register to create the org, then routes into the app.
 *
 * This was previously the body of Register.tsx; native auth split account
 * creation (email + password + verify) from this org-setup step.
 *
 * Zero em dashes.
 */

/** Invite token from ?invite= or the stash set by the /join landing page. */
function readInviteToken(params: URLSearchParams): string | null {
  const fromUrl = params.get('invite');
  if (fromUrl) return fromUrl;
  try {
    return sessionStorage.getItem('divini.invite');
  } catch {
    return null;
  }
}

/**
 * Referral code from ?ref= or the localStorage stash set by the /r/:code
 * landing page (which survives the email-verify round-trip). Read once so the
 * field can be prefilled; the user can still edit or enter one manually.
 */
function readRefCode(params: URLSearchParams): string {
  const fromUrl = params.get('ref');
  if (fromUrl) return fromUrl.trim();
  try {
    return (localStorage.getItem('divini_ref') ?? '').trim();
  } catch {
    return '';
  }
}

type Role = 'venue' | 'vendor' | 'supplier' | 'installer' | 'planner' | 'client' | 'sponsor';
type Tier = 'client' | 'free_partner' | 'partner' | 'premier';

const ROLES: { key: Role; label: string; blurb: string }[] = [
  { key: 'client', label: 'Client / Event Booker', blurb: 'Plan events, source vendors, manage everything.' },
  { key: 'venue', label: 'Venue / Hotel', blurb: 'List spaces, availability, rates, and preferred vendors.' },
  { key: 'vendor', label: 'Vendor / Service Provider', blurb: 'Win work, quote fast, manage events in one place.' },
  { key: 'supplier', label: 'Supplier / Rentals', blurb: 'List rental inventory, pricing, and availability.' },
  { key: 'planner', label: 'Event Planner', blurb: 'Run multiple client events end to end.' },
  { key: 'installer', label: 'Installer / Support Staff', blurb: 'Receive jobs, schedules, and load-in details.' },
  { key: 'sponsor', label: 'Sponsor / Brand', blurb: 'Discover sponsorship opportunities across premium venues and events.' },
];

const TIERS: { key: Tier; label: string; price: string; fee: string }[] = [
  { key: 'free_partner', label: 'Free Partner', price: 'Free', fee: '5% platform fee' },
  { key: 'partner', label: 'Partner', price: '$45 / month', fee: '2.5% platform fee' },
  { key: 'premier', label: 'Premier', price: '$99 / month', fee: '1% platform fee' },
];

// Client membership plans. The client pays the platform fee, so their plan sets
// the % they pay (capped at $2,500 per event). Free clients stay on the base
// rate; Plus/Pro subscribe to lower their fee.
const CLIENT_TIERS: { key: Tier; label: string; price: string; fee: string }[] = [
  { key: 'client', label: 'Free', price: 'Free', fee: '5% fee, capped $2,500/event' },
  { key: 'partner', label: 'Plus', price: '$45 / month', fee: '2.5% fee, capped $2,500/event' },
  { key: 'premier', label: 'Pro', price: '$99 / month', fee: '1% fee, capped $2,500/event' },
];

export default function GetStarted() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { session, refreshCompany } = useAuth();
  const inviteToken = readInviteToken(params);
  const [role, setRole] = useState<Role | null>(null);
  const [orgName, setOrgName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [refCode, setRefCode] = useState<string>(() => readRefCode(params));
  const [tier, setTier] = useState<Tier>('free_partner');
  const [clientTier, setClientTier] = useState<Tier>('client');
  // Pricing V2 (server flag): no membership tiers. When on, hide the plan
  // picker and register everyone free. Read from /api/pricing.
  const [pricingV2, setPricingV2] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const isClient = role === 'client';
  // Under Pricing V2 the plan picker is hidden and everyone registers free:
  // a client stays client, every other role is a free partner.
  const effectiveTier: Tier = isClient ? clientTier : pricingV2 ? 'free_partner' : tier;

  useEffect(() => {
    let alive = true;
    apiGet<{ pricingV2?: boolean }>('/pricing')
      .then((r) => { if (alive) setPricingV2(Boolean(r?.pricingV2)); })
      .catch(() => { /* default to legacy tiers on error */ });
    return () => { alive = false; };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!role) return setErr('Choose an account type.');
    if (!orgName.trim()) return setErr('Enter your business or account name.');
    if (!agree) return setErr('Please accept the policies to continue.');
    setBusy(true);
    try {
      await apiSend('POST', '/register', {
        role,
        orgName: orgName.trim(),
        tier: effectiveTier,
        ...(contactName.trim() ? { name: contactName.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(inviteToken ? { invite: inviteToken } : {}),
      });
      try {
        sessionStorage.removeItem('divini.invite');
      } catch {
        /* ignore */
      }
      // Referral capture: if this signup carried a referral code (from /r/:code
      // or entered by hand), convert it now. The server grants the referrer a
      // credit and flags this user's signup incentive; it is idempotent and
      // self-referral-safe. Best-effort so it never blocks account setup.
      const code = refCode.trim();
      if (code) {
        await apiSend('POST', '/referrals/convert', { code }).catch(() => undefined);
        try {
          localStorage.removeItem('divini_ref');
        } catch {
          /* ignore */
        }
      }
      void reportSignal('/get-started');
      await refreshCompany();
      nav('/app', { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? 'Could not finish setting up your account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="reg">
      <style>{`
        .reg{min-height:100vh;background:#f3efe6;color:#2c2a26;font-family:Inter,system-ui,sans-serif;padding:40px 20px}
        .reg .wrap{max-width:720px;margin:0 auto}
        .reg .brand{font-family:'Cormorant Garamond',serif;font-size:24px;color:#123c2e;font-weight:700;text-align:center}
        .reg .tg{text-align:center;color:#7d776c;font-size:12px;letter-spacing:.5px;text-transform:uppercase;margin-bottom:24px}
        .reg .card{background:#fff;border:1px solid #e7e1d6;border-radius:16px;padding:28px;box-shadow:0 30px 60px -40px rgba(18,60,46,.4)}
        .reg h1{font-family:'Cormorant Garamond',serif;font-size:30px;color:#123c2e;margin:0 0 4px}
        .reg .sub{color:#7d776c;font-size:14px;margin-bottom:22px}
        .reg .lbl{font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#7d776c;margin:18px 0 10px}
        .reg .roles{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        @media(max-width:560px){.reg .roles{grid-template-columns:1fr}}
        .reg .role{text-align:left;border:1px solid #e7e1d6;background:#fff;border-radius:12px;padding:14px;cursor:pointer;transition:.15s}
        .reg .role:hover{border-color:#1E5D4A}
        .reg .role.on{border-color:#1E5D4A;background:#f0f6f2;box-shadow:0 0 0 1px #1E5D4A inset}
        .reg .role .rn{font-weight:700;font-size:15px;color:#123c2e}
        .reg .role .rb{font-size:12.5px;color:#7d776c;margin-top:3px;line-height:1.4}
        .reg input{width:100%;padding:12px;border:1px solid #e7e1d6;border-radius:10px;font-size:15px;font-family:Inter}
        .reg input:focus{outline:none;border-color:#1E5D4A}
        .reg .tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
        @media(max-width:560px){.reg .tiers{grid-template-columns:1fr}}
        .reg .tier{text-align:left;border:1px solid #e7e1d6;background:#fff;border-radius:12px;padding:14px;cursor:pointer}
        .reg .tier.on{border-color:#C9A35B;background:#fbf7ee;box-shadow:0 0 0 1px #C9A35B inset}
        .reg .tier .tn{font-weight:700;color:#123c2e}
        .reg .tier .tp{font-family:'Cormorant Garamond',serif;font-size:20px;color:#123c2e}
        .reg .tier .tf{font-size:12px;color:#7d776c}
        .reg .agree{display:flex;gap:10px;align-items:flex-start;margin:18px 0;font-size:13px;color:#2c2a26;line-height:1.5}
        .reg .agree input{width:auto;margin-top:3px}
        .reg .btn{width:100%;padding:14px;border:none;border-radius:12px;background:#1E5D4A;color:#fff;font-weight:700;font-size:15px;cursor:pointer}
        .reg .btn:disabled{opacity:.5;cursor:default}
        .reg .err{background:#fbe9e7;color:#a3382f;border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:14px}
        .reg .free{font-size:13px;color:#1f7a4d;font-weight:600}
      `}</style>
      <div className="wrap">
        <div className="brand">Divini Partners</div>
        <div className="tg">by Divini Group</div>
        <div className="card">
          <h1>Set up your account</h1>
          <div className="sub">Signed in as {session?.user?.email ?? 'your account'}. Choose how you will use Divini Partners.</div>
          {err && <div className="err">{err}</div>}
          <form onSubmit={submit}>
            <div className="lbl">I am a...</div>
            <div className="roles">
              {ROLES.map((r) => (
                <div key={r.key} className={'role' + (role === r.key ? ' on' : '')} onClick={() => setRole(r.key)}>
                  <div className="rn">{r.label}</div>
                  <div className="rb">{r.blurb}</div>
                </div>
              ))}
            </div>

            <div className="lbl">{isClient ? 'Account name' : 'Business name'}</div>
            <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder={isClient ? 'Your name or company' : 'Your business name'} />

            <div className="lbl">Your name</div>
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Full name" autoComplete="name" />

            <div className="lbl">Phone</div>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(305) 555-0100" autoComplete="tel" inputMode="tel" />

            <div className="lbl">Referral code <span style={{ textTransform: 'none', fontWeight: 400, color: '#9a9488' }}>(optional)</span></div>
            <input value={refCode} onChange={(e) => setRefCode(e.target.value)} placeholder="Enter a referral code if you have one" autoCapitalize="characters" />

            {!isClient && role && !pricingV2 && (
              <>
                <div className="lbl">Choose your plan</div>
                <div className="tiers">
                  {TIERS.map((t) => (
                    <div key={t.key} className={'tier' + (tier === t.key ? ' on' : '')} onClick={() => setTier(t.key)}>
                      <div className="tn">{t.label}</div>
                      <div className="tp">{t.price}</div>
                      <div className="tf">{t.fee}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {!isClient && role && pricingV2 && (
              <>
                <div className="lbl">Your account</div>
                <div className="free">
                  Free to join with one seat. List your services, get matched, and bid on
                  every opportunity at no monthly cost. Add extra team seats anytime, and
                  upgrade to Featured Vendor for top placement whenever you are ready.
                </div>
              </>
            )}
            {isClient && (
              <>
                <div className="lbl">Choose your plan</div>
                <div className="tiers">
                  {CLIENT_TIERS.map((t) => (
                    <div
                      key={t.key}
                      className={'tier' + (clientTier === t.key ? ' on' : '')}
                      onClick={() => setClientTier(t.key)}
                    >
                      <div className="tn">{t.label}</div>
                      <div className="tp">{t.price}</div>
                      <div className="tf">{t.fee}</div>
                    </div>
                  ))}
                </div>
                <div className="free" style={{ marginTop: 10 }}>
                  Free to plan events and compare quotes. Your plan sets the small fee you pay
                  when you book, capped at $2,500 per event. Upgrade anytime to lower it.
                </div>
              </>
            )}

            <label className="agree">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>I agree to the Divini Partners <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>, <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>, <a href="/payment-policy" target="_blank" rel="noopener noreferrer">Payment Policy</a>, <a href="/marketplace-conduct" target="_blank" rel="noopener noreferrer">Marketplace Conduct Policy</a>, and <a href="/non-circumvention" target="_blank" rel="noopener noreferrer">Non-Circumvention Policy</a>. I understand Divini Partners is a lead-generation and networking platform, is not a party to transactions between users, and that payments are handled by third-party processors under the platform fee and payment policies.</span>
            </label>

            <button className="btn" disabled={busy}>{busy ? 'Setting up...' : 'Continue'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
