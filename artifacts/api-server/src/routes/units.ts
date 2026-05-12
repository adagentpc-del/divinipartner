// @ts-nocheck
import { Router } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  partnersTable,
  venuesTable,
  eventsTable,
  commercialAccountsTable,
  resolvePreference,
  ALL_UNITS,
  UNIT_LABELS,
} from "@workspace/db";
import { GetUnitsMetaResponse, GetUnitsResolveResponse } from "@workspace/api-zod";
import { sendValidated } from "../lib/validateResponse";

const router = Router();

router.get("/units/meta", (req, res) => {
  const payload = {
    units: ALL_UNITS.map(u => ({ value: u, label: UNIT_LABELS[u] })),
    systems: [
      { value: "imperial", label: "Imperial (in / ft)" },
      { value: "metric", label: "Metric (cm / m)" },
    ],
  };
  sendValidated(req, res, GetUnitsMetaResponse, payload, "Get units meta");
});

router.get("/units/resolve", async (req, res) => {
  try {
    const eventId = req.query.eventId ? Number(req.query.eventId) : null;
    const venueId = req.query.venueId ? Number(req.query.venueId) : null;
    const partnerId = req.query.partnerId ? Number(req.query.partnerId) : null;
    const accountId = req.query.accountId ? Number(req.query.accountId) : null;

    let event = null, venue = null, partner = null, account = null;
    if (eventId) {
      const [ev] = await db.select().from(eventsTable).where(eq(eventsTable.id, eventId));
      event = ev || null;
      if (ev?.venueId && !venueId) {
        const [v] = await db.select().from(venuesTable).where(eq(venuesTable.id, ev.venueId));
        venue = v || null;
      }
      if (ev?.partnerId && !partnerId) {
        const [p] = await db.select().from(partnersTable).where(eq(partnersTable.id, ev.partnerId));
        partner = p || null;
      }
    }
    if (venueId && !venue) {
      const [v] = await db.select().from(venuesTable).where(eq(venuesTable.id, venueId));
      venue = v || null;
    }
    // If we have a venue but no partner yet, derive partner from venue so the
    // cascade keeps walking up to partner → account.
    if (venue?.partnerId && !partner && !partnerId) {
      const [p] = await db.select().from(partnersTable).where(eq(partnersTable.id, venue.partnerId));
      partner = p || null;
    }
    if (partnerId && !partner) {
      const [p] = await db.select().from(partnersTable).where(eq(partnersTable.id, partnerId));
      partner = p || null;
    }
    if (partner?.commercialAccountId && !accountId && !account) {
      const [a] = await db.select().from(commercialAccountsTable).where(eq(commercialAccountsTable.id, partner.commercialAccountId));
      account = a || null;
    }
    if (accountId && !account) {
      const [a] = await db.select().from(commercialAccountsTable).where(eq(commercialAccountsTable.id, accountId));
      account = a || null;
    }

    const resolution = resolvePreference({ event, venue, partner, account });
    const payload = {
      ...resolution,
      context: {
        eventPreference: event?.unitPreference ?? null,
        venuePreference: venue?.unitPreference ?? null,
        venueCountry: venue?.country ?? null,
        partnerPreference: partner?.unitPreference ?? null,
        accountPreference: account?.unitPreference ?? null,
      },
    };
    sendValidated(req, res, GetUnitsResolveResponse, payload, "Resolve units");
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "resolve_failed" });
  }
});

export default router;
