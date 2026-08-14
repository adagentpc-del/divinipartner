const { makeHookTrigger } = require('./makeHookTrigger');

module.exports = makeHookTrigger({
  key: 'event_status_changed',
  eventType: 'event.status_changed',
  noun: 'Event',
  label: 'Event Status Changed',
  description: 'Triggers when an event you own or manage on Divini Partners moves to a new lifecycle status.',
  sample: {
    id: 'event.status_changed:2026-08-14T00:00:00.000Z',
    event_id: '00000000-0000-0000-0000-000000000000',
    from: 'inquiry',
    to: 'venue_reviewing',
    event_type: 'event.status_changed',
    occurred_at: '2026-08-14T00:00:00.000Z',
  },
});
