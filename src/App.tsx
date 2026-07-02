import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';

// public marketing
import Landing from './pages/Landing';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Cookies from './pages/Cookies';
import CookieBanner from './components/CookieBanner';
import PaymentPolicy from './pages/PaymentPolicy';
import MarketplaceConduct from './pages/MarketplaceConduct';
import NonCircumvention from './pages/NonCircumvention';
import Register from './pages/Register';
import GetStarted from './pages/GetStarted';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import ForVenues from './pages/public/ForVenues';
import ForVendors from './pages/public/ForVendors';
import ForPlanners from './pages/public/ForPlanners';
import ForSponsors from './pages/public/ForSponsors';
import ForClients from './pages/public/ForClients';
import DemoPage from './pages/public/DemoPage';
import Marketplace from './pages/public/Marketplace';
import HowItWorks from './pages/public/HowItWorks';
import Pricing from './pages/public/Pricing';
import DiscoverHub from './pages/public/DiscoverHub';
import CategoryLanding from './pages/public/CategoryLanding';

// dashboards
import SuperAdminDashboard from './pages/dashboards/SuperAdminDashboard';
import VenueDashboard from './pages/dashboards/VenueDashboard';
import VendorDashboard from './pages/dashboards/VendorDashboard';
import ClientDashboard from './pages/dashboards/ClientDashboard';
import PlannerDashboard from './pages/dashboards/PlannerDashboard';
import InstallerDashboard from './pages/dashboards/InstallerDashboard';
// Phase 1 platform upgrade dashboards
import NonprofitDashboard from './pages/dashboards/NonprofitDashboard';
import SponsorDashboard from './pages/dashboards/SponsorDashboard';

// onboarding + profiles (Phase 2)
import Onboarding from './pages/onboarding/Onboarding';
import ProfileEditor from './pages/profile/ProfileEditor';
import ProfileDecksPrograms from './pages/profile/ProfileDecksPrograms';
import PublicProfile from './pages/profile/PublicProfile';

// events / bids / quotes (Phase 3)
import EventsList from './pages/events/EventsList';
import EventWorkspace from './pages/event/EventWorkspace';
import EventDayMode from './pages/event/EventDayMode';
import BidBoard from './pages/bids/BidBoard';

// inventory / auto-quote (Phase 4)
import InventoryManager from './pages/inventory/InventoryManager';
import InventorySearch from './pages/inventory/InventorySearch';
import PricingMemory from './pages/pricing-memory/PricingMemory';
import PackageBuilder from './pages/packages/PackageBuilder';
import AutoQuoteDraft from './pages/quotes/AutoQuoteDraft';

// invoices / payments (Phase 5)
import InvoiceList from './pages/invoices/InvoiceList';
import InvoiceDetail from './pages/invoices/InvoiceDetail';
import PaymentsDashboard from './pages/payments/PaymentsDashboard';
import PayReturn from './pages/payments/PayReturn';
import PayoutSettings from './pages/payments/PayoutSettings';
import ContractPricing from './pages/contracts/ContractPricing';
import SeatSettings from './pages/account/SeatSettings';
import ChangeOrders from './pages/changeorders/ChangeOrders';

// reviews / intelligence / templates (Phase 7)
import Reviews from './pages/reviews/Reviews';
import EventTemplates from './pages/templates/EventTemplates';
import EventScopeBuilder from './pages/intelligence/EventScopeBuilder';
import Recommendations from './pages/intelligence/Recommendations';

// admin / support / etc (Phase 8)
import AdminIntelligence from './pages/admin/AdminIntelligence';
import AdminAccounts from './pages/admin/AdminAccounts';
import WhiteLabelAdmin from './pages/admin/WhiteLabelAdmin';
import AuditLog from './pages/admin/AuditLog';
import WinLoss from './pages/admin/WinLoss';
import VisitorSignals from './pages/admin/VisitorSignals';
import SupportCenter from './pages/support/SupportCenter';
import Disputes from './pages/disputes/Disputes';
import Compliance from './pages/compliance/Compliance';
import MarketplaceSearch from './pages/marketplace/MarketplaceSearch';
import Reports from './pages/reports/Reports';

// top-level pages reachable from nav
import Projects from './pages/Projects';
import SearchBids from './pages/SearchBids';
import AdminConsole from './pages/AdminConsole';
import AdminFeatures from './pages/AdminFeatures';
import VendorReadiness from './pages/VendorReadiness';

