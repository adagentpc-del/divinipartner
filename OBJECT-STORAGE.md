# Object Storage and Encryption at Rest

Divini Partners stores uploaded files (signed agreement PDFs, profile decks /
marketing collateral) through a pluggable object storage layer. The default is
local disk and is unchanged from how the app has always behaved. Everything new
is flag-gated by environment variables, so with nothing set the behavior is
identical to before.

## Providers

Select the backend with `STORAGE_PROVIDER`:

| Value            | Backend                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `local` (default)| Local disk under `FILE_STORAGE_DIR` (default `/data/procure-files`).     |
| `s3`             | Any S3-compatible service: AWS S3, Cloudflare R2, Backblaze B2, MinIO.   |

The S3 provider uses self-signed AWS Signature V4 REST requests over the built-in
`fetch` (no AWS SDK, no extra npm packages). Path-style addressing is used
(`<endpoint>/<bucket>/<key>`), which works with any custom endpoint.

### Pointing at S3 / R2 / B2 / MinIO

Set all of these:

```
STORAGE_PROVIDER=s3
S3_ENDPOINT=...        # full https URL of the S3 endpoint (no bucket in host)
S3_REGION=...          # e.g. us-east-1 (R2 uses "auto"; any value works for MinIO)
S3_BUCKET=...          # bucket name
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

Endpoint examples:

- AWS S3: `https://s3.us-east-1.amazonaws.com` with `S3_REGION=us-east-1`
- Cloudflare R2: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` with `S3_REGION=auto`
- Backblaze B2 (S3 API): `https://s3.<REGION>.backblazeb2.com` with the matching region
- MinIO (self-hosted): `https://minio.example.com` with any region your server expects

If any required `S3_*` var is missing, the app safely falls back to local disk
(`s3Enabled()` returns false), so a half-configured S3 setup never silently loses
files; it just stays local until configuration is complete.

> The bucket must already exist. Create it in your provider console before
> flipping `STORAGE_PROVIDER=s3`.

## Encryption at Rest

Encryption is optional and applies to BOTH providers.

Set a key to enable AES-256-GCM envelope encryption:

```
STORAGE_ENCRYPTION_KEY=<base64 of exactly 32 random bytes>
```

Generate one with:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

When the key is set, every object is encrypted before it is written (local file
or S3 object) and decrypted transparently on read. The stored layout is:

```
iv(12 bytes) | authTag(16 bytes) | ciphertext
```

When the key is unset, objects are stored as plaintext (the current behavior).

### IMPORTANT: losing the key loses the files

The encryption key is the ONLY thing that can decrypt your stored objects. If you
lose `STORAGE_ENCRYPTION_KEY`, every object written while it was set becomes
permanently unrecoverable. Treat it like a database password:

- Store it in your secrets manager / deploy `.env`, never in git.
- Back it up somewhere separate from the file storage itself.
- Rotating the key is not automatic: objects encrypted with the old key need the
  old key to read. Keep retired keys until their objects are migrated or deleted.

Objects written BEFORE a key was set remain plaintext and stay readable after you
turn encryption on (decrypt is a no-op when the key is unset, and newly written
objects are encrypted going forward). Turning the key OFF after objects were
encrypted will make those objects unreadable until you set the key again.

## Backups

Files are not in the database, so back them up separately.

### S3 / R2 / B2 (recommended)

- Enable bucket versioning so overwrites and deletes are recoverable.
- Add a lifecycle rule to expire old non-current versions (e.g. 30 to 90 days)
  to control cost.
- For cross-region durability, enable replication to a second bucket/region.
- If encryption at rest is enabled, remember the bucket holds ciphertext; back up
  `STORAGE_ENCRYPTION_KEY` independently or the backup is useless.

### Local disk

- Schedule a cron snapshot of `FILE_STORAGE_DIR`, for example a nightly archive:

  ```
  0 2 * * * tar czf /backups/files-$(date +\%F).tgz -C /data procure-files
  ```

- Rotate / prune old archives, and copy them off the box (another host or an
  object store) so a disk loss does not take the backups with it.
- Again, if encryption is enabled the archive is ciphertext; keep the key safe
  and backed up separately.

## How call sites use it

Application code does not branch on provider. It calls the storage helpers in
`server/src/storage.ts` (which delegate to `server/src/lib/objectStorage.ts`):

- `putObjectBytes(key, bytes, contentType?)` to store
- `getObjectBytes(key)` / `streamObject(key, res)` to read
- `objectExistsAsync(key)` to check existence
- `deleteObject(key)` to remove
- `signDownloadUrl(key)` / `verifyDownloadUrl(...)` for the short-lived
  HMAC-signed `/api/documents/download` links (unchanged contract)

Switching providers or enabling encryption is purely an environment change; no
code change is required.
