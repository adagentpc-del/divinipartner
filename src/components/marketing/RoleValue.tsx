import { Fragment } from 'react';
import FlowDiagram, { type FlowStep } from '../FlowDiagram';

/**
 * RoleValue - a self-contained "how it works" flow chart + a features & benefits
 * analysis for a given user type. Replaces the demo-video idea with something
 * static, fast, and self-serve. Drop <RoleValue role="venue" /> on any page.
 */

export type RoleKey = 'venue' | 'vendor' | 'planner' | 'client' | 'sponsor';

type RoleData = {
  label: string;
  flow: FlowStep[];
  benefits: { feature: string; benefit: string }[];
};

export const ROLE_CONTENT: Record<RoleKey, RoleData> = {
  venue: {
    label: 'Venues',
    flow: [
      { icon: '1', title: 'Build your venue profile', desc: 'Spaces, capacities, pricing, and rules — entered once.' },
      { icon: '2', title: 'Receive qualified inquiries', desc: 'Matched to events that actually fit your rooms and dates.' },
      { icon: '3', title: 'Send quotes in minutes', desc: 'Auto-drafted from your own pricing rules.' },
      { icon: '4', title: 'Book & coordinate', desc: 'Contracts, payments, and day-of in one workspace.' },
      { icon: '5', title: 'Grow revenue', desc: 'Upsells, preferred vendors, and rebookings surface automatically.' },
    ],
    benefits: [
      { feature: 'Venue digital twin', benefit: 'Every request maps to the right room instantly — no manual back-and-forth.' },
      { feature: 'Automated quotes', benefit: 'Respond in minutes and win more of the business you already attract.' },
      { feature: 'Qualified demand', benefit: 'Only see inquiries that fit your capacity, dates, and budget.' },
      { feature: 'Revenue inventory', benefit: 'Capture upgrades and sponsorships usually left on the table.' },
      { feature: 'One workspace', benefit: 'Contracts, payments, and coordination without the email chains.' },
    ],
  },
  vendor: {
    label: 'Vendors',
    flow: [
      { icon: '1', title: 'Create your vendor profile', desc: 'Services, coverage areas, and pricing.' },
      { icon: '2', title: 'Get matched to events', desc: 'Category, region, and availability matched to real demand.' },
      { icon: '3', title: 'Send pricing fast', desc: 'Quote in minutes instead of days.' },
      { icon: '4', title: 'Win & deliver', desc: 'Clear scope, contracts, and transparent payments.' },
      { icon: '5', title: 'Build reputation', desc: 'Verified history lifts you in future matches.' },
    ],
    benefits: [
      { feature: 'Matched leads', benefit: 'Work comes to you — no cold outreach or bidding blind.' },
      { feature: 'Minutes-not-days quoting', benefit: 'Respond first and win more of the events you fit.' },
      { feature: 'Verified reputation', benefit: 'A track record that ranks you higher over time.' },
      { feature: 'Transparent payments', benefit: 'Get paid on clear terms, recorded end to end.' },
      { feature: 'One pipeline', benefit: 'Every request, quote, and booking in a single view.' },
    ],
  },
  planner: {
    label: 'Planners',
    flow: [
      { icon: '1', title: 'Brief the event', desc: 'Type, guest count, budget, and must-haves.' },
      { icon: '2', title: 'Discover venues & vendors', desc: 'Matched and ranked from a vetted network.' },
      { icon: '3', title: 'Compare quotes side by side', desc: 'Apples-to-apples, no spreadsheet wrangling.' },
      { icon: '4', title: 'Book & coordinate', desc: 'Contracts and payments handled in-platform.' },
      { icon: '5', title: 'Run the day-of', desc: 'Timeline and responsibilities clear to everyone.' },
    ],
    benefits: [
      { feature: 'One workspace', benefit: 'Replace inboxes and spreadsheets with a single source of truth.' },
      { feature: 'Side-by-side quotes', benefit: 'Decide faster with transparent, comparable pricing.' },
      { feature: 'Vetted network', benefit: 'Only recommend partners with a verified history.' },
      { feature: 'Day-of coordination', benefit: 'No confusion over who owns what, or when.' },
      { feature: 'Transparent pricing', benefit: 'From first inquiry to final payment, nothing hidden.' },
    ],
  },
  client: {
    label: 'Clients',
    flow: [
      { icon: '1', title: 'Describe your event', desc: 'Tell us what you want and your budget.' },
      { icon: '2', title: 'Get matched', desc: 'Venues and vendors that fit, surfaced for you.' },
      { icon: '3', title: 'Compare transparent quotes', desc: 'Clear pricing, no guessing games.' },
      { icon: '4', title: 'Book & pay securely', desc: 'Everything recorded in one place.' },
      { icon: '5', title: 'Enjoy the day', desc: 'Coordinated details, fewer surprises.' },
    ],
    benefits: [
      { feature: 'No vendor hunting', benefit: 'The right options come to you instead of endless searching.' },
      { feature: 'Transparent pricing', benefit: 'See real costs up front and compare with confidence.' },
      { feature: 'Vetted partners', benefit: 'Work only with venues and vendors with a track record.' },
      { feature: 'One place', benefit: 'Discovery, quotes, booking, and payment in a single flow.' },
      { feature: 'Secure payments', benefit: 'Pay safely with a clear record from inquiry to final bill.' },
    ],
  },
  sponsor: {
    label: 'Sponsors',
    flow: [
      { icon: '1', title: 'Define your goals', desc: 'Audience, markets, and objectives.' },
      { icon: '2', title: 'See real sponsorship inventory', desc: 'Actual placements across live events.' },
      { icon: '3', title: 'Match to fitting events', desc: 'Aligned to your audience and budget.' },
      { icon: '4', title: 'Activate', desc: 'Placements confirmed and coordinated in-platform.' },
      { icon: '5', title: 'Measure ROI', desc: 'Outcomes tracked, not guessed.' },
    ],
    benefits: [
      { feature: 'Inventory visibility', benefit: 'See what is actually available instead of chasing decks.' },
      { feature: 'Fit-based matching', benefit: 'Spend where your audience actually is.' },
      { feature: 'Transparent placement', benefit: 'Clear terms and pricing on every opportunity.' },
      { feature: 'Measurable ROI', benefit: 'Track outcomes so budget follows what works.' },
      { feature: 'One pipeline', benefit: 'Discovery through activation in a single view.' },
    ],
  },
};

