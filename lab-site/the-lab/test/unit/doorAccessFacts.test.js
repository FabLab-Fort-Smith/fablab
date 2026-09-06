// Maps a core user record → the FACTS the policy engine reads. Only membership-derived
// fields are projected; no good-standing decision is made here.

import { factsFromUser } from "@/plugins/door-access-controller/facts";

test("projects an active member", () => {
  const f = factsFromUser({
    userID: "u1",
    role: "member",
    membership: { type: "co-op", status: "active", subscriptionStatus: "ACTIVE", isWaived: false },
  });
  expect(f).toEqual({ userID: "u1", role: "member", membershipStatus: "active", subscriptionStatus: "ACTIVE", isWaived: false, isCommunity: false });
});

test("flags community members", () => {
  expect(factsFromUser({ userID: "c1", role: "member", membership: { type: "community", status: "active" } }).isCommunity).toBe(true);
});

test("coerces waived to boolean and tolerates a missing membership", () => {
  const f = factsFromUser({ userID: "u2", role: "staff" });
  expect(f).toMatchObject({ userID: "u2", role: "staff", isWaived: false, isCommunity: false, membershipStatus: "" });
});

test("null/blank user → null (caller treats as unknown)", () => {
  expect(factsFromUser(null)).toBeNull();
  expect(factsFromUser({})).toBeNull();
});
