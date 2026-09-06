// AC-8a: session-revocation logic for the auth jwt/session callbacks. Auth/authz critical path —
// exercised in isolation (no NextAuth boot).

import { revalidateToken, deidentifyInvalidated, REVALIDATE_INTERVAL_MS } from "@/lib/sessionRevocation";

const NOW = 1_000_000_000_000;

test("throttle: a fresh checkedAt within the window skips the DB lookup", async () => {
  const getUser = jest.fn();
  const token = { userID: "u1", role: "admin", checkedAt: NOW - 60_000 }; // 1 min ago
  const out = await revalidateToken(token, { getUser, now: NOW });
  expect(getUser).not.toHaveBeenCalled();
  expect(out.invalidated).toBeUndefined();
});

test("re-check fires once the window has elapsed; existing user → checkedAt advances, role refreshes", async () => {
  const getUser = jest.fn().mockResolvedValue({ userID: "u1", role: "member" }); // demoted in DB
  const token = { userID: "u1", role: "admin", checkedAt: NOW - REVALIDATE_INTERVAL_MS - 1 };
  const out = await revalidateToken(token, { getUser, now: NOW });
  expect(getUser).toHaveBeenCalledWith("u1");
  expect(out.role).toBe("member");           // demotion propagated within the window
  expect(out.checkedAt).toBe(NOW);
  expect(out.invalidated).toBeUndefined();
});

test("FAIL OPEN: a lookup error leaves the token untouched (no mass logout), checkedAt not advanced", async () => {
  const getUser = jest.fn().mockRejectedValue(new Error("Failed to fetch user."));
  const token = { userID: "u1", role: "admin" }; // no checkedAt → would re-check
  const out = await revalidateToken(token, { getUser, now: NOW });
  expect(getUser).toHaveBeenCalled();
  expect(out.invalidated).toBeUndefined();    // NOT invalidated on error
  expect(out.role).toBe("admin");
  expect(out.checkedAt).toBeUndefined();       // failure not cached — retries next request
});

test("FAIL CLOSED: a missing account marks the token invalidated", async () => {
  const getUser = jest.fn().mockResolvedValue(null); // account deleted / purged / merged away
  const token = { userID: "u1", role: "admin" };
  const out = await revalidateToken(token, { getUser, now: NOW });
  expect(out.invalidated).toBe(true);
});

test("already-invalidated token short-circuits (no further lookups)", async () => {
  const getUser = jest.fn();
  await revalidateToken({ userID: "u1", invalidated: true }, { getUser, now: NOW });
  expect(getUser).not.toHaveBeenCalled();
});

test("deidentifyInvalidated: invalid token → session.user de-identified; downstream checks fail closed", () => {
  const session = { user: { userID: "u1", role: "admin", name: "Ada" } };
  const changed = deidentifyInvalidated(session, { invalidated: true });
  expect(changed).toBe(true);
  expect(session.user).toEqual({ invalidated: true });
  // fails closed without throwing:
  expect(session.user.role !== "admin").toBe(true);
  expect(session.user?.userID).toBeUndefined();
  expect(() => session.user.name).not.toThrow();
});

test("deidentifyInvalidated: valid token → session untouched", () => {
  const session = { user: { userID: "u1", role: "admin" } };
  expect(deidentifyInvalidated(session, { userID: "u1" })).toBe(false);
  expect(session.user).toEqual({ userID: "u1", role: "admin" });
});
