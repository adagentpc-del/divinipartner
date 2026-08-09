# ALFY2 Pack — Section 16: Mobile — iOS, Android & App Store

**Status**: PASS (scoped), with one real defect found and fixed (the
privacy manifest under-declared collected data), and one real
implementation gap documented and tracked as requiring a product/legal
decision (the App Store payment-classification mitigation strategy has no
supporting code). **Native build, signing, and submission remain BLOCKED
from this environment** — genuinely, not as a formality: this is a Linux
sandbox with no Xcode, no Android Studio, and no Mac, and neither `ios/`
nor `android/` native project directories exist in this repository (both
gitignored, never generated/committed). This matches the pre-existing,
accurately-scoped status of task T9 ("iOS native build and App Store
submission (Mac-only)") — not a new finding.

## What exists (discovery)

- **Capacitor shell** (`capacitor.config.ts`, `@capacitor/core` +
  `@capacitor/ios`/`@capacitor/android` + a handful of plugins, all real
  `package.json` dependencies): a "managed webview" configuration — the
  native app loads the hosted production site
  (`https://app.divinipartners.com`) over HTTPS rather than bundling assets
  offline. App Transport Security stays strict (`cleartext: false`, no
  insecure origins anywhere in the config) — confirmed by reading the file
  in full, not just trusting its own comments.
- **`mobile/PrivacyInfo.xcprivacy`**: a ready-to-copy Apple privacy
  manifest template, meant to be added to the Xcode target once `npx cap
  add ios` is run on a Mac.
- **`IOS-APP-STORE-RUNBOOK.md`**: a thorough, step-by-step submission
  runbook, explicitly marking each step `[MAC ONLY]` where it genuinely
  requires Xcode/macOS.
- **`AI_PROJECT_OS/52_COMPLIANCE.md`**: already tracks Apple Guideline
  5.1.1(v) account deletion (built and live-verified in an earlier session,
  reachable at Profile → Account → "Delete account," reachable
  automatically from the native shell since it's the same hosted web app
  the webview loads — confirmed by checking the account page has no
  `window.open`/external-navigation pattern that could behave differently
  inside a Capacitor webview), IAP-vs-external payment classification as an
  open decision, and the privacy manifest's existence.
- T19 (npm audit findings in Capacitor mobile-build tooling — 11 findings,
  all in devDependencies never installed on the production server) remains
  correctly tracked, `NOT STARTED`, needs Mac/Xcode to verify a `npm audit
  fix --force` doesn't break the native build. Not re-litigated here.

## Finding 1: the privacy manifest under-declared a real data type (FIXED)

**What was wrong.** `mobile/PrivacyInfo.xcprivacy` declared Name, Email
Address, Payment Info, User Content, User ID, and Product Interaction as
collected data types — but not Phone Number, despite `users.phone` being a
real, populated column (`server/src/db.ts`'s `registerOrganization`/
`ensureUser` accept and store an optional phone number at registration).
The file's own header comment states the exact requirement this violated:
"the nutrition label in App Store Connect must agree with this file" — an
under-declared manifest would either need correcting during App Review (a
resubmission delay) or, worse, ship inconsistent with what the app store
listing's privacy label claims.

**Fix applied**: added a Phone Number entry to the manifest, matching the
existing declaration pattern (Linked = true, Tracking = false, Purpose =
App Functionality) used for every other declared type.

**Live verification, honestly scoped to what this environment can
actually check**: `plutil` (the macOS plist validator) is not available on
this Linux sandbox — genuinely cannot be run here. Verified the file is
well-formed XML via Python's `xml.dom.minidom` parser instead (a real,
if partial, check: it confirms the file will parse, not that Xcode's
specific plist/privacy-manifest schema accepts every value). This same
check caught and required fixing a real syntax defect introduced by the
first edit attempt (an XML comment containing `--` inside its body, which
is invalid per the XML spec even though `<!--`/`-->` delimiters are
required) — worth disclosing since the honest first result was "the edit
broke the file," not "the fix worked on the first try."

## Finding 2: the compliance doc's own payment-gating mitigation has zero implementation (documented, needs a product/legal decision)

**What was found.** `AI_PROJECT_OS/52_COMPLIANCE.md` and
`IOS-APP-STORE-RUNBOOK.md` both correctly flag that Apple's IAP requirement
may or may not apply to this platform's paid flows (Featured Vendor
$49/mo, listing/placement fees, subscriptions) depending on whether Apple
classifies them as "digital goods consumed in-app" or exempt "B2B
real-world services" — a case-by-case call that needs to be documented in
App Review notes. Both documents propose the same fallback for a borderline
classification: "gate paid flows behind the web app." **A full-tree search
found zero code anywhere that detects the app is running inside the native
Capacitor shell** (`Capacitor.isNativePlatform()` or any equivalent) — the
mitigation the team's own docs propose has no supporting implementation at
all. If the classification call at submission time turns out to need
gating, engineering would be starting from zero under review-deadline
pressure, not flipping a flag.

**Why this was not fixed directly**: which specific paid flows (if any)
need gating is a business/legal classification decision this session
cannot make — the existing docs are correct to flag it as pending that
judgment call, and guessing at an implementation (which components to hide,
what "gated" should look like to a user) risks either needlessly
suppressing revenue-generating flows or still not satisfying Apple if the
guess is wrong. Tracked as a task requiring the classification decision
first; the mechanical implementation (a small `Capacitor.isNativePlatform()`
helper + conditionally rendering specific components) is straightforward
once that decision is made.

## Areas confirmed sound (no fix needed)

- ATS strictness: re-confirmed by reading `capacitor.config.ts` in full —
  `cleartext: false`, no `NSAllowsArbitraryLoads`-equivalent, no insecure
  origins.
- No deceptive external-purchase language: searched the Pricing page and
  account/seat-settings pages for steering language ("save X% by paying on
  our website," "skip the App Store fee," etc.) — none found.
- Account deletion reachability from the native shell: confirmed the
  deletion UI is standard in-app SPA routing with no `window.open` or
  external-navigation pattern that could behave differently inside a
  Capacitor managed webview.
- No native project directories (`ios/`, `android/`) are committed —
  correctly gitignored, consistent with a "generate on the Mac when
  needed" workflow rather than an oversight or missing setup step.

## Regression

- `npm run lint`: 0 errors (44 pre-existing warnings, unchanged) — the only
  code-adjacent change this section is a non-JS/TS privacy manifest file
- `npm run build` (SPA): clean
- `npm --prefix server run build`: clean
- `npm test`: 72/72 passing
- Privacy manifest fix verified via XML well-formedness (see Finding 1) —
  the strongest verification available without macOS/Xcode tooling, which
  this environment genuinely does not have.
