/**
 * Global fetch interceptor that attaches the Clerk session token as a Bearer
 * Authorization header to every same-origin API request.
 *
 * Why this exists:
 * - When the app uses a Clerk DEVELOPMENT key (pk_test_*), Clerk's session
 *   cookie is set on `clerk.<slug>.accounts.dev` — a different domain from the
 *   deployed app. Same-origin fetches from our SPA never include that cookie,
 *   so the API server's clerkMiddleware() can't see the session and every
 *   admin call returns 401.
 * - For PRODUCTION keys (pk_live_*) we also rely on the proxy, but cookies
 *   can still go missing across the Replit deployment proxy. Attaching a
 *   Bearer token is the universally reliable way to authenticate API calls
 *   from a SPA to its own backend.
 *
 * The interceptor is a no-op when:
 * - The request is to a different origin (we never leak tokens off-domain)
 * - Clerk has not loaded yet or the user is signed out (no token to attach)
 * - The caller already set an Authorization header
 */

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

interface MaybeClerk {
  session?: {
    getToken?: () => Promise<string | null>;
  };
}

declare global {
  interface Window {
    Clerk?: MaybeClerk;
  }
}

function isSameOriginApiRequest(url: string): boolean {
  // Absolute URLs: only intercept if they target our own origin.
  if (/^https?:\/\//i.test(url)) {
    try {
      const u = new URL(url);
      if (u.origin !== window.location.origin) return false;
      return u.pathname.startsWith(`${basePath}/api/`) || u.pathname.startsWith("/api/");
    } catch {
      return false;
    }
  }
  // Relative URLs: only intercept calls into our API path prefix.
  return url.startsWith(`${basePath}/api/`) || url.startsWith("/api/");
}

let installed = false;
export function installClerkFetchInterceptor(): void {
  if (installed) return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    let url: string;
    if (typeof input === "string") url = input;
    else if (input instanceof URL) url = input.toString();
    else url = input.url;

    if (!isSameOriginApiRequest(url)) {
      return originalFetch(input, init);
    }

    // Respect callers that already set an Authorization header.
    const incomingHeaders = new Headers(init?.headers || {});
    const requestHeaders =
      input instanceof Request ? new Headers(input.headers) : new Headers();
    const hasAuthHeader =
      incomingHeaders.has("authorization") || requestHeaders.has("authorization");

    let token: string | null = null;
    if (!hasAuthHeader) {
      try {
        token = (await window.Clerk?.session?.getToken?.()) ?? null;
      } catch {
        token = null;
      }
    }

    const mergedHeaders = new Headers(requestHeaders);
    incomingHeaders.forEach((value, key) => {
      mergedHeaders.set(key, value);
    });
    if (token && !hasAuthHeader) {
      mergedHeaders.set("Authorization", `Bearer ${token}`);
    }

    const mergedInit: RequestInit = {
      ...init,
      headers: mergedHeaders,
      // Same-origin cookies are sent by default, but be explicit so the
      // Clerk session cookie is always forwarded when present.
      credentials: init?.credentials ?? "include",
    };

    return originalFetch(input, mergedInit);
  };
}
