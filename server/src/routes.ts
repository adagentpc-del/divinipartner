/**
 * API router index. Mounts the foundation routes plus every domain router.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { ForbiddenError, NotFoundError } from "./db.js";

import foundation from "./routes/foundation.js";
// Native email/password auth (replaces Authentik OIDC)
import authNative from "./routes/auth-native.js";
// Phase 2
import profiles from "./routes/profiles.js";
// Profile decks (pitch decks / collateral) + custom programs / offerings
import profileDecksPrograms from "./routes/profile-decks-programs.js";
// Phase 3
import events from "./routes/events.js";
import bids from "./routes/bids.js";
import quotes from "./routes/quotes.js";
import messages from "./routes/messages.js";
// Phase 4
import inventory from "./routes/inventory.js";
import packages from "./routes/packages.js";
import autoquote from "./routes/autoquote.js";
// Phase 5
import invoices from "./routes/invoices.js";
import payments from "./routes/payments.js";
import contracts from "./routes/contracts.js";
import changeorders from "./routes/changeorders.js";
// Phase 6
import guests from "./routes/guests.js";
import seating from "./routes/seating.js";
import itinerary from "./routes/itinerary.js";
import tasks from "./routes/tasks.js";
// Phase 7
import reviews from "./routes/reviews.js";
import intelligence from "./routes/intelligence.js";
import templates from "./routes/templates.js";
import starred from "./routes/starred.js";
// Phase 8
import admin from "./routes/admin.js";
import support from "./routes/support.js";
import feedback from "./routes/feedback.js";
import disputes from "./routes/disputes.js";
import compliance from "./routes/compliance.js";
import marketplace from "./routes/marketplace.js";
import reports from "./routes/reports.js";
// Claim engine
import claim from "./routes/claim.js";
// Seat billing + background worker trigger
import seats from "./routes/seats.js";
import worker from "./routes/worker.js";
// Vendor network invites
import invites from "./routes/invites.js";
// Visitor signals (fingerprint/IP logging) + landing personalization
import signals from "./routes/signals.js";
import personalize from "./routes/personalize.js";
// Native e-sign + self-hosted email open/click tracking
import signatures from "./routes/signatures.js";
import emailTrack from "./routes/email-track.js";
// Admin email-test harness
import testEmail from "./routes/test-email.js";
// Venue Intelligence addendum (Phase 1 foundation)
import venueTwin from "./routes/venue-twin.js";
import brandingOpportunities from "./routes/branding-opportunities.js";
import venueRestrictions from "./routes/venue-restrictions.js";
// Venue Intelligence addendum (Phases 2-7)
import vendorRequirements from "./routes/vendor-requirements.js";
import vendorPricing from "./routes/vendor-pricing.js";
import quoteDrafts from "./routes/quote-drafts.js";
import vendorReadiness from "./routes/vendor-readiness.js";
import preferredVendors from "./routes/preferred-vendors.js";
import revenueInventory from "./routes/revenue-inventory.js";
import sponsorships from "./routes/sponsorships.js";
import vendorEventRequirements from "./routes/vendor-event-requirements.js";
import recommend from "./routes/recommend.js";
// Friction Elimination addendum
import eventAssistant from "./routes/event-assistant.js";
import eventReadiness from "./routes/event-readiness.js";
import venueCompare from "./routes/venue-compare.js";
import leads from "./routes/leads.js";
import vendorCompliance from "./routes/vendor-compliance.js";
import installations from "./routes/installations.js";
import guestHub from "./routes/guest-hub.js";
import sponsorshipIntel from "./routes/sponsorship-intel.js";
// Intelligence Moat addendum
import eventMemory from "./routes/event-memory.js";
import playbooks from "./routes/playbooks.js";
import eventWarRoom from "./routes/event-war-room.js";
import revenueLeakage from "./routes/revenue-leakage.js";
import opportunities from "./routes/opportunities.js";
import relationship from "./routes/relationship.js";
import partnershipMatch from "./routes/partnership-match.js";
import diviniScore from "./routes/divini-score.js";
import scoreRefresh from "./routes/score-refresh.js";
import approvalGraph from "./routes/approval-graph.js";
import foundingMember from "./routes/founding-member.js";
import attendeeIntel from "./routes/attendee-intel.js";
// AI COO V2 layer
import coo from "./routes/coo.js";
import revenueIntel from "./routes/revenue-intel.js";
import businessHealth from "./routes/business-health.js";
import eventRisk from "./routes/event-risk.js";
import pricingIntel from "./routes/pricing-intel.js";
import marketplaceIntel from "./routes/marketplace-intel.js";
import commandCenter from "./routes/command-center.js";
// Phase 1 platform upgrade: Vendor Teams (WS-A) + Nonprofit core (WS-B) + Sponsor portal (WS-C)
import vendorTeam from "./routes/vendor-team.js";
import accountAssignments from "./routes/account-assignments.js";
import intakeRouting from "./routes/intake-routing.js";
import quoteApprovals from "./routes/quote-approvals.js";
import fundraisingEvents from "./routes/fundraising-events.js";
import sponsorshipPackages from "./routes/sponsorship-packages.js";
import ticketPackages from "./routes/ticket-packages.js";
import nonprofitDashboard from "./routes/nonprofit-dashboard.js";
import sponsorPortal from "./routes/sponsor-portal.js";
import sponsorPurchases from "./routes/sponsor-purchases.js";
// Phase 2/3 nonprofit + vendor upgrade (auction, volunteer, donor, recap + AI assists)
import auction from "./routes/auction.js";
import volunteer from "./routes/volunteer.js";
import donations from "./routes/donations.js";
import followups from "./routes/followups.js";
import recap from "./routes/recap.js";
import sponsorMatch from "./routes/sponsor-match.js";
import donorProspect from "./routes/donor-prospect.js";
import quoteAssist from "./routes/quote-assist.js";
import vendorScorecard from "./routes/vendor-scorecard.js";
// Fee transparency (Module 3) + Anti-circumvention (Module 4)
import fees from "./routes/fees.js";
import introductions from "./routes/introductions.js";
// Partner revenue share, payouts, referrals/credits, audit, compliance, revenue center
import partners from "./routes/partners.js";
import partnerPortal from "./routes/partner-portal.js";
import partnerOnboarding from "./routes/partner-onboarding.js";
import payouts from "./routes/payouts.js";
import referrals from "./routes/referrals.js";
import credits from "./routes/credits.js";
import auditLog from "./routes/audit-log.js";
import compliancePrivacy from "./routes/compliance-privacy.js";
import revenueCenter from "./routes/revenue-center.js";
import platformRevenue from "./routes/platform-revenue.js";
import featuredRouter from "./routes/featured.js";
import venueMetricsRouter from "./routes/venue-metrics.js";
import vendorMetricsRouter from "./routes/vendor-metrics.js";
// Stripe Connect split-payout rail (1-click admin release). Complementary to
// the per-period commission ledger at /payouts; owns its own connect_accounts
// + payout_instructions tables.
import connectPayouts from "./routes/connect-payouts.js";
import adminManage from "./routes/admin-manage.js";
import campaigns from "./routes/campaigns.js";

const router = Router();

router.use("/auth", authNative);
router.use("/", foundation);
router.use("/profile", profiles);
router.use("/profile-extras", profileDecksPrograms);
router.use("/events", events);
router.use("/bids", bids);
router.use("/quotes", quotes);
router.use("/messages", messages);
router.use("/inventory", inventory);
router.use("/packages", packages);
router.use("/autoquote", autoquote);
router.use("/invoices", invoices);
router.use("/payments", payments);
router.use("/contract-pricing", contracts);
router.use("/change-orders", changeorders);
router.use("/guests", guests);
router.use("/seating", seating);
router.use("/itinerary", itinerary);
router.use("/tasks", tasks);
router.use("/reviews", reviews);
router.use("/intelligence", intelligence);
router.use("/templates", templates);
router.use("/starred", starred);
router.use("/admin", admin);
router.use("/support", support);
router.use("/feedback", feedback);
router.use("/disputes", disputes);
router.use("/compliance", compliance);
router.use("/marketplace", marketplace);
router.use("/reports", reports);
router.use("/claim", claim);
router.use("/seats", seats);
router.use("/worker", worker);
router.use("/invites", invites);
router.use("/signals", signals);
router.use("/personalize", personalize);
router.use("/signatures", signatures);
router.use("/e", emailTrack);
router.use("/admin/test-email", testEmail);
router.use("/venue-twin", venueTwin);
router.use("/branding-opportunities", brandingOpportunities);
router.use("/venue-restrictions", venueRestrictions);
router.use("/vendor-requirements", vendorRequirements);
router.use("/vendor-pricing", vendorPricing);
router.use("/quote-drafts", quoteDrafts);
router.use("/vendor-readiness", vendorReadiness);
router.use("/preferred-vendors", preferredVendors);
router.use("/revenue-inventory", revenueInventory);
router.use("/sponsorships", sponsorships);
router.use("/vendor-event-requirements", vendorEventRequirements);
router.use("/recommend", recommend);
router.use("/event-assistant", eventAssistant);
router.use("/event-readiness", eventReadiness);
router.use("/venue-compare", venueCompare);
router.use("/leads", leads);
router.use("/vendor-compliance", vendorCompliance);
router.use("/installations", installations);
router.use("/guest-hub", guestHub);
router.use("/sponsorship-intel", sponsorshipIntel);
router.use("/event-memory", eventMemory);
router.use("/playbooks", playbooks);
router.use("/event-war-room", eventWarRoom);
router.use("/revenue-leakage", revenueLeakage);
router.use("/opportunities", opportunities);
router.use("/relationship", relationship);
router.use("/partnership-match", partnershipMatch);
router.use("/divini-score", diviniScore);
router.use("/scores", scoreRefresh);
router.use("/approval-graph", approvalGraph);
router.use("/founding-member", foundingMember);
router.use("/attendee-intel", attendeeIntel);
// AI COO V2 layer
router.use("/coo", coo);
router.use("/revenue-intel", revenueIntel);
router.use("/business-health", businessHealth);
router.use("/event-risk", eventRisk);
router.use("/pricing-intel", pricingIntel);
router.use("/marketplace-intel", marketplaceIntel);
router.use("/command-center", commandCenter);
// Phase 1 platform upgrade
router.use("/vendor-team", vendorTeam);
router.use("/account-assignments", accountAssignments);
router.use("/intake-routing", intakeRouting);
router.use("/quote-approvals", quoteApprovals);
router.use("/fundraising-events", fundraisingEvents);
router.use("/sponsorship-packages", sponsorshipPackages);
router.use("/ticket-packages", ticketPackages);
router.use("/nonprofit-dashboard", nonprofitDashboard);
router.use("/sponsor-portal", sponsorPortal);
router.use("/sponsor-purchases", sponsorPurchases);
// Phase 2/3 nonprofit + vendor upgrade
router.use("/auction", auction);
router.use("/volunteer", volunteer);
router.use("/donations", donations);
router.use("/followups", followups);
router.use("/recap", recap);
router.use("/sponsor-match", sponsorMatch);
router.use("/donor-prospect", donorProspect);
router.use("/quote-assist", quoteAssist);
router.use("/vendor-scorecard", vendorScorecard);
// Fee transparency (Module 3) + Anti-circumvention (Module 4)
router.use("/fees", fees);
router.use("/introductions", introductions);
router.use("/partners", partners);
router.use("/partner-portal", partnerPortal);
router.use("/partner-onboarding", partnerOnboarding);
router.use("/payouts", payouts);
router.use("/referrals", referrals);
router.use("/credits", credits);
router.use("/audit-log", auditLog);
router.use("/compliance-privacy", compliancePrivacy);
router.use("/revenue-center", revenueCenter);
router.use("/platform-revenue", platformRevenue);
router.use("/featured", featuredRouter);
router.use("/venue-metrics", venueMetricsRouter);
router.use("/vendor-metrics", vendorMetricsRouter);
router.use("/connect-payouts", connectPayouts);
router.use("/admin/manage", adminManage);
router.use("/admin/campaigns", campaigns);

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message });
  if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
  // eslint-disable-next-line no-console
  console.error("[api error]", err?.message || err);
  res.status(500).json({ error: "internal error" });
}

export default router;
