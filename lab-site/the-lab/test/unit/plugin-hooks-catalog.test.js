// AD-3: the broadened addon event/hook catalog. These tests lock the ADR-0013
// bus invariants for the new events:
//  - every catalog event is subscribable and dispatches its ID-only payload,
//  - a throwing/slow subscriber is isolated (best-effort / fail-closed): the
//    emit still settles and a sibling handler still fires,
//  - the registry is STATIC: unknown event names are refused on both subscribe
//    and emit (no dynamic events).
//
// Runs against the raw bus (hooks.js) with the audit sink mocked — no DB, no
// network, deterministic.

jest.mock("@/lib/audit", () => ({
  __esModule: true,
  auditLog: jest.fn(),
  default: { auditLog: jest.fn() },
}));

import {
  CORE_EVENTS,
  onHook,
  offPlugin,
  emitHook,
  _resetHooks,
} from "@/lib/plugins/hooks";
import { auditLog } from "@/lib/audit";

// The events added in AD-3 (plus the pre-existing four they extend).
const NEW_EVENTS = [
  "member.updated",
  "checkin.created",
  "bounty.created",
  "bounty.updated",
  "payment.succeeded",
  "contact.submitted",
  "repair.created",
  "repair.updated",
  "announcement.published",
];

// A representative ID-only payload per event, matching the documented contract.
const SAMPLE_PAYLOAD = {
  "member.registered": { userID: "u1" },
  "member.updated": { userID: "u1" },
  "membership.activated": { userID: "u1", type: "co-op" },
  "membership.suspended": { userID: "u1" },
  "member.deleted": { userID: "u1" },
  "checkin.created": { userID: "u1" },
  "bounty.created": { bountyID: "b1" },
  "bounty.updated": { bountyID: "b1", status: "verified" },
  "payment.succeeded": { paymentID: "p1", subscriptionID: "s1" },
  "contact.submitted": { submissionID: "c1" },
  "repair.created": { repairID: "r1" },
  "repair.updated": { repairID: "r1", status: "pending" },
  "announcement.published": { announcementID: "a1" },
};

// Fields that must NEVER appear in an event payload (PII / secrets).
const FORBIDDEN_KEYS = [
  "email",
  "name",
  "phone",
  "message",
  "password",
  "token",
  "secret",
  "amount",
];

beforeEach(() => {
  jest.clearAllMocks();
  _resetHooks();
});

test("every new AD-3 event is present and frozen in the catalog", () => {
  for (const ev of NEW_EVENTS) {
    expect(Object.values(CORE_EVENTS)).toContain(ev);
  }
  expect(Object.isFrozen(CORE_EVENTS)).toBe(true);
});

describe("each catalog event dispatches its ID-only payload to a subscriber", () => {
  for (const [event, payload] of Object.entries(SAMPLE_PAYLOAD)) {
    test(`${event} -> handler receives exactly the payload`, async () => {
      const handler = jest.fn();
      onHook(event, "test-plugin", handler);

      await emitHook(event, payload);

      expect(handler).toHaveBeenCalledTimes(1);
      const received = handler.mock.calls[0][0];
      expect(received).toEqual(payload);
      // ID-only invariant: no PII/secret key in the delivered payload.
      for (const key of Object.keys(received)) {
        expect(FORBIDDEN_KEYS).not.toContain(key);
      }
    });
  }
});

test("a throwing subscriber is isolated — emit still settles, sibling still fires, failure audited", async () => {
  const boom = jest.fn(() => {
    throw new Error("handler blew up");
  });
  const ok = jest.fn();
  onHook(CORE_EVENTS.REPAIR_CREATED, "bad-plugin", boom);
  onHook(CORE_EVENTS.REPAIR_CREATED, "good-plugin", ok);

  // Best-effort: awaiting the emit never rejects even though a handler throws.
  await expect(
    emitHook(CORE_EVENTS.REPAIR_CREATED, { repairID: "r1" })
  ).resolves.toBeUndefined();

  expect(boom).toHaveBeenCalledTimes(1);
  expect(ok).toHaveBeenCalledTimes(1); // sibling not affected by the throw
  // The failure is audited (ID-only context: pluginId + event, no payload).
  expect(auditLog).toHaveBeenCalledWith(
    "plugin.hook.failed",
    expect.objectContaining({ actor: { pluginId: "bad-plugin" }, outcome: "error" })
  );
});

test("a slow/rejecting async subscriber does not break the emit or siblings", async () => {
  const slowReject = jest.fn(async () => {
    await Promise.resolve();
    throw new Error("async failure");
  });
  const ok = jest.fn();
  onHook(CORE_EVENTS.PAYMENT_SUCCEEDED, "flaky", slowReject);
  onHook(CORE_EVENTS.PAYMENT_SUCCEEDED, "steady", ok);

  await expect(
    emitHook(CORE_EVENTS.PAYMENT_SUCCEEDED, { paymentID: "p1", subscriptionID: "s1" })
  ).resolves.toBeUndefined();
  expect(ok).toHaveBeenCalledTimes(1);
});

test("static registry: subscribing to an unknown event is refused", () => {
  expect(() => onHook("member.hacked", "evil", () => {})).toThrow(/Unknown hook event/);
});

test("static registry: emitting an unknown event is refused", async () => {
  await expect(emitHook("totally.made.up", { userID: "u1" })).rejects.toThrow(
    /Refusing to emit unknown event/
  );
});

test("offPlugin unbinds a plugin from a new event so it stops receiving", async () => {
  const handler = jest.fn();
  onHook(CORE_EVENTS.CHECKIN_CREATED, "p", handler);
  offPlugin("p");
  await emitHook(CORE_EVENTS.CHECKIN_CREATED, { userID: "u1" });
  expect(handler).not.toHaveBeenCalled();
});
