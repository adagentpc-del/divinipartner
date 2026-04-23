import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, useClerk, useAuth } from '@clerk/react';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { queryClient } from "@/lib/queryClient";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import AdminLayout from "@/components/layout/AdminLayout";
import Dashboard from "@/pages/admin/Dashboard";
import PartnersList from "@/pages/admin/PartnersList";
import PartnerForm from "@/pages/admin/PartnerForm";
import RequestsList from "@/pages/admin/RequestsList";
import RequestDetail from "@/pages/admin/RequestDetail";
import PortalRequestDetail from "@/pages/admin/PortalRequestDetail";
import DeckExtractionReview from "@/pages/admin/DeckExtractionReview";
import AssetsLibrary from "@/pages/admin/AssetsLibrary";
import PricingRules from "@/pages/admin/PricingRules";
import PartnerThemeEditor from "@/pages/admin/PartnerThemeEditor";
import PartnerSections from "@/pages/admin/PartnerSections";
import PartnerAddons from "@/pages/admin/PartnerAddons";
import BrandingLocations from "@/pages/admin/BrandingLocations";
import ProductCatalog from "@/pages/admin/ProductCatalog";
import SuppliersList from "@/pages/admin/SuppliersList";
import CitiesAndVenues from "@/pages/admin/CitiesAndVenues";
import EventsList from "@/pages/admin/EventsList";
import PackagesList from "@/pages/admin/PackagesList";
import InventoryDashboard from "@/pages/admin/InventoryDashboard";
import ProductFamilies from "@/pages/admin/ProductFamilies";
import OrdersDashboard from "@/pages/admin/OrdersDashboard";
import OrderDetail from "@/pages/admin/OrderDetail";
import UserRoles from "@/pages/admin/UserRoles";
import VendorPortal from "@/pages/admin/VendorPortal";
import FulfillmentCommandCenter from "@/pages/admin/FulfillmentCommandCenter";
import QuoteIngestion from "@/pages/admin/QuoteIngestion";
import Reconciliation from "@/pages/admin/Reconciliation";
import Billing from "@/pages/admin/Billing";
import Settings from "@/pages/admin/Settings";
import EmailReadiness from "@/pages/admin/EmailReadiness";
import SecurityReadiness from "@/pages/admin/SecurityReadiness";
import AlertCenter from "@/pages/admin/AlertCenter";
import InvoiceDetail from "@/pages/admin/InvoiceDetail";
import PublicInvoice from "@/pages/Invoice";
import Production from "@/pages/admin/Production";
import SupplierPacket from "@/pages/admin/SupplierPacket";
import Assets from "@/pages/admin/Assets";
import WorkflowDashboard from "@/pages/admin/WorkflowDashboard";
import Analytics from "@/pages/admin/Analytics";
import LaunchWizard from "@/pages/admin/LaunchWizard";
import PostLaunchDashboard from "@/pages/admin/PostLaunchDashboard";
import FeedbackInbox from "@/pages/admin/FeedbackInbox";
import CommercialDashboard from "@/pages/admin/CommercialDashboard";
import CommercialAccountDetail from "@/pages/admin/CommercialAccountDetail";
import CommercialPlans from "@/pages/admin/CommercialPlans";
import SalesCommandCenter from "@/pages/admin/SalesCommandCenter";
import ProposalDetail from "@/pages/admin/ProposalDetail";
import AccountActivation from "@/pages/admin/AccountActivation";
import SalesShowcase from "@/pages/admin/SalesShowcase";
import RolloutStabilization from "@/pages/admin/RolloutStabilization";
import AccountBlockers from "@/pages/admin/AccountBlockers";
import ObjectionsBoard from "@/pages/admin/ObjectionsBoard";
import DemoFollowups from "@/pages/admin/DemoFollowups";
import HelpFaq from "@/pages/admin/HelpFaq";
import OperatorRunbook from "@/pages/admin/OperatorRunbook";
import DeploymentReadiness from "@/pages/admin/DeploymentReadiness";
import { DemoModeProvider } from "@/contexts/DemoModeContext";
import WorkflowRules from "@/pages/admin/WorkflowRules";

