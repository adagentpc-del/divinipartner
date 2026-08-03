import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiGet, apiSend, setToken } from './api';

// "Company" = the user's organization/account. `kind` is the role
// (venue | vendor | planner | client | supplier | installer); `tier` is the plan.
export type Company = {
  id: string; kind: string; name: string; tier?: string;
  contact_name?: string; contact_title?: string; phone?: string; email?: string;
  city?: string; region?: string; logo_url?: string; rating?: number;
  verification_status?: string; white_label_status?: string;
};

// A minimal session object so existing page code that reads
// `session.user.id` / `session.user.email` keeps working unchanged.
export type Session = {
  user: { id: string; email: string | null };
  accessToken: string | null;
};

type MeResponse = { user: { id: string; email: string | null }; isAdmin: boolean; company: Company | null };

// Login / register-verify / reset responses share this shape.
type AuthResponse = { ok: boolean; token: string; user: { id: string; email: string | null }; isAdmin: boolean };

// One organization the signed-in user belongs to (multi-org switcher).
export type MyOrganization = Company & { active: boolean; membership_role?: string | null };

type AuthState = {
  session: Session | null;
  company: Company | null;
  isAdmin: boolean;
  loading: boolean;
  refreshCompany: () => Promise<void>;
  // Multi-org: every org this user belongs to, and switching the active one.
  organizations: MyOrganization[];
  switchOrg: (organizationId: string) => Promise<void>;
  // Native email/password auth.
  signIn: (email: string, password: string) => Promise<void>;
  createAccount: (email: string, password: string, passwordConfirm: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  // Apply a verify-email or reset-password token; on success a session is issued.
  applySessionResponse: (resp: AuthResponse) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState>({} as AuthState);
export const useAuth = () => useContext(Ctx);

// Raw shape returned by GET /orgs/mine (server-side org columns; `type` is the
// role/kind, matching db.ts's DbOrg -- the SPA's Company type calls it `kind`).
type RawMyOrg = {
  id: string; name: string; type: string | null; tier: string | null;
  verification_status?: string | null; white_label_status?: string | null;
  membership_role: string | null; active: boolean;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState<MyOrganization[]>([]);

  async function loadMe(): Promise<boolean> {
    try {
      const me = await apiGet<MeResponse>('/auth/me');
      setSession({ user: me.user, accessToken: null });
      setCompany(me.company ?? null);
      setIsAdmin(me.isAdmin);
      return true;
    } catch {
      setSession(null);
      setCompany(null);
      setIsAdmin(false);
      setOrganizations([]);
      return false;
    }
  }

  async function refreshOrganizations() {
    try {
      const resp = await apiGet<{ organizations: RawMyOrg[] }>('/orgs/mine');
      setOrganizations(
        resp.organizations.map((o) => ({
          id: o.id,
          kind: o.type ?? '',
          name: o.name,
          tier: o.tier ?? undefined,
          verification_status: o.verification_status ?? undefined,
          white_label_status: o.white_label_status ?? undefined,
          membership_role: o.membership_role,
          active: o.active,
        })),
      );
    } catch {
      setOrganizations([]);
    }
  }

  async function refreshCompany() {
    const ok = await loadMe();
    if (ok) await refreshOrganizations();
  }

  const switchOrg = async (organizationId: string) => {
    await apiSend('POST', '/orgs/switch', { organizationId });
    await refreshCompany();
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      const ok = await loadMe();
      if (ok) await refreshOrganizations();
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // After any endpoint that issues a session (login, verify, reset), store the
  // bearer token (cookie is set by the server) and load the user.
  async function applySessionResponse(resp: AuthResponse) {
    if (resp?.token) setToken(resp.token);
    await loadMe();
  }

  const signIn = async (email: string, password: string) => {
    const resp = await apiSend<AuthResponse>('POST', '/auth/login', { email, password });
    await applySessionResponse(resp);
  };

  const createAccount = async (email: string, password: string, passwordConfirm: string) => {
    // Server returns { ok, needsVerification:true }; no session until verified.
    await apiSend<{ ok: boolean; needsVerification: boolean }>('POST', '/auth/register', {
      email,
      password,
      passwordConfirm,
    });
  };

  const resendVerification = async (email: string) => {
    await apiSend<{ ok: boolean }>('POST', '/auth/resend-verification', { email });
  };

  const forgotPassword = async (email: string) => {
    await apiSend<{ ok: boolean }>('POST', '/auth/forgot', { email });
  };

  const signOut = async () => {
    try {
      await apiSend('POST', '/auth/logout');
    } catch {
      /* ignore */
    }
    setToken(null);
    setSession(null);
    setCompany(null);
    setIsAdmin(false);
    setOrganizations([]);
  };

  return (
    <Ctx.Provider
      value={{
        session,
        company,
        isAdmin,
        loading,
        refreshCompany,
        organizations,
        switchOrg,
        signIn,
        createAccount,
        resendVerification,
        forgotPassword,
        applySessionResponse,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
