import React from 'react';
import Reviews from '../../reviews/Reviews';

/**
 * Reviews tab. Reviews (given, received, requests, and the composer) are scoped
 * to the organization relationships rather than a single event, and the reviews
 * API carries no event filter, so the full Reviews surface embeds directly. Its
 * own empty states cover the no-reviews case. Zero em dashes.
 */
export default function ReviewsTab(_props: { eventId: string }) {
  return <Reviews />;
}
