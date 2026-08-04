// Issue #186: /dashboard read `session.user.id`, which the session callback never sets
// (it sets `userID`), so every sign-in landed on the literal path
// "/dashboard/undefined". The unauthenticated branch also pushed to "/login", a route
// that does not exist (404) — the real one is "/auth/signin".

import { dashboardHomePath, SIGN_IN_PATH } from "@/lib/dashboardPath";

describe("dashboardHomePath (issue #186)", () => {
    test("REGRESSION: builds the path from userID, the field the session actually has", () => {
        expect(dashboardHomePath({ user: { userID: "user-abc123" } })).toBe("/dashboard/user-abc123");
    });

    test("REGRESSION: `id` alone is NOT accepted — that was the bug", () => {
        // The old code read session.user.id; a session carrying only `id` must yield no
        // path rather than a broken one.
        expect(dashboardHomePath({ user: { id: "user-abc123" } })).toBeNull();
    });

    test("REGRESSION: never returns a path containing undefined/null", () => {
        for (const s of [undefined, null, {}, { user: {} }, { user: { userID: undefined } }, { user: { userID: null } }]) {
            const p = dashboardHomePath(s);
            expect(p).toBeNull();
            expect(String(p)).not.toContain("undefined");
        }
    });

    test("blank or whitespace-only ids yield no path", () => {
        expect(dashboardHomePath({ user: { userID: "" } })).toBeNull();
        expect(dashboardHomePath({ user: { userID: "   " } })).toBeNull();
    });

    test("non-string ids are rejected (no coercion into the URL)", () => {
        expect(dashboardHomePath({ user: { userID: 42 } })).toBeNull();
        expect(dashboardHomePath({ user: { userID: { toString: () => "x" } } })).toBeNull();
    });

    test("the id is encoded — it lands in a URL path segment", () => {
        expect(dashboardHomePath({ user: { userID: "a b/c?d" } })).toBe("/dashboard/a%20b%2Fc%3Fd");
        expect(dashboardHomePath({ user: { userID: "  user-1  " } })).toBe("/dashboard/user-1");
    });

    test("REGRESSION: sign-in path is the real route, not the 404 /login", () => {
        expect(SIGN_IN_PATH).toBe("/auth/signin");
        expect(SIGN_IN_PATH).not.toBe("/login");
    });
});