const CSS = `
.rv{background:var(--ivory)}
.rv-benefits{display:grid;grid-template-columns:1fr 1.4fr;gap:0;background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden;margin-top:36px}
.rv-benefits .rv-h{background:var(--emerald-deep);color:var(--champagne);font-size:11px;letter-spacing:.8px;text-transform:uppercase;font-weight:700;padding:14px 20px}
.rv-benefits .rv-f{font-weight:700;color:var(--emerald-deep);padding:16px 20px;border-top:1px solid var(--line);font-size:14.5px}
.rv-benefits .rv-b{color:var(--ink);padding:16px 20px;border-top:1px solid var(--line);font-size:14px;line-height:1.55}
@media(max-width:640px){.rv-benefits{grid-template-columns:1fr}.rv-benefits .rv-b{padding-top:0}}
`;

export default function RoleValue({ role, heading }: { role: RoleKey; heading?: string }) {
  const data = ROLE_CONTENT[role];
  if (!data) return null;
  return (
    <section className="rv">
      <style>{CSS}</style>
      <div className="wrap">
        <div className="kicker">How it works</div>
        <h2>{heading || `Divini Partners for ${data.label.toLowerCase()}`}</h2>
        <p className="sectsub">A clear path from first touch to booked, and exactly what you get at each step.</p>

        <FlowDiagram steps={data.flow} />

        <div className="rv-benefits" role="table" aria-label="Features and benefits">
          <div className="rv-h" role="columnheader">Feature</div>
          <div className="rv-h" role="columnheader">What it means for you</div>
          {data.benefits.map((b) => (
            <Fragment key={b.feature}>
              <div className="rv-f" role="cell">{b.feature}</div>
              <div className="rv-b" role="cell">{b.benefit}</div>
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
