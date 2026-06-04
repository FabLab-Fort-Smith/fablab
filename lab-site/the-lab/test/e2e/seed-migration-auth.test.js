// SEC-18: seed / migration / test endpoints ran bulk writes (or a hardware
// toggle) for anonymous callers. These confirm the guard is actually wired into
// the representative handlers — they reject anon/non-admin before any work, and
// production-disabled handlers 404 in production. They fail against the pre-fix
// routes (which had no guard).

jest.mock("@/auth", () => ({ auth: jest.fn() }));

import { auth } from "@/auth";
import { GET as mergeInterests } from "@/app/api/v1/migrations/merge-interests/route";
import { GET as disableNotifications } from "@/app/api/v1/migrations/disable-notifications/route";
import { GET as seed } from "@/app/api/seed/route";
import { POST as badgesSeed } from "@/app/api/v1/badges/seed/route";

const ORIG_ENV = process.env.NODE_ENV;
afterEach(() => { process.env.NODE_ENV = ORIG_ENV; });
beforeEach(() => jest.clearAllMocks());

const ANON = null;
const USER = { user: { userID: "u1", role: "user" } };
const req = () => new Request("http://localhost/api/x");

describe("operational endpoints reject anonymous + non-admin (SEC-18)", () => {
    const handlers = [
        ["migrations/merge-interests", mergeInterests],
        ["migrations/disable-notifications", disableNotifications],
        ["seed", seed],
        ["badges/seed", badgesSeed],
    ];

    test.each(handlers)("REGRESSION: %s -> 401 for anonymous", async (_name, handler) => {
        auth.mockResolvedValue(ANON);
        expect((await handler(req())).status).toBe(401);
    });

    test.each(handlers)("REGRESSION: %s -> 403 for a non-admin", async (_name, handler) => {
        auth.mockResolvedValue(USER);
        expect((await handler(req())).status).toBe(403);
    });
});

describe("dev/test-only endpoints are unreachable in production (SEC-18)", () => {
    test("REGRESSION: seed 404s in production even for an admin", async () => {
        process.env.NODE_ENV = "production";
        auth.mockResolvedValue({ user: { userID: "a1", role: "admin" } });
        expect((await seed(req())).status).toBe(404);
    });
});
