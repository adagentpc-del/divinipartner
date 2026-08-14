/**
 * Shared factory for the three REST Hook triggers this app exposes. A
 * "subscribe" registers a real webhook endpoint (server/src/routes/webhooks.ts
 * POST /webhooks) scoped to exactly this event type and pointed at Zapier's
 * bundle.targetUrl; "unsubscribe" deletes that same endpoint. Zap payloads
 * arrive already shaped as { type, created_at, data } (see
 * server/src/lib/webhooks.ts's emitWebhookEvent) -- perform() just unwraps
 * the single incoming delivery, performList() pulls the endpoint's real
 * recent delivery history so "Test this step" in the Zap editor has real
 * sample data instead of a fabricated one.
 */
function makeHookTrigger({ key, eventType, noun, label, description, sample }) {
  return {
    key,
    noun,
    display: { label, description },
    operation: {
      type: 'hook',
      canPaginate: false,

      performSubscribe: async (z, bundle) => {
        const response = await z.request({
          url: `${bundle.authData.baseUrl}/api/webhooks`,
          method: 'POST',
          body: {
            url: bundle.targetUrl,
            event_types: [eventType],
          },
        });
        return response.data.endpoint;
      },

      performUnsubscribe: async (z, bundle) => {
        const endpointId = bundle.subscribeData && bundle.subscribeData.id;
        if (!endpointId) return {};
        return z.request({
          url: `${bundle.authData.baseUrl}/api/webhooks/${endpointId}`,
          method: 'DELETE',
        });
      },

      // A real webhook delivery landed -- Zapier hands it back to us as
      // bundle.cleanedRequest. The whole point of a hook trigger.
      perform: (z, bundle) => {
        const body = bundle.cleanedRequest;
        return [body && body.data ? { id: `${eventType}:${body.created_at}`, ...body.data, event_type: body.type, occurred_at: body.created_at } : body];
      },

      // Fallback used only when setting up the Zap ("Test this trigger")
      // before any real delivery has ever happened -- pulls this endpoint's
      // actual delivery history rather than inventing a fake sample.
      performList: async (z, bundle) => {
        const endpointId = bundle.subscribeData && bundle.subscribeData.id;
        if (!endpointId) return [sample];
        const response = await z.request({
          url: `${bundle.authData.baseUrl}/api/webhooks/${endpointId}/deliveries`,
        });
        const deliveries = (response.data.deliveries || []).filter((d) => d.event_type === eventType);
        if (deliveries.length === 0) return [sample];
        return deliveries.map((d) => ({
          id: `${eventType}:${d.created_at}`,
          ...d.payload.data,
          event_type: d.event_type,
          occurred_at: d.created_at,
        }));
      },

      sample,
    },
  };
}

module.exports = { makeHookTrigger };
