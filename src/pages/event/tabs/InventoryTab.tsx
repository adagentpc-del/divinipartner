import React from 'react';
import InventoryManager from '../../inventory/InventoryManager';

/**
 * Inventory tab. Inventory is the org's rental catalog (blueprint 12.2), scoped
 * to the organization rather than a single event, so the full manager embeds
 * directly. Its own empty state covers the no-items case. Zero em dashes.
 */
export default function InventoryTab(_props: { eventId: string }) {
  return <InventoryManager />;
}
