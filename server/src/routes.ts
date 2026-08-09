/**
 * API router index. Mounts the foundation routes plus every domain router.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { ForbiddenError, NotFoundError, AccountDeletedError } from "./db.js";
import { logger } from "./lib/logger.js";
import { getAuth } from "./auth.js";

import foundation from "./routes/foundation.js";
// Native email/password auth (replaces Authentik OIDC)
import authNative from "./routes/auth-native.js";
import mfa from "./routes/mfa.js";
// Phase 2
import profiles from "./routes/profiles.js";
// Profile decks (pitch decks / collateral) + custom programs / offerings
import profileDecksPrograms from "./routes/profile-decks-programs.js";
// Phase 3
import events from "./routes/events.js";
import calendar from "./routes/calendar.js";
import bids from "./routes/bids.js";
import bidShares from "./routes/bid-shares.js";
import publicBids from "./routes/public-bids.js";
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
import publicAgenda from "./routes/public-agenda.js";
import eventLanding from "./routes/event-landing.js";
import publicEvent from "./routes/public-event.js";
import tours from "./routes/tours.js";
import publicTour from "./routes/public-tour.js";
import compare from "./routes/compare.js";
import { publicRateLimit, publicWriteRateLimit } from "./lib/rateLimit.js";
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
// Counterparty event invitations + event membership roster
import eventInvitations from "./routes/eventInvitations.js";
// Event change architecture / propagation
import eventChanges from "./routes/eventChanges.js";
// Final Count Workflow
import finalCount from "./routes/finalCount.js";
// Vendor Final Count / Final Quantity Workflow
import vendorFinalQuantity from "./routes/vendorFinalQuantity.js";
// Event Execution Packet foundation
import executionPacket from "./routes/executionPacket.js";
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
import preferredPartners from "./routes/preferred-partners.js";
import relationshipCampaigns from "./routes/relationship-campaigns.js";
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
import businessReview from "./routes/business-review.js";
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
import account from "./routes/account.js";
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
// Role-based subscription/entitlement system, Phase 1: multi-org membership
// switcher + real Stripe recurring subscription billing + entitlements.
import orgs from "./routes/orgs.js";
import billing from "./routes/billing.js";
import entitlementsRouter from "./routes/entitlements.js";
import plans from "./routes/plans.js";
import profitMap from "./routes/profit-map.js";
import warehouses from "./routes/warehouses.js";
import pipeline from "./routes/pipeline.js";
import scopeBuilder from "./routes/scope-builder.js";
import proposalStudio from "./routes/proposal-studio.js";
import publicProposals from "./routes/public-proposals.js";
import followUpDesk from "./routes/follow-up-desk.js";
import priceGuide from "./routes/price-guide.js";

const router = Router();

router.use("/auth", authNative);
router.use("/mfa", mfa);
router.use("/", foundation);
router.use("/profile", profiles);
router.use("/profile-extras", profileDecksPrograms);
router.use("/events", events);
router.use("/calendar", calendar);
router.use("/bids", bids);
router.use("/bid-shares", bidShares);
// Baseline throttle across the whole unauthenticated public surface (must be
// registered before any /public/* mount so it covers all of them).
router.use("/public", publicRateLimit);
router.use("/public/bids", publicBids);
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
router.use("/public/agenda", publicAgenda);
router.use("/event-landing", eventLanding);
router.use("/public/event", publicEvent);
router.use("/tours", tours);
router.use("/public/tour", publicTour);
router.use("/public/proposals", publicProposals);
router.use("/compare", compare);
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
router.use("/event-invitations", eventInvitations);
router.use("/event-changes", eventChanges);
router.use("/final-count", finalCount);
router.use("/vendor-final-quantity", vendorFinalQuantity);
router.use("/execution-packet", executionPacket);
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
router.use("/preferred-partners", preferredPartners);
router.use("/relationship-campaigns", relationshipCampaigns);
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
router.use("/business-review", businessReview);
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
router.use("/account", account);
router.use("/revenue-center", revenueCenter);
router.use("/platform-revenue", platformRevenue);
router.use("/featured", featuredRouter);
router.use("/venue-metrics", venueMetricsRouter);
router.use("/vendor-metrics", vendorMetricsRouter);
router.use("/connect-payouts", connectPayouts);
router.use("/admin/manage", adminManage);
router.use("/admin/campaigns", campaigns);
router.use("/orgs", orgs);
router.use("/billing", billing);
router.use("/entitlements", entitlementsRouter);
router.use("/plans", plans);
router.use("/profit-map", profitMap);
router.use("/warehouses", warehouses);
router.use("/pipeline", pipeline);
router.use("/scope-builder", scopeBuilder);
router.use("/proposal-studio", proposalStudio);
router.use("/follow-up-desk", followUpDesk);
router.use("/price-guide", priceGuide);

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AccountDeletedError) return res.status(401).json({ error: "unauthorized" });
  if (err instanceof ForbiddenError) return res.status(403).json({ error: err.message });
  if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
  // Postgres 22P02 (invalid_text_representation): the client sent a
  // malformed value for a typed column -- most commonly a non-UUID string
  // in an :id-shaped path param (e.g. GET /api/public/tour/not-a-real-id).
  // Found via live adversarial testing (ALFY2 pack Section 15, 2026-08-09):
  // dozens of routes across the app pass a path param straight into a
  // parameterized query with no format check first, so any malformed ID --
  // not just an attack payload, a simple typo reaches the same path --
  // surfaced as an opaque 500 instead of a clean 400. The malformed value
  // never becomes SQL syntax (it's a bind parameter, not string-concatenated
  // SQL) so this was never an injection risk, only a robustness/API-quality
  // gap. One central fix here covers every route with this shape, instead
  // of adding per-route validation to dozens of files individually.
  if (err?.code === "22P02") return res.status(400).json({ error: "invalid id" });
  const auth = getAuth(req);
  logger.error("unhandled api error", {
    error: err?.message || String(err),
    stack: err?.stack,
    method: req.method,
    path: req.path,
    userId: auth.userId,
  });
  res.status(500).json({ error: "internal error" });
}

export default router;
