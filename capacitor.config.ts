import type { CapacitorConfig } from '@capacitor/cli';

// Divini Partners native shell (Capacitor).
//
// PRIMARY (managed webview) configuration: the native app loads the HOSTED
// production site over HTTPS via server.url. This is the fastest, lowest-risk
// path for a research-preview launch because auth is native email/password (a
// plain form POST to /api/auth, not an OAuth redirect flow) -- login behaves
// exactly as it does on the web, no native deep-link / custom-scheme callback
// plumbing required. It does mean the app depends on the live HTTPS domain
// being up (see MOBILE-APP.md, Stage B).
//
// App Transport Security (ATS) MUST stay strict: cleartext is false and there
// are NO http origins anywhere in this config. Do not add insecure origins.
//
// Brand color is emerald-deep (#123c2e) for the status bar and splash screen.

const config: CapacitorConfig = {
  appId: 'com.divinigroup.divinipartners',
  appName: 'Divini Partners',
  webDir: 'dist',
  // Managed webview: load the live hosted app. cleartext is false because the
  // site is served over HTTPS only (App Transport Security stays at defaults).
  server: {
    url: 'https://app.divinipartners.com',
    cleartext: false,
  },
  ios: {
    contentInset: 'always',
    // iOS custom URL scheme used for the in-app webview. Keep as "https" so the
    // webview origin matches the hosted site (helps the session cookie behave
    // the same as it does on the web). Override only if you switch to the
    // bundled-offline mode.
    scheme: 'https',
  },
  android: {
    // Android webview scheme. "https" keeps parity with iOS and the hosted app.
    // allowMixedContent stays false since the app is HTTPS end to end.
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#123c2e',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      // Light text/icons on the dark emerald brand bar.
      style: 'DARK',
      backgroundColor: '#123c2e',
      overlaysWebView: false,
    },
  },
};

export default config;

// ---------------------------------------------------------------------------
// ALTERNATIVE (bundled / offline) configuration - LATER OPTION, not active.
//
// Ship the SPA assets INSIDE the app bundle instead of loading the hosted URL.
// This makes the shell work offline and removes the runtime dependency on the
// live domain, but login needs extra handling: a bundled app talks to the API
// from capacitor://localhost (iOS) / https://localhost (Android) instead of
// the real hosted origin, so the CORS allowlist and session-cookie/Bearer-token
// handling both need updating first (see MOBILE-APP.md's "Bundled / offline
// alternative" section for the exact steps). Do NOT enable this without doing
// that login plumbing first.
//
// IMPORTANT: this requires a SEPARATE, relatively-based web build so the app
// can load assets from the local file system. Do this in a throwaway output dir
// so the normal web deploy (which serves at "/") is never touched:
//
//   BASE_PATH=./ npx vite build --outDir dist-native --emptyOutDir
//
// Then use a config like the following (note: no server.url, webDir points at
// the relatively-based build):
//
//   const config: CapacitorConfig = {
//     appId: 'com.divinigroup.divinipartners',
//     appName: 'Divini Partners',
//     webDir: 'dist-native',
//     ios: { contentInset: 'always' },
//     plugins: {
//       SplashScreen: { backgroundColor: '#123c2e', showSpinner: false },
//       StatusBar: { style: 'DARK', backgroundColor: '#123c2e' },
//     },
//   };
// ---------------------------------------------------------------------------
