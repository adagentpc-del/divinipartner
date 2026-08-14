/**
 * Divini Partners API key auth. The user pastes a key generated at
 * Profile -> Account -> Developer (server/src/routes/api-keys.ts), sent as
 * `Authorization: Bearer <key>` on every request -- the exact same header a
 * session JWT uses, since server/src/auth.ts resolves an API key
 * (`dvp_live_...` prefix) to the creating user's Actor before any route
 * handler runs. There is no separate Zapier-specific auth path on the
 * server; this integration is just another API-key client.
 */
const testAuth = (z, bundle) =>
  z.request({
    // /webhooks/meta requires only requireUser (no org, no data returned
    // beyond the static event-type list), so it is the lightest possible
    // "is this key valid" check that never leaks account data.
    url: `${bundle.authData.baseUrl}/api/webhooks/meta`,
  });

module.exports = {
  type: 'custom',
  fields: [
    {
      key: 'baseUrl',
      label: 'Divini Partners URL',
      type: 'string',
      required: true,
      default: 'https://app.divinipartners.com',
      helpText:
        'Your Divini Partners deployment URL, no trailing slash. See https://app.divinipartners.com/account/developer.',
    },
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      helpText:
        'Generate one at https://app.divinipartners.com/account/developer (Profile -> Account -> Developer). It starts with "dvp_live_".',
    },
  ],
  test: testAuth,
  connectionLabel: '{{bundle.authData.baseUrl}}',
};
