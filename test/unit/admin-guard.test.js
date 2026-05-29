// SEC-18: the guard for operational endpoints (seed / migration / test). It must
// reject anonymous and non-admin callers, and 404 production-disabled handlers
// in production even for an admin.

jest.mock("@/auth", () => ({ auth: jest.fn() }));

import { auth } from "@/auth";
import { guardOperationalEndpoint } from "@/lib/adminGuard";

const ORIG_ENV = process.env.NODE_ENV;
afterEach(() => { process.env.NODE_ENV = ORIG_ENV; });
beforeEach(() => jest.clearAllMocks());

describe("guardOperationalEndpoint", () => {
    test("REGRESSION: anonymous -> 401", async () => {
        auth.mockResolvedValue(null);
        const res = await guardOperationalEndpoint();
        expect(res.status).toBe(401);
    });

    test("REGRESSION: a logged-in non-admin -> 403", async () => {
        auth.mockResolvedValue({ user: { userID: "u1", role: "user" } });
        const res = await guardOperationalEndpoint();
        expect(res.status).toBe(403);
    });

    test("an admin is allowed (returns null)", async () => {
        auth.mockResolvedValue({ user: { userID: "a1", role: "admin" } });
        expect(await guardOperationalEndpoint()).toBeNull();
    });

    test("REGRESSION: a production-disabled handler 404s in production, even for an admin", async () => {
        process.env.NODE_ENV = "production";
        auth.mockResolvedValue({ user: { userID: "a1", role: "admin" } });
        const res = await guardOperationalEndpoint({ productionDisabled: true });
        expect(res.status).toBe(404);
    });

    test("a production-disabled handler is allowed for an admin outside production", async () => {
        process.env.NODE_ENV = "development";
        auth.mockResolvedValue({ user: { userID: "a1", role: "admin" } });
        expect(await guardOperationalEndpoint({ productionDisabled: true })).toBeNull();
    });
});
