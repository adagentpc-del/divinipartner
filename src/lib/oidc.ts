import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';

// Build-time public values inlined by Vite. NO secret here - the SPA does
// Authorization Code + PKCE against Authentik. Mirrors divinipartner's oidc.ts.
const issuer = import.meta.env.VITE_OIDC_ISSUER as string | undefined; // .../application/o/divini-partners/
const clientId = import.meta.env.VITE_OIDC_CLIENT_ID as string | undefined;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const redirectUri =
  (import.meta.env.VITE_OIDC_REDIRECT_URI as string | undefined) ||
  (typeof window !== 'undefined' ? `${window.location.origin}${basePath}/auth/callback` : '');

if (!issuer || !clientId) {
  // eslint-disable-next-line no-console
  console.error(
    'Missing VITE_OIDC_ISSUER / VITE_OIDC_CLIENT_ID. OIDC login will not work until these are set at build time.'
  );
}

export const userManager = new UserManager({
  authority: issuer ?? '',
  client_id: clientId ?? '',
  redirect_uri: redirectUri,
  post_logout_redirect_uri: typeof window !== 'undefined' ? window.location.origin : '',
  response_type: 'code', // Authorization Code + PKCE
  scope: 'openid profile email',
  userStore: new WebStorageStateStore({ store: window.localStorage }),
  automaticSilentRenew: true,
});

// Optional dedicated Authentik flow URLs (full absolute URLs). When set at build
// time they send users straight to Authentik's enrollment / recovery flows; when
// unset we fall back to the hosted sign-in screen (which shows "Sign up" and
// "Forgot password?" links whenever those flows are bound to the application), so
// there is never a guessed slug that 404s. Example values:
//   VITE_OIDC_ENROLLMENT_URL=https://auth.divinipartners.com/if/flow/default-enrollment-flow/
//   VITE_OIDC_RECOVERY_URL=https://auth.divinipartners.com/if/flow/default-recovery-flow/
const enrollmentUrl = import.meta.env.VITE_OIDC_ENROLLMENT_URL as string | undefined;
const recoveryUrl = import.meta.env.VITE_OIDC_RECOVERY_URL as string | undefined;

export const getUser = (): Promise<User | null> => userManager.getUser();
export const login = (): Promise<void> => userManager.signinRedirect();
export const logout = (): Promise<void> => userManager.signoutRedirect();
export const completeLogin = (): Promise<User> => userManager.signinRedirectCallback();

/** Start account creation. Uses the dedicated Authentik enrollment flow when
 *  VITE_OIDC_ENROLLMENT_URL is configured, else the hosted sign-in (which links to
 *  enrollment when an enrollment flow is bound). */
export const enroll = (): void => {
  if (enrollmentUrl && typeof window !== 'undefined') {
    window.location.href = enrollmentUrl;
    return;
  }
  void userManager.signinRedirect();
};

/** Start password recovery. Uses the dedicated Authentik recovery flow when
 *  VITE_OIDC_RECOVERY_URL is configured, else the hosted sign-in (which shows
 *  "Forgot password?" when a recovery flow is bound). No slug is guessed. */
export const recover = (): void => {
  if (recoveryUrl && typeof window !== 'undefined') {
    window.location.href = recoveryUrl;
    return;
  }
  void userManager.signinRedirect();
};
