import { Navigate } from 'react-router-dom';

/**
 * Retired OIDC callback. Native email/password auth replaced Authentik, so the
 * /auth/callback route no longer performs a PKCE exchange. Any legacy link here
 * just bounces to the native sign-in page.
 */
export default function AuthCallback() {
  return <Navigate to="/login" replace />;
}
