# A3 Partner Portal API Server

Express 5 + Drizzle backend for the A3 Partner Commerce Portal. See `replit.md`
at the repo root for the high-level architecture.

## Venue Asset Survey integration (Task #5)

The portal ingests venue assets from A3's external **Venue Asset Survey** app
in two ways:

### 1. Webhook push (preferred)

```
POST /api/public/integrations/asset-survey/<partner-slug>
```

- Headers: `X-Survey-Signature: sha256=<hex>` — HMAC-SHA256 of the **raw
  request body** keyed by the partner's `webhookSecret`. The optional
  `sha256=` prefix is accepted for compatibility.
- Body: `{ assets: SurveyAssetPayload[] }` — see `surveyIntegration.ts` for
  the exact Zod shape. Each payload must include `externalAssetId`, `name`,
  and any combination of public + internal fields. Internal fields under the
  `internal` sub-object are stored but never reflected on `/public/*`
  responses.
- Auth: no Clerk session. The HMAC signature is the sole authentication. If
  the partner has no integration row, no `webhookSecret`, or `isEnabled` is
  false, the request is rejected with `403`.
- Idempotency: rows are upserted on `(partnerId, externalAssetId)`.

### 2. Admin pull (fallback / re-sync)

```
POST /api/admin/integrations/asset-survey/pull/:partnerId
```

- Auth: Clerk session.
- Reads the partner's `apiBaseUrl` + resolves the bearer token from the env
  var named in `apiKeySecretName` (e.g. `VENUE_SURVEY_API_KEY`). The actual
  token value is **never stored in the database** — only the env var name is
  persisted.
- Calls `GET <apiBaseUrl>/v1/assets?partnerId=<externalPartnerId>` and runs
  the same upsert logic as the webhook.

### Setting up a new partner integration

1. Open the partner's edit page and click **Venue Survey**.
2. Click **Generate secret** — copy the revealed webhook secret and configure
   it in the Survey app.
3. (Optional) Enter the survey app's API base URL and an env-var name (e.g.
   `VENUE_SURVEY_API_KEY`) for the bearer token. Set the actual token as a
   Replit Secret with that name. The UI shows whether the env var resolves
   on the running server.
4. Approve incoming assets in **Catalog → Survey Imports** before they appear
   on the partner's public portal.

### Public projection guarantee

`toPublicSurveyAsset()` (in `lib/db/src/schema/surveyAssets.ts`) strips every
internal / A3-only field. The regression test
`src/__tests__/surveyAssetProjection.test.ts` fails if internal field names
or sample values ever leak through.
