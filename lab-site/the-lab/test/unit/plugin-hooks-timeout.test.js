// #210: the addon hook bus bounds each handler dispatch with a timeout so a
// slow/hanging vetted plugin cannot add latency to the awaited domain action
// (the Square payment webhook path especially — Square times out ~10s).
//
// These tests lock the new bound WITHOUT weakening the existing fail-closed
// isolation:
//  - a handler that never resolves is bounded by HOOK_HANDLER_TIMEOUT_MS: the
//    emit settles at ~the bound, the hang is audited (shape-only), and a SIBLING
//    handler still fires (the hang neither blocks siblings nor the emitter),
//  - a normal fast handler is unaffected (no timeout audit, runs to completion),
//  - throw + async-reject isolation is still audited as `plugin.hook.failed`,
//    not confused with a timeout.
//
// Fake timers + a never-resolving promise keep this deterministic and fast — no
// real 2s wait. Runs against the raw bus (hooks.js) with the audit sink mocked.

jest.mock("@/lib/audit", () => ({
  __esModule: true,
  auditLog: jest.fn(),
  default: { auditLog: jest.fn() },
}));

import {
  CORE_EVENTS,
  onHook,
  emitHook,
  _resetHooks,
  HOOK_HANDLER_TIMEOUT_MS,
} from "@/lib/plugins/hooks";
import { auditLog } from "@/lib/audit";

beforeEach(() => {
  jest.clearAllMocks();
  _resetHooks();
});

afterEach(() => {
  jest.useRealTimers();
});

test("HOOK_HANDLER_TIMEOUT_MS is a sane positive bound below the ~10s webhook budget", () => {
  expect(typeof HOOK_HANDLER_TIMEOUT_MS).toBe("number");
  expect(HOOK_HANDLER_TIMEOUT_MS).toBeGreaterThan(0);
  expect(HOOK_HANDLER_TIMEOUT_MS).toBeLessThan(10_000);
});

test("a hanging handler is bounded by the timeout: emit settles, hang is audited, sibling still fires", async () => {
  jest.useFakeTimers();

  // Never resolves — models a genuinely hung/slow vetted plugin.
  const hang = jest.fn(() => new Promise(() => {}));
  const sibling = jest.fn();
  onHook(CORE_EVENTS.PAYMENT_SUCCEEDED, "slow-plugin", hang);
  onHook(CORE_EVENTS.PAYMENT_SUCCEEDED, "fast-plugin", sibling);

  let settled = false;
  const emit = emitHook(CORE_EVENTS.PAYMENT_SUCCEEDED, {
    paymentID: "p1",
    subscriptionID: "s1",
  }).then(() => {
    settled = true;
  });

  // Let microtasks flush: the sibling (fast) resolves; the emit is NOT done yet
  // because the hung handler is still pending, held only by the timer.
  await jest.advanceTimersByTimeAsync(0);
  expect(sibling).toHaveBeenCalledTimes(1); // hang did not block the sibling
  expect(settled).toBe(false); // emitter still awaiting the bound, not the hang

  // Advance to the bound: the timeout wins the race for the hung handler.
  await jest.advanceTimersByTimeAsync(HOOK_HANDLER_TIMEOUT_MS);
  await emit;
  expect(settled).toBe(true); // emit resolved at ~the bound, not indefinitely

  // The hang is audited shape-only (pluginId + event + timeout, no payload)...
  expect(auditLog).toHaveBeenCalledWith(
    "plugin.hook.timeout",
    expect.objectContaining({
      actor: { pluginId: "slow-plugin" },
      target: CORE_EVENTS.PAYMENT_SUCCEEDED,
      outcome: "timeout",
    })
  );
  // ...and nothing in the audit context leaks the payload IDs/PII.
  const timeoutCall = auditLog.mock.calls.find((c) => c[0] === "plugin.hook.timeout");
  expect(JSON.stringify(timeoutCall[1])).not.toContain("p1");
  expect(JSON.stringify(timeoutCall[1])).not.toContain("s1");
  // The fast sibling was never treated as a timeout or a failure.
  expect(auditLog).not.toHaveBeenCalledWith("plugin.hook.failed", expect.anything());
});

