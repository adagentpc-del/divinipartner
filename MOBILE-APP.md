# Divini Partners - Native App (iOS App Store + Google Play)

This document explains how to build and ship the Divini Partners native app using
Capacitor, alongside the existing web app. The native shell does NOT replace the
web app. It wraps it.

## How this is set up (read first)

The app uses Capacitor in **managed-webview** mode. The native iOS/Android shell
loads the **live hosted site** over HTTPS:

```
server.url = https://app.divinipartners.com   (see capacitor.config.ts)
```

Why this approach:

- **Login just works.** Authentik OIDC uses a browser redirect flow. Because the
  webview loads the real hosted origin, login behaves exactly as it does on the
  web. No native deep-link / custom-scheme callback plumbing is required.
- **Fastest path to a working app** for a research preview. You ship the shell,
  and every web deploy updates the app instantly (no app-store resubmission for
  content changes).
- **Lowest risk to the web build.** Nothing about the web Vite build changes. The
  web app still serves at `/` and deploys exactly as documented in
  `DIVINI-PARTNERS-DEPLOY.md`.

### Hard dependency: Stage B must be live

Because the app loads `https://app.divinipartners.com`, the app only works once
that HTTPS domain is live (the hosting / Caddy / Authentik stage). Until then the
shell will show a connection error. Bring the domain up first (Stage B of the
deploy runbook), confirm web login works in a desktop browser, THEN build the app.

If you want an app that works **before** the domain is live, or works offline, see
"Bundled / offline alternative" near the bottom.

---

## Prerequisites (Mac)

- macOS with **Xcode** (for iOS) from the Mac App Store. Open it once and accept
  the license. Install an iOS Simulator runtime.
- **CocoaPods**: `sudo gem install cocoapods` (or `brew install cocoapods`).
- **Android Studio** (for Android) with the Android SDK + a virtual device.
- **Node 18+** and npm.
- Apple Developer Program membership ($99/yr) to ship to TestFlight / App Store.
- Google Play Developer account ($25 one-time) to ship to Play.

> Cost control: you only need the Apple membership when you are ready to push to
> TestFlight / the store. You can build and run on the Simulator and on a
> physical device (with a free personal team, 7-day signing) for $0 while testing.

---

## One-time setup on the Mac

Run from the app root: `sites/divini-partners`

```bash
# 1. Install JS deps (Capacitor packages are already in package.json)
npm install

# 2. Build the web assets (populates dist/, which Capacitor copies in)
npm run build

# 3. Add the native platforms (creates ios/ and android/ folders)
#    These need Xcode / Android SDK, so they only run on the Mac.
npx cap add ios
npx cap add android

# 4. Sync web assets + config + plugins into the native projects
npx cap sync
```

There is a convenience script that does build + sync in one step:

```bash
npm run app:build      # = npm run build && npx cap sync
```

Other helper scripts (in package.json):

| Script                  | Does                          |
| ----------------------- | ----------------------------- |
| `npm run cap:add:ios`     | `npx cap add ios`             |
| `npm run cap:add:android` | `npx cap add android`         |
| `npm run cap:sync`        | `npx cap sync`                |
| `npm run cap:open:ios`    | open the Xcode project        |
| `npm run cap:open:android`| open the Android Studio project |
| `npm run app:build`       | web build + cap sync          |

---

## Run / open the native projects

```bash
npx cap open ios       # opens ios/App/App.xcworkspace in Xcode
npx cap open android   # opens the Android project in Android Studio
```

In **Xcode**: pick a simulator or your connected device and press Run.
In **Android Studio**: pick an emulator or device and press Run.

Whenever you change web code or `capacitor.config.ts`, re-run `npm run app:build`
(or `npm run build && npx cap sync`) before rebuilding in Xcode / Studio.

---

## Signing

### iOS

1. In Xcode, select the **App** target > **Signing & Capabilities**.
2. Check **Automatically manage signing**.
3. Choose your **Team** (your Apple Developer account, or a free personal team
   for local-only testing).
4. Bundle identifier is `com.divinigroup.divinipartners` (matches `appId`). If
   you change it, change `appId` in `capacitor.config.ts` too and re-sync.

### Android

1. For testing, the debug keystore is automatic.
2. For Play release, create an upload keystore and configure it in
   `android/app/build.gradle` (or use Play App Signing). Keep the keystore safe.
3. Application id is `com.divinigroup.divinipartners`.

---

## App icons and splash screen

Brand assets already live in `public/brand/`:

- `public/brand/mark-emerald.png` and `mark-ivory.png` - square marks, best for
  the **app icon**.
