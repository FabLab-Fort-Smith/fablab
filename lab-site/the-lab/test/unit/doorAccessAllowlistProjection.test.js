// allowedDoorsForFacts: the time-independent projection used to build the offline snapshot —
// which doors + windows a member gets, everything decide() checks except `now`.

import { allowedDoorsForFacts } from "@/plugins/door-access-controller/policy";

const DOORS = [{ doorId: "front" }, { doorId: "lab" }, { doorId: "vault" }];
const MEMBER_RULE = { id: "member-hours", roles: ["member"], doors: ["front", "lab"], windows: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }] };
const LAB_247 = { id: "lab-247", roles: ["member"], doors: ["lab"] }; // no windows → 24/7
const basePolicy = (over = {}) => ({ rules: [MEMBER_RULE], accountOverrides: {}, requireGoodStanding: true, allowAdminBypass: true, defaultTimezone: "America/Chicago", ...over });

const member = { userID: "u1", role: "member", membershipStatus: "active", subscriptionStatus: "ACTIVE", isWaived: false, isCommunity: false };
const admin = { ...member, userID: "a1", role: "admin" };
const community = { userID: "c1", role: "member", membershipStatus: "active", subscriptionStatus: "ACTIVE", isWaived: false, isCommunity: true };
const lapsed = { ...member, userID: "l1", subscriptionStatus: "CANCELED" };

test("admin gets every door, 24/7", () => {
  const out = allowedDoorsForFacts(admin, DOORS, basePolicy());
  expect(out).toEqual([
    { doorId: "front", windows: [] },
    { doorId: "lab", windows: [] },
    { doorId: "vault", windows: [] },
  ]);
});

test("member gets rule-covered doors with their windows; uncovered doors excluded", () => {
  const out = allowedDoorsForFacts(member, DOORS, basePolicy());
  expect(out.map((d) => d.doorId)).toEqual(["front", "lab"]); // vault has no rule
  expect(out[0].windows).toEqual(MEMBER_RULE.windows);
});

test("a 24/7 rule makes that door windows:[] even if another windowed rule exists", () => {
  const out = allowedDoorsForFacts(member, DOORS, basePolicy({ rules: [MEMBER_RULE, LAB_247] }));
  const lab = out.find((d) => d.doorId === "lab");
  expect(lab.windows).toEqual([]); // 24/7 wins for lab
});

test("community member → no doors", () => {
  expect(allowedDoorsForFacts(community, DOORS, basePolicy())).toEqual([]);
});

test("lapsed member → no doors (fails good standing)", () => {
  expect(allowedDoorsForFacts(lapsed, DOORS, basePolicy())).toEqual([]);
});

test("account 'allow' waives good standing (lapsed member gets their rule doors)", () => {
  const out = allowedDoorsForFacts(lapsed, DOORS, basePolicy({ accountOverrides: { l1: "allow" } }));
  expect(out.map((d) => d.doorId)).toEqual(["front", "lab"]);
});

test("account 'deny' → no doors even for admin", () => {
  expect(allowedDoorsForFacts(admin, DOORS, basePolicy({ accountOverrides: { a1: "deny" } }))).toEqual([]);
});
