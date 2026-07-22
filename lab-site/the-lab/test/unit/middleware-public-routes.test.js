// Issue #152: src/middleware.js matches /auth/:path* but its publicRoutes
// allowlist omitted the logged-OUT recovery flows, so /auth/forgot-password,
// /auth/reset-password, and /auth/verify-email were redirected to /auth/signin —
// unreachable for exactly the users who need them. These tests pin the public
// routing decision.
//
// middleware.js runs `NextAuth(authConfig)` and imports ../auth.config at module
// load, so both are mocked to keep this unit test hermetic (no providers/env/db).
jest.mock("next-auth", () => ({ __esModule: true, default: () => ({ auth: jest.fn() }) }));
jest.mock("../../auth.config", () => ({ authConfig: {} }));

import { isPublicRoute, publicRoutes } from "@/middleware";

describe("middleware public-route allowlist (issue #152)", () => {
    test("REGRESSION: unauthenticated recovery routes are public (were bounced to signin)", () => {
        expect(isPublicRoute("/auth/forgot-password")).toBe(true);
        expect(isPublicRoute("/auth/reset-password")).toBe(true);
        expect(isPublicRoute("/auth/verify-email")).toBe(true);
    });

    test("the recovery routes are declared in publicRoutes", () => {
        expect(publicRoutes).toEqual(expect.arrayContaining([
            "/auth/forgot-password",
            "/auth/reset-password",
            "/auth/verify-email",
        ]));
    });

    test("previously-public routes remain public", () => {
        expect(isPublicRoute("/")).toBe(true);
        expect(isPublicRoute("/auth/signin")).toBe(true);
        expect(isPublicRoute("/auth/register")).toBe(true);
        expect(isPublicRoute("/members/anything")).toBe(true);
    });

    test("protected routes stay private (deny by default)", () => {
        expect(isPublicRoute("/dashboard")).toBe(false);
        expect(isPublicRoute("/dashboard/admin")).toBe(false);
        expect(isPublicRoute("/auth/some-other-page")).toBe(false);
    });
});