test("a hanging handler does not stall a sibling registered AFTER it", async () => {
  jest.useFakeTimers();

  const order = [];
  const hang = jest.fn(() => new Promise(() => {}));
  const sibling = jest.fn(() => {
    order.push("sibling");
  });
  // hung plugin first, so a naive sequential await would starve the sibling.
  onHook(CORE_EVENTS.CHECKIN_CREATED, "hung", hang);
  onHook(CORE_EVENTS.CHECKIN_CREATED, "quick", sibling);

  const emit = emitHook(CORE_EVENTS.CHECKIN_CREATED, { userID: "u1" });

  await jest.advanceTimersByTimeAsync(0);
  expect(order).toEqual(["sibling"]); // sibling ran immediately, not after 2s

  await jest.advanceTimersByTimeAsync(HOOK_HANDLER_TIMEOUT_MS);
  await expect(emit).resolves.toBeUndefined();
});

test("a normal fast handler is unaffected: runs to completion, no timeout audit", async () => {
  jest.useFakeTimers();

  const fast = jest.fn(async () => "done");
  onHook(CORE_EVENTS.BOUNTY_CREATED, "fast-plugin", fast);

  const emit = emitHook(CORE_EVENTS.BOUNTY_CREATED, { bountyID: "b1" });
  // No timer advance beyond microtask flush — a fast handler must settle on its own.
  await jest.advanceTimersByTimeAsync(0);
  await expect(emit).resolves.toBeUndefined();

  expect(fast).toHaveBeenCalledTimes(1);
  expect(fast).toHaveBeenCalledWith({ bountyID: "b1" });
  expect(auditLog).not.toHaveBeenCalled(); // neither timeout nor failure
});

test("a synchronous throw is still isolated and audited as a failure (not a timeout)", async () => {
  // Real timers: a throw settles in a microtask, well before any bound.
  const boom = jest.fn(() => {
    throw new Error("handler blew up");
  });
  const ok = jest.fn();
  onHook(CORE_EVENTS.REPAIR_CREATED, "bad-plugin", boom);
  onHook(CORE_EVENTS.REPAIR_CREATED, "good-plugin", ok);

  await expect(
    emitHook(CORE_EVENTS.REPAIR_CREATED, { repairID: "r1" })
  ).resolves.toBeUndefined();

  expect(boom).toHaveBeenCalledTimes(1);
  expect(ok).toHaveBeenCalledTimes(1);
  expect(auditLog).toHaveBeenCalledWith(
    "plugin.hook.failed",
    expect.objectContaining({ actor: { pluginId: "bad-plugin" }, outcome: "error" })
  );
  expect(auditLog).not.toHaveBeenCalledWith("plugin.hook.timeout", expect.anything());
});

test("an async rejection is still isolated and audited as a failure (not a timeout)", async () => {
  const asyncReject = jest.fn(async () => {
    await Promise.resolve();
    throw new Error("async failure");
  });
  const ok = jest.fn();
  onHook(CORE_EVENTS.MEMBER_UPDATED, "flaky", asyncReject);
  onHook(CORE_EVENTS.MEMBER_UPDATED, "steady", ok);

  await expect(
    emitHook(CORE_EVENTS.MEMBER_UPDATED, { userID: "u1" })
  ).resolves.toBeUndefined();

  expect(ok).toHaveBeenCalledTimes(1);
  expect(auditLog).toHaveBeenCalledWith(
    "plugin.hook.failed",
    expect.objectContaining({ actor: { pluginId: "flaky" }, outcome: "error" })
  );
  expect(auditLog).not.toHaveBeenCalledWith("plugin.hook.timeout", expect.anything());
});
