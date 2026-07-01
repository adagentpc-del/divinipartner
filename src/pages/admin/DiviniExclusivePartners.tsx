import React from 'react';
import { useAuth } from '../../lib/auth';

/**
 * Divini Exclusive Partners - super-admin home for the master partner program.
 * Hosts the master Partner Agreement template (downloadable, served from
 * /public/legal) and explains how it is used when onboarding exclusive
 * partners. Admin-only. Static info + download page (no backend dependency);
 * the live attach/auto-sign flow lives in the Agreements area.
 */
const AGREEMENT_URL = '/legal/Divini-Group-Partner-Agreement.docx';

const TERMS: [string, string][] = [
  ['Parties', 'Divini Group LLC (and its subsidiaries/affiliates, including Divini Partners) and the Partner. Florida-governed.'],
  ['Non-exclusive + overflow', 'No exclusivity or minimum volume. If a partner is at capacity, you may route the work to another vendor.'],
  ['Vendor assignment', 'Divini assigns the fulfilling vendor; the partner contracts with Divini Group, not the client.'],
  ['Removal + replacement', 'Remove or replace any assigned vendor immediately for breach, circumvention, performance, or any reason.'],
  ['Pricing stack', 'Client Total = Partner contract price + your Divini Margin % + optional per-deal kickback.'],
  ['Payments', 'All payments run through the platform. Partner paid out by ACH, net of margin and fees.'],
];

export default function DiviniExclusivePartners() {
  const { isAdmin, session } = useAuth();

  if (!session) {
    return <div style={{ padding: 40 }}><h1>Sign in required</h1></div>;
  }
  if (!isAdmin) {
    return <div style={{ padding: 40 }}><h1>Administrators only</h1><p>This area is limited to platform administrators.</p></div>;
  }

  return (
    <div className="dep">
      <style>{`
        .dep { max-width: 920px; margin: 0 auto; padding: 28px 20px 64px; }
        .dep h1 { font-size: 30px; margin: 0 0 4px; }
        .dep .sub { color: #667; margin: 0 0 24px; font-size: 15px; }
        .dep .card { border: 1px solid #e3e8e6; border-radius: 14px; padding: 22px 24px; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.04); margin-bottom: 18px; }
        .dep .card h2 { font-size: 20px; margin: 0 0 4px; }
        .dep .muted { color: #778; font-size: 14px; }
        .dep table { width: 100%; border-collapse: collapse; margin: 12px 0 4px; }
        .dep td { padding: 9px 10px; border-top: 1px solid #eef1f0; vertical-align: top; font-size: 14px; }
        .dep td.k { font-weight: 600; white-space: nowrap; width: 210px; color: #1F6F5C; }
        .dep .btn { display: inline-block; border: 1px solid #1F6F5C; color: #1F6F5C; background: #fff; border-radius: 9px; padding: 10px 16px; font-weight: 600; text-decoration: none; font-size: 14px; }
        .dep .btn.primary { background: #1F6F5C; color: #fff; }
        .dep .row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
        .dep .pill { display:inline-block; background:#EAF3EF; color:#1F6F5C; border-radius:999px; padding:3px 10px; font-size:12px; font-weight:600; }
      `}</style>

      <h1>Divini Exclusive Partners</h1>
      <p className="sub">The master partnership program for vetted Divini Group partners.</p>

      <div className="card">
        <span className="pill">Master template</span>
        <h2 style={{ marginTop: 8 }}>Divini Group Partner Agreement</h2>
        <p className="muted">Non-exclusive marketplace partnership. Use this as the master agreement when onboarding an exclusive partner. Fill the blanks (partner name, margin %, kickback, dates), then attach and sign it to the account.</p>
        <table><tbody>
          {TERMS.map(([k, v]) => (
            <tr key={k}><td className="k">{k}</td><td>{v}</td></tr>
          ))}
        </tbody></table>
        <div className="row">
          <a className="btn primary" href={AGREEMENT_URL} download>Download agreement (.docx)</a>
          <a className="btn" href={AGREEMENT_URL} target="_blank" rel="noopener noreferrer">Open in new tab</a>
          <a className="btn" href="/admin/agreements">Attach to an account</a>
        </div>
      </div>

      <div className="card">
        <h2>How to use it</h2>
        <table><tbody>
          <tr><td className="k">1. Create the profile</td><td>Add the partner under Vendors or Venues, with their contact email and yours, and send the invite to claim.</td></tr>
          <tr><td className="k">2. Set the agreement</td><td>On that account, use Agreement to set the type, your margin %, and any kickback. Paste the signed-doc link.</td></tr>
          <tr><td className="k">3. Manage fulfillment</td><td>Assign or swap the fulfilling vendor anytime; removal for breach or circumvention is logged to the audit trail.</td></tr>
        </tbody></table>
        <p className="muted" style={{ marginTop: 12 }}>This template is a starting point, not legal advice. Have a licensed attorney review it before relying on it.</p>
      </div>
    </div>
  );
}
