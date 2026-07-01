# 52 Compliance

Source: Divini-Go-Live-Runbook.md, Divini-Security-and-iOS-Hardening-Summary.md, IOS-APP-STORE-RUNBOOK.md, and the legal pages in `src/pages/`.

## Legal pages (in product)

- Terms of Service plus five policies are shipped as reachable routes:
  - `src/pages/Terms.tsx`
  - `src/pages/Privacy.tsx`
  - `src/pages/PaymentPolicy.tsx`
  - `src/pages/MarketplaceConduct.tsx`
  - `src/pages/NonCircumvention.tsx`

## Payments posture (not a party / third-party payment)

- The platform's intended posture is that it does NOT hold funds. Funds settle to the vendor (via Stripe Connect) and the platform takes only an application fee.
- The "we do not hold funds" language in Terms/policies must match the actual Stripe Connect setup before enabling real money.
- The on-top fee is presented transparently to the client; the vendor receives the full quote. Anti-circumvention / non-circumvention policy backs the leakage-recovery mechanics.

## Attorney-review flags (must clear before real money)

- Counsel must review the Terms + 5 policies. Specific points flagged:
  - Governing law: Florida.
  - Liability cap.
  - Arbitration / class-action waiver.
  - Consumer-protection nuance.
- Confirm the not-a-party / third-party-payment framing is consistent with the Stripe Connect flow.

## App Store / iOS compliance

- Account deletion (Apple Guideline 5.1.1(v)): in-app account deletion must be reachable (not deactivation, not "email us"). The deletion UI lives in the hosted web app and must be reachable from the native shell; verify end-to-end and note the path for App Review.
- Payments (IAP vs external): Apple requires IAP for digital goods/subscriptions consumed in-app, but B2B marketplace transactions for real-world services are generally not required to use IAP (case-by-case). Items to classify and document rationale for in App Review notes: paid placements, listing fees, subscriptions, the Featured Vendor $49/mo upgrade. If borderline, gate paid flows behind the web app; no deceptive external-purchase links.
- Privacy manifest: `mobile/PrivacyInfo.xcprivacy` declares data types (name, email, payment info, user content, identifiers, usage data) all with `NSPrivacyTracking = false`, and required-reason APIs (UserDefaults CA92.1, File timestamp C617.1). The App Store Connect privacy nutrition label must match exactly.
- ATS: stays strict (no `NSAllowsArbitraryLoads`); both sites are HTTPS-only, `cleartext false`.

## Data protection

- Sensitive vendor documents: recommended S3 + encryption at rest + bucket versioning + backups before scaling. Encryption key backed up separately. (See `51_SECURITY.md`, OBJECT-STORAGE.md.)
- Email domain authentication: SPF/DKIM/DMARC for the `EMAIL_FROM` domain.

## Status

- Legal pages exist in product. Counsel review is outstanding (Task T8). Real money (Stripe) is intentionally deferred until the above clears.

> TODO(owner): Record completion of counsel review and any redlines, and confirm the final governing-law / arbitration terms once signed off.
