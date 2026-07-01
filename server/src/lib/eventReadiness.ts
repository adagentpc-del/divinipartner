/**
 * Friction Elimination - U2 Event Readiness Score.
 *
 * Pure, deterministic readiness scorer. Given a set of boolean / count signals
 * gathered from the event record (see server/src/db/event-intel.ts), it returns
 * a 0..100 score, a per-dimension breakdown, and the list of missing items the
 * owner still needs to address. No DB calls, no network, no AI. Same inputs
 * always produce the same output.
 *
 * The seven readiness dimensions (per the addendum, U2):
 *   - venue selected
 *   - vendors selected
 *   - insurance uploaded
 *   - guest list complete
 *   - contracts signed
 *   - payments made
 *   - timeline built
 *
 * Each dimension is weighted; the score is the weighted percentage of
 * satisfied dimensions. The breakdown exposes per-dimension status so the UI
 * can render a checklist.
 */

export type ReadinessSignals = {
  venueSelected: boolean;
  vendorsSelected: boolean;
  insuranceUploaded: boolean;
  guestListComplete: boolean;
  contractsSigned: boolean;
  paymentsMade: boolean;
  timelineBuilt: boolean;
};

export type ReadinessDimension = {
  key: keyof ReadinessSignals;
  label: string;
  satisfied: boolean;
  weight: number; // contribution to the 100-point total
  detail: string; // what satisfies it / what is missing
};

export type ReadinessResult = {
  score: number; // 0..100
  breakdown: ReadinessDimension[];
  missing: string[]; // human labels of unsatisfied dimensions
};

/**
 * Dimension definitions: weight + the label shown in the UI + the messaging
 * for satisfied vs missing. Weights sum to 100 so a fully ready event scores
 * exactly 100. Venue and vendors carry the most weight (an event cannot happen
 * without them); the operational items round it out.
 */
const DIMENSIONS: {
  key: keyof ReadinessSignals;
  label: string;
  weight: number;
  done: string;
  missing: string;
}[] = [
  {
    key: "venueSelected",
    label: "Venue selected",
    weight: 20,
    done: "A venue is attached to the event.",
    missing: "Select and attach a venue.",
  },
  {
    key: "vendorsSelected",
    label: "Vendors selected",
    weight: 20,
    done: "At least one vendor is attached or quoting.",
    missing: "Add the vendors the event needs.",
  },
  {
    key: "insuranceUploaded",
    label: "Insurance uploaded",
    weight: 15,
    done: "An insurance certificate is on file.",
    missing: "Upload the certificate(s) of insurance.",
  },
  {
    key: "guestListComplete",
    label: "Guest list complete",
    weight: 10,
    done: "The guest list is built out toward the expected count.",
    missing: "Build out the guest list.",
  },
  {
    key: "contractsSigned",
    label: "Contracts signed",
    weight: 15,
    done: "Vendor contracts / quotes are accepted.",
    missing: "Get vendor contracts and quotes signed.",
  },
  {
    key: "paymentsMade",
    label: "Payments made",
    weight: 10,
    done: "At least one payment has been recorded.",
    missing: "Record deposits and payments.",
  },
  {
    key: "timelineBuilt",
    label: "Timeline built",
    weight: 10,
    done: "An itinerary / run-of-show exists.",
    missing: "Build the event timeline.",
  },
];

/**
 * Compute the 0..100 readiness score, per-dimension breakdown, and the list of
 * missing item labels. Pure and deterministic.
 */
export function computeEventReadiness(signals: ReadinessSignals): ReadinessResult {
  const breakdown: ReadinessDimension[] = DIMENSIONS.map((d) => {
    const satisfied = !!signals[d.key];
    return {
      key: d.key,
      label: d.label,
      satisfied,
      weight: d.weight,
      detail: satisfied ? d.done : d.missing,
    };
  });

  const earned = breakdown.reduce((s, d) => s + (d.satisfied ? d.weight : 0), 0);
  const total = DIMENSIONS.reduce((s, d) => s + d.weight, 0) || 1;
  const score = Math.round((earned / total) * 100);

  const missing = breakdown.filter((d) => !d.satisfied).map((d) => d.label);

  return { score, breakdown, missing };
}