// vendor network + invites
import VendorNetwork from './pages/network/VendorNetwork';
import JoinInvite from './pages/join/JoinInvite';
import SignDocument from './pages/sign/SignDocument';

// claim engine
import UnclaimedProfile from './pages/claim/UnclaimedProfile';
import ClaimVerify from './pages/claim/ClaimVerify';
import ClaimEngineAdmin from './pages/admin/ClaimEngineAdmin';
import AdminCircumvention from './pages/AdminCircumvention';

// Partner revenue share, payouts, referrals/credits, audit, compliance, revenue center
import AdminPartners from './pages/AdminPartners';
import PartnerPortal from './pages/PartnerPortal';
import PartnerOnboarding from './pages/PartnerOnboarding';
import AdminPayouts from './pages/AdminPayouts';
import ReferralDashboard from './pages/ReferralDashboard';
import AuditViewer from './pages/AuditViewer';
import ComplianceCenter from './pages/ComplianceCenter';
import RevenueCenter from './pages/RevenueCenter';
// Stripe Connect split-payout rail (recipient onboarding + my payouts + admin release queue)
import ConnectPayoutSettings from './pages/ConnectPayoutSettings';
import MyConnectPayouts from './pages/MyConnectPayouts';
import AdminConnectPayouts from './pages/AdminConnectPayouts';
import AdminManageVenues from './pages/admin/AdminManageVenues';
import AdminManageVendors from './pages/admin/AdminManageVendors';
import AdminManageEvents from './pages/admin/AdminManageEvents';
import AdminCampaigns from './pages/admin/AdminCampaigns';
import AdminClaimProfiles from './pages/admin/AdminClaimProfiles';
import AdminAgreements from './pages/admin/AdminAgreements';
import DiviniExclusivePartners from './pages/admin/DiviniExclusivePartners';
import AdminManageClients from './pages/admin/AdminManageClients';

// Venue Intelligence addendum (Phase 1 foundation)
import VenueTwinEditor from './pages/VenueTwinEditor';
// Venue Intelligence addendum (Phases 2-7)
import VendorRequirementBuilder from './pages/VendorRequirementBuilder';
import VendorPricingRules from './pages/VendorPricingRules';
import QuoteDraftReview from './pages/QuoteDraftReview';
import PreferredVendors from './pages/PreferredVendors';
import RevenueInventory from './pages/RevenueInventory';
import SponsorshipMarketplace from './pages/SponsorshipMarketplace';
import EventGuestManager from './pages/event/EventGuestManager';
import EventRecommendations from './pages/Recommendations';

// Friction Elimination addendum
import EventAssistant from './pages/EventAssistant';
import VenueComparison from './pages/VenueComparison';
import LeadInbox from './pages/LeadInbox';
import VendorCompliancePanel from './pages/VendorCompliancePanel';
import InstallationTimeline from './pages/InstallationTimeline';
import GuestExperienceHub from './pages/GuestExperienceHub';
import SponsorshipIntel from './pages/SponsorshipIntel';

// Intelligence Moat addendum
import EventMemoryInsights from './pages/EventMemoryInsights';
import PostEventFeedback from './pages/PostEventFeedback';
import PlaybookLibrary from './pages/PlaybookLibrary';
import EventWarRoom from './pages/EventWarRoom';
import RevenueDashboard from './pages/RevenueDashboard';
import OpportunityFeed from './pages/OpportunityFeed';
import RelationshipGraph from './pages/RelationshipGraph';
import PartnershipMatches from './pages/PartnershipMatches';
import DiviniScores from './pages/DiviniScores';
import ApprovalGraph from './pages/ApprovalGraph';
import FoundingMemberCenter from './pages/FoundingMemberCenter';
import AttendeeIntelligence from './pages/AttendeeIntelligence';

// AI COO V2 layer
import CooDashboard from './pages/CooDashboard';
import DailyBriefing from './pages/DailyBriefing';
import RevenueIntelligence from './pages/RevenueIntelligence';
import Forecasting from './pages/Forecasting';
import BusinessHealth from './pages/BusinessHealth';
import PricingIntelligence from './pages/PricingIntelligence';
import MarketplaceIntelligence from './pages/MarketplaceIntelligence';
import CommandCenter from './pages/CommandCenter';