import PublicLayout from "@/components/layout/PublicLayout";
import PartnerPortal from "@/pages/public/PartnerPortal";
import PartnerOnboarding from "@/pages/public/PartnerOnboarding";
import OnboardingSubmissions from "@/pages/admin/OnboardingSubmissions";
import CommittedInventory from "@/pages/admin/CommittedInventory";
import NotFound from "@/pages/not-found";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const isDevKey = clerkPubKey?.startsWith("pk_test_");
const clerkProxyUrl = isDevKey ? undefined : (import.meta.env.VITE_CLERK_PROXY_URL || "/api/__clerk");
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <SignIn routing="path" path={`${basePath}/login`} fallbackRedirectUrl={`${basePath}/admin`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function HomeRedirect() {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  if (isSignedIn) return <Redirect to="/admin" />;
  return <Redirect to="/login" />;
}

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect to="/login" />;
  return (
    <AdminLayout>
      <Component />
    </AdminLayout>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <DemoModeProvider>
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/login/*?" component={SignInPage} />
            <Route path="/invoice/:token" component={PublicInvoice} />
            <Route path="/admin/billing">
              {() => <AdminRoute component={Billing} />}
            </Route>
            <Route path="/admin/settings">
              {() => <AdminRoute component={Settings} />}
            </Route>
            <Route path="/admin/email-readiness">
              {() => <AdminRoute component={EmailReadiness} />}
            </Route>
            <Route path="/admin/security">
              {() => <AdminRoute component={SecurityReadiness} />}
            </Route>
            <Route path="/admin/alerts">
              {() => <AdminRoute component={AlertCenter} />}
            </Route>
            <Route path="/admin/invoices/:id">
              {() => <AdminRoute component={InvoiceDetail} />}
            </Route>

            <Route path="/admin">
              {() => <AdminRoute component={Dashboard} />}
            </Route>
            <Route path="/admin/partners">
              {() => <AdminRoute component={PartnersList} />}
            </Route>
            <Route path="/admin/partners/new">
              {() => <AdminRoute component={PartnerForm} />}
            </Route>
            <Route path="/admin/partners/:id/edit">
              {() => <AdminRoute component={PartnerForm} />}
            </Route>
            <Route path="/admin/partners/:id/theme">
              {() => <AdminRoute component={PartnerThemeEditor} />}
            </Route>
            <Route path="/admin/partners/:id/sections">
              {() => <AdminRoute component={PartnerSections} />}
            </Route>
            <Route path="/admin/partners/:id/addons">
              {() => <AdminRoute component={PartnerAddons} />}
            </Route>
            <Route path="/admin/partners/:id/branding-locations">
              {() => <AdminRoute component={BrandingLocations} />}
            </Route>
            <Route path="/admin/partners/:id/committed-inventory">
              {() => <AdminRoute component={CommittedInventory} />}
            </Route>
            <Route path="/admin/products">
              {() => <AdminRoute component={ProductCatalog} />}
            </Route>
            <Route path="/admin/requests">
              {() => <AdminRoute component={RequestsList} />}
            </Route>
            <Route path="/admin/requests/:id">
              {() => <AdminRoute component={RequestDetail} />}
            </Route>
            <Route path="/admin/portal-requests/:type/:id">
              {() => <AdminRoute component={PortalRequestDetail} />}
            </Route>
            <Route path="/admin/partners/:id/deck-extractions/:extractionId">
              {() => <AdminRoute component={DeckExtractionReview} />}
            </Route>
            <Route path="/admin/assets-legacy">
              {() => <AdminRoute component={AssetsLibrary} />}
            </Route>
            <Route path="/admin/pricing">
              {() => <AdminRoute component={PricingRules} />}
            </Route>

            <Route path="/admin/suppliers">
              {() => <AdminRoute component={SuppliersList} />}
            </Route>
            <Route path="/admin/partners/:id/cities-venues">
              {() => <AdminRoute component={CitiesAndVenues} />}
            </Route>
            <Route path="/admin/partners/:id/events">
              {() => <AdminRoute component={EventsList} />}
            </Route>
            <Route path="/admin/partners/:id/packages">
              {() => <AdminRoute component={PackagesList} />}
            </Route>
            <Route path="/admin/inventory">
              {() => <AdminRoute component={InventoryDashboard} />}
            </Route>
            <Route path="/admin/product-families">
              {() => <AdminRoute component={ProductFamilies} />}
            </Route>
            <Route path="/admin/orders">
              {() => <AdminRoute component={OrdersDashboard} />}
            </Route>
            <Route path="/admin/orders/:id">
              {() => <AdminRoute component={OrderDetail} />}
            </Route>
            <Route path="/admin/users">
              {() => <AdminRoute component={UserRoles} />}
            </Route>
            <Route path="/admin/fulfillment">
              {() => <AdminRoute component={FulfillmentCommandCenter} />}
            </Route>
            <Route path="/admin/quote-ingestion">
              {() => <AdminRoute component={QuoteIngestion} />}
            </Route>
            <Route path="/admin/reconciliation">
              {() => <AdminRoute component={Reconciliation} />}
            </Route>
            <Route path="/admin/production">
              {() => <AdminRoute component={Production} />}
            </Route>
            <Route path="/admin/workflow/rules">
              {() => <AdminRoute component={WorkflowRules} />}
            </Route>
            <Route path="/admin/analytics">
              {() => <AdminRoute component={Analytics} />}
            </Route>
            <Route path="/admin/launch">
              {() => <AdminRoute component={LaunchWizard} />}
            </Route>
            <Route path="/admin/post-launch">
              {() => <AdminRoute component={PostLaunchDashboard} />}
            </Route>
            <Route path="/admin/feedback">
              {() => <AdminRoute component={FeedbackInbox} />}
            </Route>
            <Route path="/admin/commercial">
              {() => <AdminRoute component={CommercialDashboard} />}
            </Route>
            <Route path="/admin/commercial/plans">
              {() => <AdminRoute component={CommercialPlans} />}
            </Route>
            <Route path="/admin/commercial/accounts/:id">
              {() => <AdminRoute component={CommercialAccountDetail} />}
            </Route>
            <Route path="/admin/sales">
              {() => <AdminRoute component={SalesCommandCenter} />}
            </Route>
            <Route path="/admin/sales/showcase">
              {() => <AdminRoute component={SalesShowcase} />}
            </Route>
            <Route path="/admin/sales/proposals/:id">
              {() => <AdminRoute component={ProposalDetail} />}
            </Route>
            <Route path="/admin/sales/activation/:accountId">
              {() => <AdminRoute component={AccountActivation} />}
            </Route>
            <Route path="/admin/sales/objections">
              {() => <AdminRoute component={ObjectionsBoard} />}
            </Route>
            <Route path="/admin/sales/followups">
              {() => <AdminRoute component={DemoFollowups} />}
            </Route>
            <Route path="/admin/rollout">
              {() => <AdminRoute component={RolloutStabilization} />}
            </Route>
            <Route path="/admin/rollout/account/:accountId">
              {() => <AdminRoute component={AccountBlockers} />}
            </Route>
            <Route path="/admin/help">
              {() => <AdminRoute component={HelpFaq} />}
            </Route>
            <Route path="/admin/help/runbook">
              {() => <AdminRoute component={OperatorRunbook} />}
            </Route>
            <Route path="/admin/deployment">
              {() => <AdminRoute component={DeploymentReadiness} />}
            </Route>
            <Route path="/admin/workflow">
              {() => <AdminRoute component={WorkflowDashboard} />}
            </Route>
            <Route path="/admin/orders/:orderId/packet/:supplierId">
              {() => <AdminRoute component={SupplierPacket} />}
            </Route>
            <Route path="/admin/assets">
              {() => <AdminRoute component={Assets} />}
            </Route>
            <Route path="/admin/vendor">
              {() => <AdminRoute component={VendorPortal} />}
            </Route>
            <Route path="/admin/onboarding">
              {() => <AdminRoute component={OnboardingSubmissions} />}
            </Route>

            <Route path="/onboard">
              {() => (
                <PublicLayout>
                  <PartnerOnboarding />
                </PublicLayout>
              )}
            </Route>

            <Route path="/partner/:slug">
              {(params) => (
                <PublicLayout>
                  <PartnerPortal slug={params.slug} />
                </PublicLayout>
              )}
            </Route>

            {/* Bare-slug partner URLs: www.partnershipportal.co/<slug>.
                Reserved/admin paths above match first; this only catches
                top-level slugs that aren't admin/auth/public-utility routes. */}
            <Route path="/:slug">
              {(params) => (
                <PublicLayout>
                  <PartnerPortal slug={params.slug} />
                </PublicLayout>
              )}
            </Route>

            <Route component={NotFound} />
          </Switch>
        </TooltipProvider>
        </DemoModeProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
      <Toaster />
    </WouterRouter>
  );
}

export default App;
