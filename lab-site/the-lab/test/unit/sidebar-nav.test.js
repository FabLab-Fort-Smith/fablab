// Sidebar navigation model (src/app/components/layout/nav.js). The Addon Manager entry
// (/dashboard/admin/plugins) must be admin-only and reachable from the left menu; regular
// members must never see it. Pure function → node-testable without the client component.

import { navForRole } from "@/app/components/layout/nav";

const allItems = (sections) => sections.flatMap((s) => s.items);
const hasPath = (sections, id) => allItems(sections).some((i) => i.id === id);

describe("navForRole", () => {
  test("admin nav includes the Addon Manager entry", () => {
    const nav = navForRole("admin", "u1");
    expect(hasPath(nav, "/dashboard/admin/plugins")).toBe(true);
    const entry = allItems(nav).find((i) => i.id === "/dashboard/admin/plugins");
    expect(entry.label).toBe("addon.manager");
    // it lives in the admin section
    const adminSection = nav.find((s) => s.title === "admin");
    expect(adminSection.items.some((i) => i.id === "/dashboard/admin/plugins")).toBe(true);
  });

  test("REGRESSION: members do NOT see the Addon Manager (admin-only)", () => {
    expect(hasPath(navForRole("user", "u1"), "/dashboard/admin/plugins")).toBe(false);
    expect(hasPath(navForRole(null, "u1"), "/dashboard/admin/plugins")).toBe(false);
    // and no admin.* paths leak into the member menu
    expect(allItems(navForRole("user", "u1")).some((i) => i.id.startsWith("/dashboard/admin"))).toBe(false);
  });

  test("no role / 'user' falls back to the member menu", () => {
    for (const r of [null, undefined, "user"]) {
      const nav = navForRole(r, "u1");
      expect(nav[0].title).toBe("me");
    }
  });

  test("every nav item has a non-empty id and label", () => {
    for (const role of ["user", "admin"]) {
      for (const item of allItems(navForRole(role, "u1"))) {
        expect(typeof item.id).toBe("string");
        expect(item.id.length).toBeGreaterThan(0);
        expect(typeof item.label).toBe("string");
        expect(item.label.length).toBeGreaterThan(0);
      }
    }
  });

  test("userID is interpolated into member self paths", () => {
    const nav = navForRole("user", "abc123");
    expect(hasPath(nav, "/dashboard/abc123")).toBe(true);
    // falls back to 'me' when no id
    expect(hasPath(navForRole("user", undefined), "/dashboard/me")).toBe(true);
  });
});
