import { Link } from 'react-router-dom';

export default function MarketplaceConduct() {
  return (
    <div style={wrap}>
      <Brand />
      <h1 style={h1}>Marketplace Conduct Policy</h1>
      <div style={eff}>Effective June 24, 2026</div>

      <p>
        This Marketplace Conduct Policy is part of the Divini Partners{' '}
        <Link to="/terms" style={a}>Terms of Service</Link> and sets the standards every user agrees
        to when using the Platform. Divini Partners is a neutral lead-generation and networking
        platform and is not a party to dealings between users; these standards exist to keep the
        marketplace safe and trustworthy.
      </p>

      <h2 style={h2}>Be honest and accurate</h2>
      <p>
        Provide truthful information about your identity, business, services, pricing, availability,
        credentials, licensing, and insurance. Do not impersonate others or misrepresent your
        qualifications or affiliations.
      </p>

      <h2 style={h2}>Operate lawfully and professionally</h2>
      <p>
        Comply with all applicable laws and hold the licenses, permits, and insurance your services
        require. Honor your own agreements with other users. Communicate professionally and do not
        harass, threaten, discriminate against, or abuse other users or staff.
      </p>

      <h2 style={h2}>Prohibited activity</h2>
      <ul>
        <li>Fraud, scams, money laundering, or any unlawful activity.</li>
        <li>Posting content that is infringing, defamatory, obscene, or harmful.</li>
        <li>Spam, deceptive solicitation, or misuse of other users' contact information.</li>
        <li>Circumventing the Platform to avoid applicable fees (see the <Link to="/non-circumvention" style={a}>Non-Circumvention Policy</Link>).</li>
        <li>Interfering with, scraping, or attempting to compromise the security of the Platform.</li>
      </ul>

      <h2 style={h2}>Reviews and reputation</h2>
      <p>
        Reviews must reflect genuine experiences. Do not post fake, incentivized, or retaliatory
        reviews, and do not manipulate ratings.
      </p>

      <h2 style={h2}>Reporting and enforcement</h2>
      <p>
        You can report a concern to <a href="mailto:support@divinipartners.com" style={a}>support@divinipartners.com</a>.
        We may, at our discretion and without obligation, investigate, remove content, or suspend or
        terminate accounts that violate this policy. We are not responsible for the conduct of users
        and disputes between users remain solely between them.
      </p>

      <Back />
    </div>
  );
}

const wrap: React.CSSProperties = { maxWidth: 820, margin: '0 auto', padding: '48px 24px 80px', lineHeight: 1.7, color: '#1c2b25' };
const h1: React.CSSProperties = { fontFamily: "'Cormorant Garamond', serif", fontSize: 36, color: '#1f3d31', marginBottom: 6 };
const eff: React.CSSProperties = { color: '#6b7a72', marginBottom: 28 };
const a: React.CSSProperties = { color: '#1f6f50' };
const h2: React.CSSProperties = { fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: '#1f3d31', marginTop: 30, marginBottom: 8 };
function Brand() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
      <img src="/brand/mark-emerald.png" alt="Divini Partners" style={{ width: 42, height: 42, objectFit: 'contain' }} />
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, color: '#1f3d31' }}>Divini Partners</div>
    </div>
  );
}
function Back() {
  return (
    <div style={{ marginTop: 40 }}>
      <Link to="/" style={a}>← Back to Divini Partners</Link>
    </div>
  );
}
