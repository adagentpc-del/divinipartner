const authentication = require('./authentication');
const quoteAwarded = require('./triggers/quoteAwarded');
const invoicePaid = require('./triggers/invoicePaid');
const eventStatusChanged = require('./triggers/eventStatusChanged');

const includeApiKey = (request, z, bundle) => {
  if (bundle.authData && bundle.authData.apiKey) {
    request.headers = request.headers || {};
    request.headers.Authorization = `Bearer ${bundle.authData.apiKey}`;
  }
  return request;
};

// server/src/routes.ts's shared errorHandler returns { error: "message" } on
// every failure -- surface that as the Zapier-visible error instead of a
// generic "request failed" the user would have to guess at.
const surfaceApiErrors = (response, z, bundle) => {
  if (response.status >= 400) {
    let message = `Divini Partners API returned ${response.status}`;
    try {
      const body = response.json;
      if (body && body.error) message = body.error;
    } catch (e) {
      // response wasn't JSON; keep the generic message
    }
    throw new z.errors.Error(message, 'DiviniApiError', response.status);
  }
  return response;
};

module.exports = {
  version: require('./package.json').version,
  platformVersion: require('zapier-platform-core').version,

  // Payloads already arrive in the exact shape emitWebhookEvent() sends
  // (see makeHookTrigger.js's perform()) -- disable Zapier's automatic
  // input-cleaning so what a Zap sees matches what the server actually sent.
  flags: { cleanInputData: false },

  authentication,

  beforeRequest: [includeApiKey],
  afterResponse: [surfaceApiErrors],

  triggers: {
    [quoteAwarded.key]: quoteAwarded,
    [invoicePaid.key]: invoicePaid,
    [eventStatusChanged.key]: eventStatusChanged,
  },

  searches: {},
  creates: {},
  resources: {},
};
