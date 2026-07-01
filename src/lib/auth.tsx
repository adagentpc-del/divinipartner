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

type AuthState = {
  session: Session | null;
  company: Company | null;
  isAdmin: boolean;
  loading: boolean;
  refreshCompany: () => Promise<void>;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

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
      return false;
    }
  }

  async function refreshCompany() {
    await loadMe();
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      await loadMe();
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
  };

  return (
    <Ctx.Provider
      value={{
        session,
        company,
        isAdmin,
        loading,
        refreshCompany,
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
