/**
 * Live integration test against a REAL running Divini Partners server (no
 * mocking). Requires:
 *   DIVINI_TEST_BASE_URL - e.g. http://localhost:8097
 *   DIVINI_TEST_API_KEY  - a real dvp_live_... key for a test org
 *   DIVINI_TEST_WEBHOOK_ID - id of a webhook endpoint already registered on
 *                            that org (created by the test harness before
 *                            this file runs, so performUnsubscribe has a
 *                            real endpoint to delete)
 * Skips entirely (not a failure) when these are not set, so this file is
 * safe to leave in the repo without requiring every checkout to run a
 * server. See ../../scripts/run-zapier-live-test.sh for how CI/manual
 * verification wires these up against a disposable database.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const zapier = require('zapier-platform-core');
const App = require('../index');

const BASE_URL = process.env.DIVINI_TEST_BASE_URL;
const API_KEY = process.env.DIVINI_TEST_API_KEY;

const appTester = BASE_URL && API_KEY ? zapier.createAppTester(App) : null;

function bundle(extra) {
  return {
    authData: { baseUrl: BASE_URL, apiKey: API_KEY },
    ...extra,
  };
}

test('authentication.test succeeds with a real API key', { skip: !appTester }, async () => {
  const result = await appTester(App.authentication.test, bundle());
  assert.ok(result, 'expected a response body');
});

test('authentication.test fails with a bad API key', { skip: !appTester }, async () => {
  await assert.rejects(
    () => appTester(App.authentication.test, { authData: { baseUrl: BASE_URL, apiKey: 'dvp_live_not_a_real_key' } }),
  );
});

test('quote_awarded trigger: subscribe then unsubscribe a real webhook endpoint', { skip: !appTester }, async () => {
  const trigger = App.triggers.quote_awarded;
  const subscribed = await appTester(
    trigger.operation.performSubscribe,
    bundle({ targetUrl: 'https://hooks.zapier.com/test/fake-target' }),
  );
  assert.ok(subscribed.id, 'expected the created webhook endpoint to have an id');
  assert.equal(subscribed.url, 'https://hooks.zapier.com/test/fake-target');
  assert.deepEqual(subscribed.event_types, ['quote.awarded']);

  await appTester(
    trigger.operation.performUnsubscribe,
    bundle({ subscribeData: subscribed }),
  );

  // Confirm it is really gone: fetching its deliveries should now 404 or
  // fail with a not-found style error, since performUnsubscribe deleted it.
  await assert.rejects(() =>
    appTester(
      (z, b) => z.request({ url: `${b.authData.baseUrl}/api/webhooks/${subscribed.id}/deliveries` }),
      bundle(),
    ),
  );
});

test('invoice_paid and event_status_changed triggers also subscribe/unsubscribe cleanly', { skip: !appTester }, async () => {
  for (const key of ['invoice_paid', 'event_status_changed']) {
    const trigger = App.triggers[key];
    const subscribed = await appTester(
      trigger.operation.performSubscribe,
      bundle({ targetUrl: 'https://hooks.zapier.com/test/fake-target-2' }),
    );
    assert.ok(subscribed.id);
    await appTester(trigger.operation.performUnsubscribe, bundle({ subscribeData: subscribed }));
  }
});

test('quote_awarded perform() unwraps a real inbound webhook delivery shape', () => {
  const trigger = App.triggers.quote_awarded;
  const cleanedRequest = {
    type: 'quote.awarded',
    created_at: '2026-08-14T00:00:00.000Z',
    data: { quote_id: 'abc', event_id: 'def', vendor_id: 'ghi', contract_id: 'jkl', amount: 3150 },
  };
  const results = trigger.operation.perform(null, { cleanedRequest });
  assert.equal(results.length, 1);
  assert.equal(results[0].quote_id, 'abc');
  assert.equal(results[0].event_type, 'quote.awarded');
});