- `public/brand/logo-emerald.png` and `logo-ivory.png` - wordmark logos, good for
  the **splash** artwork.
- The brand background / splash color is emerald-deep `#123c2e` (already set in
  `capacitor.config.ts` under SplashScreen + StatusBar).

Easiest path - use the official asset generator:

```bash
npm install --save-dev @capacitor/assets

# Place source images in a top-level "assets" folder:
#   assets/icon.png        (1024x1024, the square mark on emerald)
#   assets/splash.png      (2732x2732, logo centered on #123c2e)
#   assets/splash-dark.png (optional dark variant)
npx @capacitor/assets generate --ios --android
```

This generates every required icon and splash size into the `ios/` and
`android/` projects. Then run `npx cap sync` again.

You can produce `assets/icon.png` from `public/brand/mark-emerald.png` (place it
on a `#123c2e` square if it has transparency) and `assets/splash.png` from
`public/brand/logo-ivory.png` centered on `#123c2e`.

---

## iOS Info.plist notes

- **App Transport Security (ATS):** no changes needed. The app loads
  `https://app.divinipartners.com` over HTTPS, which satisfies default ATS. Do
  NOT add `NSAllowsArbitraryLoads`.
- **Camera / Photos usage strings:** only add these if the app actually uses the
  camera or photo library (e.g. if you later add native upload via a Capacitor
  Camera plugin). If/when you do, add:
  - `NSCameraUsageDescription` - "Divini Partners uses the camera to capture
    documents and site photos for bid packages."
  - `NSPhotoLibraryUsageDescription` - "Divini Partners accesses your photos to
    attach images to bid packages."
  The current managed-webview setup does file uploads through the standard web
  file input inside the webview, so these strings are not required yet.

---

## TestFlight (iOS) submission checklist

1. Live HTTPS domain (`app.divinipartners.com`) is up and web login works.
2. Bundle id `com.divinigroup.divinipartners` registered in your Apple Developer
   account; an App record created in App Store Connect.
3. Signing team selected, version + build number set in Xcode.
4. `npm run app:build` run so the latest web assets are synced.
5. Xcode > Product > Archive > Distribute App > App Store Connect > Upload.
6. In App Store Connect, add the build to TestFlight, complete export-compliance
   (standard HTTPS = usually "no" to custom encryption), invite testers.
7. For full App Store review later: app icon, screenshots (per device size),
   privacy policy URL, app privacy "data collection" answers, description,
   support URL. A managed-webview app should clearly provide real app value (it
   does: full marketplace), to satisfy Apple guideline 4.2 (minimum
   functionality). Make sure the app is not just a thin wrapper of a single page.

## Google Play submission checklist

1. Live HTTPS domain up and web login works.
2. Application id `com.divinigroup.divinipartners`; create the app in Play
   Console.
3. Generate a signed **App Bundle (.aab)**: Android Studio > Build > Generate
   Signed Bundle / APK > Android App Bundle.
4. Upload to an internal-testing track first, then closed/open testing, then
   production.
5. Complete the Play Data safety form, content rating, privacy policy URL, store
   listing (icon, feature graphic, screenshots).

---

## Bundled / offline alternative (LATER option)

The default is managed-webview (loads the live site). If you later want the SPA
bundled inside the app (works offline, no runtime dependency on the domain), do
this WITHOUT touching the normal web build:

1. Produce a **relatively-based** web build into a separate output dir so the web
   deploy (served at `/`) is never affected:

   ```bash
   BASE_PATH=./ npx vite build --outDir dist-native --emptyOutDir
   ```

2. In `capacitor.config.ts`, switch to the commented "ALTERNATIVE" block at the
   bottom of that file: remove `server.url` and set `webDir: 'dist-native'`.

3. **Login plumbing required.** Because there is no hosted origin, OIDC redirects
   must come back to a native custom-scheme deep link (for example
   `divinipartners://callback`). You must:
   - register that redirect URI in Authentik for the app client,
   - configure the iOS URL scheme / Android intent filter for `divinipartners`,
   - handle the callback in the app (Capacitor App `appUrlOpen` listener) and
     hand the code to `oidc-client-ts`.
   Do not enable offline mode until this is done, or login will not complete.

4. `npx cap sync` and rebuild.

The managed-webview default avoids all of step 3, which is why it is the
recommended launch path.

---

## Summary of the exact Mac commands

```bash
cd sites/divini-partners
npm install
npm run build
npx cap add ios          # and/or: npx cap add android
npx cap sync
npx cap open ios         # and/or: npx cap open android
# set signing in Xcode / Android Studio, then Run / Archive
```
