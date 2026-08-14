const { makeHookTrigger } = require('./makeHookTrigger');

module.exports = makeHookTrigger({
  key: 'invoice_paid',
  eventType: 'invoice.paid',
  noun: 'Paid Invoice',
  label: 'Invoice Paid',
  description: 'Triggers when an invoice your organization issued on Divini Partners is marked fully paid.',
  sample: {
    id: 'invoice.paid:2026-08-14T00:00:00.000Z',
    invoice_id: '00000000-0000-0000-0000-000000000000',
    event_id: '00000000-0000-0000-0000-000000000000',
    total: '3150.00',
    event_type: 'invoice.paid',
    occurred_at: '2026-08-14T00:00:00.000Z',
  },
});