// Phase 1 platform upgrade: Vendor Teams (WS-A) + Nonprofit core (WS-B) + Sponsor portal (WS-C)
import VendorTeam from './pages/VendorTeam';
import AccountAssignments from './pages/AccountAssignments';
import QuoteApprovals from './pages/QuoteApprovals';
import FundraisingEventBuilder from './pages/FundraisingEventBuilder';
import SponsorshipPackages from './pages/SponsorshipPackages';
import TicketTableManager from './pages/TicketTableManager';
import SponsorPortal from './pages/SponsorPortal';

// Phase 2/3 nonprofit + vendor upgrade
import AuctionManager from './pages/AuctionManager';
import VolunteerManager from './pages/VolunteerManager';
import DonorManager from './pages/DonorManager';
import PostEventRecap from './pages/PostEventRecap';
import SponsorMatching from './pages/SponsorMatching';
import DonorProspecting from './pages/DonorProspecting';
import VendorScorecards from './pages/VendorScorecards';

function Loading() {
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#7d776c' }}>Loading…</div>;
}

// EventWarRoom takes an eventId prop; this wrapper supplies it from the route.
function EventWarRoomRoute() {
  const { eventId = '' } = useParams();
  return <EventWarRoom eventId={eventId} />;
}

// Public referral landing: /r/:code. Anonymous visitors cannot call the
// auth-gated /referrals API, so we just persist the referral code (localStorage
// survives the OIDC redirect round-trip) and forward to registration. The
// authenticated user's first session then attributes the referral server-side.
function ReferralLanding() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  useEffect(() => {
    try {
      if (code) localStorage.setItem('divini_ref', code);
    } catch {
      /* storage may be unavailable; the query param still carries the code */
    }
    navigate(`/register?ref=${encodeURIComponent(code)}`, { replace: true });
  }, [code, navigate]);
  return <Loading />;
}

