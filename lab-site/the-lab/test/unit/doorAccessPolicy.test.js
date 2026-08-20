// Unit tests for the pure door-access policy engine (src/plugins/door-access-controller/policy.js).
// The engine is deterministic (clock injected), so these cover the security-critical
// decision ordering + the abuse cases: bans beat admin, suspended/community denied,
// time-windows (incl. overnight), credential restrictions, and account overrides.

import { decide, isGoodStanding, inWindow, REASON } from "@/plugins/door-access-controller/policy";

const TZ = "America/Chicago"; // CDT = UTC-5 in August
const WED_2PM = new Date("2026-08-19T19:00:00Z"); // Wed 14:00 CDT
const SAT_2PM = new Date("2026-08-22T19:00:00Z"); // Sat 14:00 CDT

const memberHours = {
  id: "member-hours",
  roles: ["member"],
  doors: ["*"],
  windows: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }],
};
const labratz247 = { id: "labratz-24-7", roles: ["labratz"], doors: ["*"] };
const nfcOnlyFront = {
  id: "front-nfc-only",
  roles: ["member"],
  doors: ["front"],
  credentialTypes: ["nfc"],
  windows: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }],
};

const basePolicy = (over = {}) => ({
  rules: [memberHours, labratz247],
  requireGoodStanding: true,
  allowAdminBypass: true,
  defaultTimezone: TZ,
  accountOverrides: {},
  ...over,
});

const goodMember = { userID: "u1", role: "member", membershipStatus: "active", subscriptionStatus: "ACTIVE", isWaived: false, isCommunity: false };
const admin = { ...goodMember, userID: "a1", role: "admin" };
const suspended = { ...goodMember, userID: "s1", membershipStatus: "suspended" };
const community = { userID: "c1", role: "community", membershipStatus: "active", subscriptionStatus: "ACTIVE", isWaived: false, isCommunity: true };
const lapsed = { ...goodMember, userID: "l1", subscriptionStatus: "CANCELED" };
const front = { doorId: "front" };

describe("isGoodStanding (facts only)", () => {
  test("active member w/ active sub is good", () => expect(isGoodStanding(goodMember)).toBe(true));
  test("suspended is not good", () => expect(isGoodStanding(suspended)).toBe(false));
  test("community (not waived) is denied", () => expect(isGoodStanding(community)).toBe(false));
  test("community WAIVED is good", () => expect(isGoodStanding({ ...community, isWaived: true })).toBe(true));
  test("waived overrides a canceled subscription", () => expect(isGoodStanding({ ...lapsed, isWaived: true })).toBe(true));
});

describe("decide — decision ordering", () => {
  test("admin bypass grants even out of hours", () => {
    expect(decide({ facts: admin, door: front, credentialType: "nfc", now: SAT_2PM, policy: basePolicy() }))
      .toEqual({ granted: true, reason: REASON.ADMIN_BYPASS });
  });

  test("account ban BEATS admin bypass", () => {
    const d = decide({ facts: admin, door: front, credentialType: "nfc", now: WED_2PM, policy: basePolicy({ accountOverrides: { a1: "deny" } }) });
    expect(d).toEqual({ granted: false, reason: REASON.ACCOUNT_BLOCKED });
  });

  test("suspended member denied (not good standing)", () => {
    expect(decide({ facts: suspended, door: front, credentialType: "nfc", now: WED_2PM, policy: basePolicy() }).reason)
      .toBe(REASON.NOT_GOOD_STANDING);
  });

  test("community member denied", () => {
    expect(decide({ facts: community, door: front, credentialType: "nfc", now: WED_2PM, policy: basePolicy() }).reason)
      .toBe(REASON.NOT_GOOD_STANDING);
  });
});

describe("decide — rules, windows, credentials", () => {
  test("good member in-window is granted", () => {
    const d = decide({ facts: goodMember, door: front, credentialType: "nfc", now: WED_2PM, policy: basePolicy() });
    expect(d).toEqual({ granted: true, reason: REASON.RULE_MATCH, ruleId: "member-hours" });
  });

  test("good member OUT of window denied", () => {
    expect(decide({ facts: goodMember, door: front, credentialType: "nfc", now: SAT_2PM, policy: basePolicy() }).reason)
      .toBe(REASON.NO_WINDOW);
  });

  test("no rule for this role@door => no-matching-rule", () => {
    expect(decide({ facts: goodMember, door: { doorId: "vault" }, credentialType: "nfc", now: WED_2PM,
      policy: basePolicy({ rules: [{ ...memberHours, doors: ["front"] }] }) }).reason)
      .toBe(REASON.NO_RULE);
  });

  test("credential-type restriction denies a disallowed credential", () => {
    expect(decide({ facts: goodMember, door: front, credentialType: "app", now: WED_2PM,
      policy: basePolicy({ rules: [nfcOnlyFront] }) }).reason)
      .toBe(REASON.CREDENTIAL_NOT_ALLOWED);
  });

  test("labratz 24/7 rule grants on a Saturday", () => {
    const labratz = { ...goodMember, userID: "r1", role: "labratz" };
    expect(decide({ facts: labratz, door: front, credentialType: "nfc", now: SAT_2PM, policy: basePolicy() }))
      .toEqual({ granted: true, reason: REASON.RULE_MATCH, ruleId: "labratz-24-7" });
  });
});

describe("decide — account overrides", () => {
  test("account 'allow' waives good-standing but rules still apply (in window => grant)", () => {
    const d = decide({ facts: lapsed, door: front, credentialType: "nfc", now: WED_2PM, policy: basePolicy({ accountOverrides: { l1: "allow" } }) });
    expect(d).toEqual({ granted: true, reason: REASON.RULE_MATCH, ruleId: "member-hours" });
  });

  test("without the allow override, a lapsed member is denied", () => {
    expect(decide({ facts: lapsed, door: front, credentialType: "nfc", now: WED_2PM, policy: basePolicy() }).reason)
      .toBe(REASON.NOT_GOOD_STANDING);
  });

  test("account 'allow' still can't beat the door's time window", () => {
    expect(decide({ facts: lapsed, door: front, credentialType: "nfc", now: SAT_2PM, policy: basePolicy({ accountOverrides: { l1: "allow" } }) }).reason)
      .toBe(REASON.NO_WINDOW);
  });

  test("requireGoodStanding=false skips the standing gate", () => {
    expect(decide({ facts: lapsed, door: front, credentialType: "nfc", now: WED_2PM, policy: basePolicy({ requireGoodStanding: false }) }).granted)
      .toBe(true);
  });
});

describe("inWindow — overnight handling", () => {
  const overnight = { days: [2], start: "22:00", end: "06:00" }; // Tue 22:00 -> Wed 06:00
  test("inside on the start day (Tue 23:00 CDT)", () => {
    expect(inWindow(new Date("2026-08-19T04:00:00Z"), TZ, overnight)).toBe(true); // Tue 23:00 CDT
  });
  test("inside on the spillover morning (Wed 02:00 CDT credited to Tue)", () => {
    expect(inWindow(new Date("2026-08-19T07:00:00Z"), TZ, overnight)).toBe(true); // Wed 02:00 CDT
  });
  test("outside after the window ends (Wed 07:00 CDT)", () => {
    expect(inWindow(new Date("2026-08-19T12:00:00Z"), TZ, overnight)).toBe(false); // Wed 07:00 CDT
  });
});
