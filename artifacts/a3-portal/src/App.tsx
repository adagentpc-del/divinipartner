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
import AssetsLibrary from "@/pages/admin/AssetsLibrary";
import PricingRules from "@/pages/admin/PricingRules";

import PublicLayout from "@/components/layout/PublicLayout";
import PartnerPortal from "@/pages/public/PartnerPortal";
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
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/login/*?" component={SignInPage} />

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
            <Route path="/admin/requests">
              {() => <AdminRoute component={RequestsList} />}
            </Route>
            <Route path="/admin/requests/:id">
              {() => <AdminRoute component={RequestDetail} />}
            </Route>
            <Route path="/admin/assets">
              {() => <AdminRoute component={AssetsLibrary} />}
            </Route>
            <Route path="/admin/pricing">
              {() => <AdminRoute component={PricingRules} />}
            </Route>

            <Route path="/partner/:slug">
              {(params) => (
                <PublicLayout>
                  <PartnerPortal slug={params.slug} />
                </PublicLayout>
              )}
            </Route>

            <Route component={NotFound} />
          </Switch>
        </TooltipProvider>
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
