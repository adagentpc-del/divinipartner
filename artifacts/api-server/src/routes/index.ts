import { Router, type IRouter } from "express";
import healthRouter from "./health";
import productFamiliesRouter from "./productFamilies";
import rentableAssetsRouter from "./rentableAssets";
import partnersRouter from "./partners";
import partnerEmailRecipientsRouter from "./partnerEmailRecipients";
import partnerContactsRouter from "./partnerContacts";
import emailReadinessRouter from "./emailReadiness";
import liveReadinessRouter from "./liveReadiness";
import alertsRouter from "./alerts";
import publicPortalRouter from "./publicPortal";
import requestsRouter from "./requests";
import pricingRouter from "./pricing";
import dashboardRouter from "./dashboard";
import storageRouter from "./storage";
import partnerThemesRouter from "./partnerThemes";
import partnerSectionsRouter from "./partnerSections";
import productCatalogRouter from "./productCatalog";
import brandingLocationsRouter from "./brandingLocations";
import portalRequestsRouter from "./portalRequests";
import deckExtractionRouter from "./deckExtraction";
import packageExtractionRouter from "./packageExtraction";
import suppliersRouter from "./suppliers";
import citiesRouter from "./cities";
import venuesRouter from "./venues";
import eventsRouter from "./events";
import packagesRouter from "./packages";
import inventoryRouter from "./inventory";
import quoteAssetsRouter from "./quoteAssets";
import ordersRouter from "./orders";
import userRolesRouter from "./userRoles";
import savedAddressesRouter from "./savedAddresses";
import partnerOnboardingRouter from "./partnerOnboarding";
import { assetsRouter } from "./assets";
import { productionRouter } from "./production";
import workflowRouter from "./workflow";
import analyticsRouter from "./analytics";
import importsRouter from "./imports";
import onboardingRouter from "./onboarding";
import postLaunchRouter from "./postLaunch";
import commercializationRouter from "./commercialization";
import salesEnablementRouter from "./salesEnablement";
import stabilizationRouter from "./stabilization";
import deploymentRouter from "./deployment";
import unitsRouter from "./units";
import partnerInventoryRouter from "./partnerInventory";
import exportsRouter from "./exports";
import reconciliationRouter from "./reconciliation";
import invoicesRouter from "./invoices";
import billingRouter from "./billing";
import publicConfigRouter from "./publicConfig";
import securityReadinessRouter from "./securityReadiness";
import addonsRouter from "./addons";
import {
  uploadLimiter,
  orderSubmitLimiter,
  publicWriteLimiter,
  publicReadLimiter,
  aiTriggerLimiter,
} from "../middlewares/rateLimit";

const router: IRouter = Router();

// Targeted rate limits for sensitive entry points. Applied before the routers
// themselves so the limit fires before any handler runs.
router.use("/storage/uploads/request-url", uploadLimiter);
router.use(/^\/public\/partners\/[^/]+\/orders$/, orderSubmitLimiter);
router.use(/^\/public\/partners\/[^/]+\/(requests|orders)$/, publicWriteLimiter);
router.use("/onboarding/submit", publicWriteLimiter);

// Public READ traffic — partner portal pages, pricing, ordering, addons, etc.
// Loose 120/min/ip lets normal portal browsing through but stops scrapers.
// Method-gated to safe verbs so we don't double-count POST /public/*
// (already covered by orderSubmit + publicWrite above). HEAD is included so
// scrapers can't bypass by switching verbs.
router.use(/^\/public(\/|$)/, (req, res, next) =>
  req.method === "GET" || req.method === "HEAD"
    ? publicReadLimiter(req, res, next)
    : next(),
);

// Public object streams (partner logos, brand assets shown on portal pages).
// Same loose 120/min/ip cap — covers a normal user's image bursts on a portal
// page while preventing bandwidth-exhaustion abuse. Browser caching means
// repeat loads don't even hit this bucket in practice.
router.use(/^\/storage\/public-objects(\/|$)/, (req, res, next) =>
  req.method === "GET" || req.method === "HEAD"
    ? publicReadLimiter(req, res, next)
    : next(),
);

// Admin-triggered AI extraction endpoints (deck + package, create + rerun).
// Content-hash dedup makes repeats free, but rate-limit a runaway loop.
router.use(/^\/partners\/[^/]+\/(deck|package)-extractions$/, aiTriggerLimiter);
router.use(/^\/(deck|package)-extractions\/[^/]+\/rerun$/, aiTriggerLimiter);

router.use(healthRouter);
router.use(publicConfigRouter);
router.use(securityReadinessRouter);
router.use(addonsRouter);
router.use(partnersRouter);
router.use(partnerEmailRecipientsRouter);
router.use(partnerContactsRouter);
router.use(emailReadinessRouter);
router.use(liveReadinessRouter);
router.use(alertsRouter);
router.use(publicPortalRouter);
router.use(requestsRouter);
router.use(pricingRouter);
router.use(dashboardRouter);
router.use(storageRouter);
router.use(partnerThemesRouter);
router.use(partnerSectionsRouter);
router.use(productCatalogRouter);
router.use(brandingLocationsRouter);
router.use(portalRequestsRouter);
router.use(deckExtractionRouter);
router.use(packageExtractionRouter);
router.use(productFamiliesRouter);
router.use(rentableAssetsRouter);
router.use(suppliersRouter);
router.use(citiesRouter);
router.use(venuesRouter);
router.use(eventsRouter);
router.use(packagesRouter);
router.use(inventoryRouter);
router.use(quoteAssetsRouter);
router.use(ordersRouter);
router.use(userRolesRouter);
router.use(savedAddressesRouter);
router.use(partnerOnboardingRouter);
router.use(partnerInventoryRouter);
router.use(exportsRouter);
router.use(reconciliationRouter);
router.use(invoicesRouter);
router.use(billingRouter);
router.use(assetsRouter);
router.use(productionRouter);
router.use(workflowRouter);
router.use(analyticsRouter);
router.use(importsRouter);
router.use(onboardingRouter);
router.use(postLaunchRouter);
router.use(commercializationRouter);
router.use(salesEnablementRouter);
router.use(stabilizationRouter);
router.use(deploymentRouter);
router.use(unitsRouter);

export default router;