// Require a signed-in session for app pages.
function Authed({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

// Picks the right dashboard for the signed-in account.
function AppHome() {
  const { session, company, isAdmin, loading } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  if (isAdmin) return <SuperAdminDashboard />;
  if (!company) return <Navigate to="/get-started" replace />;
  switch (company.kind) {
    case 'venue': return <VenueDashboard />;
    case 'vendor':
    case 'supplier': return <VendorDashboard />;
    case 'planner': return <PlannerDashboard />;
    case 'installer': return <InstallerDashboard />;
    case 'client': return <ClientDashboard />;
    // Phase 1 platform upgrade: dedicated nonprofit + sponsor dashboards.
    case 'nonprofit': return <NonprofitDashboard />;
    case 'sponsor': return <SponsorDashboard />;
    // Donor / volunteer are new roles without a dedicated dashboard yet; route
    // them to the generic client-style dashboard so they do not crash.
    case 'donor':
    case 'volunteer': return <ClientDashboard />;
    // Exhibitor / viewer roles have no dedicated dashboard; route them to a
    // sensible existing one so they never crash on an unknown kind.
    case 'exhibitor': return <SponsorDashboard />;
    case 'viewer': return <ClientDashboard />;
    default: return <ClientDashboard />;
  }
}

function Routed() {
  const { session, company, isAdmin, loading } = useAuth();
  if (loading) return <Loading />;
  return (
    <Routes>
      {/* public marketing */}
      <Route path="/" element={<Landing />} />
      <Route path="/for-venues" element={<ForVenues />} />
      <Route path="/for-vendors" element={<ForVendors />} />
      <Route path="/for-planners" element={<ForPlanners />} />
      <Route path="/for-sponsors" element={<ForSponsors />} />
      <Route path="/for-clients" element={<ForClients />} />
      <Route path="/demo" element={<DemoPage />} />
      <Route path="/marketplace" element={<Marketplace />} />
      <Route path="/how-it-works" element={<HowItWorks />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/cookies" element={<Cookies />} />
      <Route path="/payment-policy" element={<PaymentPolicy />} />
      <Route path="/marketplace-conduct" element={<MarketplaceConduct />} />
      <Route path="/non-circumvention" element={<NonCircumvention />} />

      {/* SEO discovery landing pages */}
      <Route path="/discover" element={<DiscoverHub />} />
      <Route path="/discover/:type/:slug" element={<CategoryLanding />} />

      {/* public co-branded partner profiles */}
      <Route path="/venues/:slug" element={<PublicProfile />} />
      <Route path="/vendors/:slug" element={<PublicProfile />} />
      <Route path="/planners/:slug" element={<PublicProfile />} />
      <Route path="/suppliers/:slug" element={<PublicProfile />} />

      {/* public invite landing */}
      <Route path="/join/:token" element={<JoinInvite />} />

      {/* public claim engine */}
      <Route path="/claim/:slug" element={<UnclaimedProfile />} />
      <Route path="/claim/:slug/verify" element={<ClaimVerify />} />

      {/* auth (native email/password) */}
      <Route path="/login" element={session ? <Navigate to="/app" replace /> : <Login />} />
      <Route path="/register" element={session ? <Navigate to="/app" replace /> : <Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/forgot" element={session ? <Navigate to="/app" replace /> : <ForgotPassword />} />
      <Route path="/reset" element={<ResetPassword />} />
      {/* retired OIDC callback: redirects to /login */}
      <Route path="/auth/callback" element={<AuthCallback />} />
      {/* org setup for a verified, signed-in user without an account yet */}
      <Route path="/get-started" element={!session ? <Navigate to="/login" replace /> : (company || isAdmin) ? <Navigate to="/app" replace /> : <GetStarted />} />

      {/* app home -> role dashboard */}
      <Route path="/app" element={<AppHome />} />

      {/* onboarding + profile */}
      <Route path="/onboarding" element={<Authed><Onboarding /></Authed>} />
      <Route path="/profile" element={<Authed><ProfileEditor /></Authed>} />
      <Route path="/profile/decks-programs" element={<Authed><ProfileDecksPrograms /></Authed>} />

      {/* vendor network + invite center */}
      <Route path="/network" element={<Authed><VendorNetwork /></Authed>} />
      <Route path="/sign/:type" element={<Authed><SignDocument /></Authed>} />

      {/* events / bids / quotes */}
      <Route path="/events" element={<Authed><EventsList /></Authed>} />
      <Route path="/events/:id" element={<Authed><EventWorkspace /></Authed>} />
      <Route path="/events/:id/day" element={<Authed><EventDayMode /></Authed>} />
      <Route path="/bids" element={<Authed><BidBoard /></Authed>} />
      <Route path="/quotes/auto/:bidId" element={<Authed><AutoQuoteDraft /></Authed>} />
      <Route path="/projects" element={<Authed><Projects /></Authed>} />
      <Route path="/search-bids" element={<Authed><SearchBids /></Authed>} />
      <Route path="/vendor-readiness-score" element={<Authed><VendorReadiness /></Authed>} />

      {/* inventory / packages / pricing memory */}
      <Route path="/inventory" element={<Authed><InventoryManager /></Authed>} />
      <Route path="/inventory/browse" element={<Authed><InventorySearch /></Authed>} />
      <Route path="/pricing-memory" element={<Authed><PricingMemory /></Authed>} />
      <Route path="/packages" element={<Authed><PackageBuilder /></Authed>} />

      {/* invoices / payments / contracts / change orders */}
      <Route path="/invoices" element={<Authed><InvoiceList /></Authed>} />
      <Route path="/invoices/:id" element={<Authed><InvoiceDetail /></Authed>} />
      <Route path="/payments" element={<Authed><PaymentsDashboard /></Authed>} />
      <Route path="/pay/return" element={<Authed><PayReturn /></Authed>} />
      <Route path="/payouts/setup" element={<Authed><PayoutSettings /></Authed>} />
      <Route path="/account/seats" element={<Authed><SeatSettings /></Authed>} />
      <Route path="/contract-pricing" element={<Authed><ContractPricing /></Authed>} />
      <Route path="/change-orders" element={<Authed><ChangeOrders /></Authed>} />

      {/* reviews / intelligence / templates */}
      <Route path="/reviews" element={<Authed><Reviews /></Authed>} />
      <Route path="/templates" element={<Authed><EventTemplates /></Authed>} />
      <Route path="/scope-builder" element={<Authed><EventScopeBuilder /></Authed>} />
      <Route path="/recommendations" element={<Authed><Recommendations /></Authed>} />

      {/* venue intelligence + quote automation + revenue */}
      <Route path="/venue-twin" element={<Authed><VenueTwinEditor /></Authed>} />
      <Route path="/vendor-requirements" element={<Authed><VendorRequirementBuilder /></Authed>} />
      <Route path="/vendor-pricing" element={<Authed><VendorPricingRules /></Authed>} />
      <Route path="/quote-drafts" element={<Authed><QuoteDraftReview /></Authed>} />
      <Route path="/quote-drafts/:id" element={<Authed><QuoteDraftReview /></Authed>} />
      <Route path="/preferred-vendors" element={<Authed><PreferredVendors /></Authed>} />
      <Route path="/revenue-inventory" element={<Authed><RevenueInventory /></Authed>} />
      <Route path="/sponsorships" element={<Authed><SponsorshipMarketplace /></Authed>} />
      <Route path="/events/:id/guests" element={<Authed><EventGuestManager /></Authed>} />
      <Route path="/event-recommendations" element={<Authed><EventRecommendations /></Authed>} />

      {/* friction elimination addendum */}
      <Route path="/event-assistant" element={<Authed><EventAssistant /></Authed>} />
      <Route path="/venue-comparison" element={<Authed><VenueComparison /></Authed>} />
      <Route path="/leads" element={<Authed><LeadInbox /></Authed>} />
      <Route path="/vendor-compliance" element={<Authed><VendorCompliancePanel /></Authed>} />
      <Route path="/installations" element={<Authed><InstallationTimeline /></Authed>} />
      <Route path="/guest-hub" element={<Authed><GuestExperienceHub /></Authed>} />
      <Route path="/sponsorship-intel" element={<Authed><SponsorshipIntel /></Authed>} />

      {/* intelligence moat addendum */}
      <Route path="/event-memory" element={<Authed><EventMemoryInsights /></Authed>} />
      <Route path="/post-event-feedback" element={<Authed><PostEventFeedback /></Authed>} />
      <Route path="/playbooks" element={<Authed><PlaybookLibrary /></Authed>} />
      <Route path="/event-war-room" element={<Authed><EventWarRoomRoute /></Authed>} />
      <Route path="/event-war-room/:eventId" element={<Authed><EventWarRoomRoute /></Authed>} />
      <Route path="/revenue-dashboard" element={<Authed><RevenueDashboard /></Authed>} />
      <Route path="/opportunities" element={<Authed><OpportunityFeed /></Authed>} />
      <Route path="/relationship-graph" element={<Authed><RelationshipGraph /></Authed>} />
      <Route path="/partnership-matches" element={<Authed><PartnershipMatches /></Authed>} />
      <Route path="/divini-scores" element={<Authed><DiviniScores /></Authed>} />
      <Route path="/approval-graph" element={<Authed><ApprovalGraph /></Authed>} />
      <Route path="/founding-member" element={<Authed><FoundingMemberCenter /></Authed>} />
      <Route path="/attendee-intelligence" element={<Authed><AttendeeIntelligence /></Authed>} />

      {/* AI COO V2 layer */}
      <Route path="/coo" element={<Authed><CooDashboard /></Authed>} />
      <Route path="/daily-briefing" element={<Authed><DailyBriefing /></Authed>} />
      <Route path="/revenue-intelligence" element={<Authed><RevenueIntelligence /></Authed>} />
      <Route path="/forecasting" element={<Authed><Forecasting /></Authed>} />
      <Route path="/business-health" element={<Authed><BusinessHealth /></Authed>} />
      <Route path="/pricing-intelligence" element={<Authed><PricingIntelligence /></Authed>} />
      <Route path="/marketplace-intelligence" element={<Authed><MarketplaceIntelligence /></Authed>} />
      <Route path="/command-center" element={<Authed><CommandCenter /></Authed>} />

      {/* Phase 1 platform upgrade: vendor teams + nonprofit core + sponsor portal */}
      <Route path="/vendor/team" element={<Authed><VendorTeam /></Authed>} />
      <Route path="/vendor/accounts" element={<Authed><AccountAssignments /></Authed>} />
      <Route path="/vendor/quote-approvals" element={<Authed><QuoteApprovals /></Authed>} />
      <Route path="/fundraising-builder" element={<Authed><FundraisingEventBuilder /></Authed>} />
      <Route path="/sponsorship-packages" element={<Authed><SponsorshipPackages /></Authed>} />
      <Route path="/ticket-table" element={<Authed><TicketTableManager /></Authed>} />
      <Route path="/sponsor-portal" element={<Authed><SponsorPortal /></Authed>} />

      {/* Phase 2/3 nonprofit + vendor upgrade */}
      <Route path="/auction-manager" element={<Authed><AuctionManager /></Authed>} />
      <Route path="/volunteer-manager" element={<Authed><VolunteerManager /></Authed>} />
      <Route path="/donor-manager" element={<Authed><DonorManager /></Authed>} />
      <Route path="/post-event-recap" element={<Authed><PostEventRecap /></Authed>} />
      <Route path="/sponsor-matching" element={<Authed><SponsorMatching /></Authed>} />
      <Route path="/donor-prospecting" element={<Authed><DonorProspecting /></Authed>} />
      <Route path="/vendor-scorecards" element={<Authed><VendorScorecards /></Authed>} />

      {/* support / disputes / compliance / marketplace / reports */}
      <Route path="/support" element={<Authed><SupportCenter /></Authed>} />
      <Route path="/disputes" element={<Authed><Disputes /></Authed>} />
      <Route path="/compliance" element={<Authed><Compliance /></Authed>} />
      <Route path="/marketplace/search" element={<Authed><MarketplaceSearch /></Authed>} />
      <Route path="/reports" element={<Authed><Reports /></Authed>} />

      {/* admin (pages self-guard on isAdmin) */}
      <Route path="/admin" element={<Authed><AdminConsole /></Authed>} />
      <Route path="/admin/features" element={<Authed><AdminFeatures /></Authed>} />
      <Route path="/admin/intelligence" element={<Authed><AdminIntelligence /></Authed>} />
      <Route path="/admin/accounts" element={<Authed><AdminAccounts /></Authed>} />
      <Route path="/admin/white-label" element={<Authed><WhiteLabelAdmin /></Authed>} />
      <Route path="/admin/audit" element={<Authed><AuditLog /></Authed>} />
      <Route path="/admin/win-loss" element={<Authed><WinLoss /></Authed>} />
      <Route path="/admin/signals" element={<Authed><VisitorSignals /></Authed>} />
      <Route path="/admin/claim-engine" element={<Authed><ClaimEngineAdmin /></Authed>} />
      <Route path="/admin/circumvention" element={<Authed><AdminCircumvention /></Authed>} />

      {/* Partner revenue share, payouts, referrals/credits, audit, compliance, revenue center */}
      <Route path="/admin/partners" element={<Authed><AdminPartners /></Authed>} />
      <Route path="/admin/payouts" element={<Authed><AdminPayouts /></Authed>} />
      {/* Stripe Connect split-payout rail (1-click admin release). Self-guards on isAdmin. */}
      <Route path="/admin/connect-payouts" element={<Authed><AdminConnectPayouts /></Authed>} />
      <Route path="/admin/revenue-center" element={<Authed><RevenueCenter /></Authed>} />
      <Route path="/admin/audit-log" element={<Authed><AuditViewer /></Authed>} />
      <Route path="/admin/compliance" element={<Authed><ComplianceCenter /></Authed>} />
      <Route path="/admin/venues" element={<Authed><AdminManageVenues /></Authed>} />
      <Route path="/admin/vendors" element={<Authed><AdminManageVendors /></Authed>} />
      <Route path="/admin/events" element={<Authed><AdminManageEvents /></Authed>} />
      <Route path="/admin/campaigns" element={<Authed><AdminCampaigns /></Authed>} />
      <Route path="/admin/claim-profiles" element={<Authed><AdminClaimProfiles /></Authed>} />
      <Route path="/admin/agreements" element={<Authed><AdminAgreements /></Authed>} />
      <Route path="/admin/exclusive-partners" element={<Authed><DiviniExclusivePartners /></Authed>} />
      <Route path="/admin/clients" element={<Authed><AdminManageClients /></Authed>} />
      <Route path="/partner-portal" element={<Authed><PartnerPortal /></Authed>} />
      {/* Stripe Connect split-payout rail: recipient bank onboarding + my payouts */}
      <Route path="/connect-payouts/settings" element={<Authed><ConnectPayoutSettings /></Authed>} />
      <Route path="/connect-payouts/mine" element={<Authed><MyConnectPayouts /></Authed>} />
      <Route path="/referral-dashboard" element={<Authed><ReferralDashboard /></Authed>} />
      {/* Public-ish: gated by the unguessable onboarding code in the URL. */}
      <Route path="/partner-onboarding/:code" element={<PartnerOnboarding />} />
      {/* Public referral landing - records the code then forwards to register. */}
      <Route path="/r/:code" element={<ReferralLanding />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routed />
        <CookieBanner />
      </BrowserRouter>
    </AuthProvider>
  );
}
