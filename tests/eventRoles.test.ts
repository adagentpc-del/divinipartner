/**
 * Regression tests for the event-level RBAC role vocabulary and invitation-
 * recipient matching logic (lib/eventRoles.ts), built for the Divini
 * Partners 63-section Event Operations spec, Phase A items 1-3 (2026-08-09).
 *
 * isInvitationRecipient is the adversarial-security-critical piece: a live-
 * verified bug class this guards against is a stale event invitation being
 * accepted by the WRONG account. Covers: correct id match, correct email-only
 * match for an external not-yet-registered invitee, wrong id rejected even
 * with a matching email is impossible to construct once an id is resolved
 * (checked via the "id resolved -> email must not be considered" case),
 * wrong email rejected, and case-insensitive email matching.
 *
 * Run via the package.json test script (node --test with strip-types).
 * Zero em dashes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isEventRole,
  isInvitableEventRole,
  isInvitationRecipient,
  isInvitationExpired,
  EVENT_ROLES,
  INVITABLE_EVENT_ROLES,
} from "../server/src/lib/eventRoles.ts";

test("event_owner is a valid role but never an invitable one", () => {
  assert.equal(isEventRole("event_owner"), true);
  assert.equal(isInvitableEventRole("event_owner"), false);
  assert.equal(INVITABLE_EVENT_ROLES.includes("event_owner" as never), false);
  assert.equal(EVENT_ROLES.includes("event_owner"), true);
});

test("every non-owner role is both a valid role and invitable", () => {
  for (const role of INVITABLE_EVENT_ROLES) {
    assert.equal(isEventRole(role), true);
    assert.equal(isInvitableEventRole(role), true);
  }
});

test("garbage role strings are rejected by both checks", () => {
  assert.equal(isEventRole("super_admin"), false);
  assert.equal(isEventRole("vendor"), false);
  assert.equal(isEventRole(""), false);
  assert.equal(isInvitableEventRole("owner"), false);
});

test("recipient match: resolved user_id must match exactly, email is ignored once resolved", () => {
  const invite = { recipientUserId: "user-A", recipientEmail: "a@test.local" };
  assert.equal(
    isInvitationRecipient({ actorUserId: "user-A", actorEmail: "a@test.local", ...invite }),
    true,
  );
  // A different account with the SAME email as the invite (e.g. after the
  // invitee's address was later reassigned) must NOT be accepted once the
  // invite already pinned a specific user_id at send time.
  assert.equal(
    isInvitationRecipient({ actorUserId: "user-B", actorEmail: "a@test.local", ...invite }),
    false,
  );
  // The correct user, but signed in under a different email on their
  // account, still matches on id -- id is authoritative once resolved.
  assert.equal(
    isInvitationRecipient({ actorUserId: "user-A", actorEmail: "other@test.local", ...invite }),
    true,
  );
});

test("recipient match: external invite (no resolved user_id) falls back to case-insensitive email", () => {
  const invite = { recipientUserId: null, recipientEmail: "External@Test.Local" };
  assert.equal(
    isInvitationRecipient({ actorUserId: "any-id", actorEmail: "external@test.local", ...invite }),
    true,
  );
  assert.equal(
    isInvitationRecipient({ actorUserId: "any-id", actorEmail: "wrong@test.local", ...invite }),
    false,
  );
  assert.equal(
    isInvitationRecipient({ actorUserId: "any-id", actorEmail: null, ...invite }),
    false,
  );
});

test("expiry: a future timestamp is not expired, a past one is", () => {
  const now = Date.parse("2026-08-09T00:00:00Z");
  assert.equal(isInvitationExpired("2026-08-23T00:00:00Z", now), false);
  assert.equal(isInvitationExpired("2026-08-01T00:00:00Z", now), true);
  assert.equal(isInvitationExpired("2026-08-09T00:00:00Z", now), false);
});
