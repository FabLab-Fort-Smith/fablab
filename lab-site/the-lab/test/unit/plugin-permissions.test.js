// Unit coverage for the plugin permission choke point. Today every plugin
// permission resolves to isAdmin(); this test pins that contract (and the
// deny-by-default behavior) so a future group model can't silently loosen it.
import { hasPermission, assertPermission } from "@/lib/plugins/permissions";

describe("plugin permissions (single-role model)", () => {
  test("admins hold every plugin permission", () => {
    expect(hasPermission({ userID: "a", role: "admin" }, "member-email:admin")).toBe(true);
  });

  test("non-admins hold none (deny by default)", () => {
    expect(hasPermission({ userID: "u", role: "user" }, "member-email:admin")).toBe(false);
    expect(hasPermission(null, "anything")).toBe(false);
    expect(hasPermission(undefined, "anything")).toBe(false);
  });

  test("assertPermission throws a 403-tagged error for the unauthorized", () => {
    expect(() => assertPermission({ role: "user" }, "member-email:admin")).toThrow("Forbidden");
    try {
      assertPermission({ role: "user" }, "x");
    } catch (e) {
      expect(e.status).toBe(403);
    }
    expect(() => assertPermission({ role: "admin" }, "x")).not.toThrow();
  });
});
