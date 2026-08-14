const { makeHookTrigger } = require('./makeHookTrigger');

module.exports = makeHookTrigger({
  key: 'quote_awarded',
  eventType: 'quote.awarded',
  noun: 'Awarded Quote',
  label: 'Quote Awarded',
  description: 'Triggers when a client awards a quote to your organization on Divini Partners.',
  sample: {
    id: 'quote.awarded:2026-08-14T00:00:00.000Z',
    quote_id: '00000000-0000-0000-0000-000000000000',
    event_id: '00000000-0000-0000-0000-000000000000',
    vendor_id: '00000000-0000-0000-0000-000000000000',
    contract_id: '00000000-0000-0000-0000-000000000000',
    amount: 3150,
    event_type: 'quote.awarded',
    occurred_at: '2026-08-14T00:00:00.000Z',
  },
});
