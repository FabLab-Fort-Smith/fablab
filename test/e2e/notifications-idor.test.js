// SEC-14: notifications were readable/writable across users — `userID` came from
// the query (GET) or body (PUT), and POST created a notification for any user.
// These drive the controller with auth + the service mocked and assert the owner
// is taken from the session and the request-supplied userID is ignored. They
// fail against the old controller (no auth(), userID from the request).

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/app/api/v1/notifications/service", () => ({
    __esModule: true,
    default: {
        getUserNotifications: jest.fn(),
        markRead: jest.fn(),
        markAllRead: jest.fn(),
        create: jest.fn(),
    },
}));

import { auth } from "@/auth";
import NotificationService from "@/app/api/v1/notifications/service";
import { GET, PUT, POST } from "@/app/api/v1/notifications/controller";

const USER = { user: { userID: "me", role: "user" } };
const ADMIN = { user: { userID: "admin-1", role: "admin" } };

const getReq = (qs = "") => new Request(`http://localhost/api/v1/notifications${qs}`);
const jsonReq = (body) => new Request("http://localhost/api/v1/notifications", {
    method: "POST",
    headers: new Headers({ "content-type": "application/json" }),
    body: JSON.stringify(body),
});

beforeEach(() => {
    jest.clearAllMocks();
    NotificationService.getUserNotifications.mockResolvedValue([]);
    NotificationService.markRead.mockResolvedValue(true);
    NotificationService.markAllRead.mockResolvedValue(1);
    NotificationService.create.mockResolvedValue({ id: "n1" });
});

describe("GET — own notifications only (SEC-14)", () => {
    test("REGRESSION: anonymous -> 401", async () => {
        auth.mockResolvedValue(null);
        expect((await GET(getReq("?userID=victim"))).status).toBe(401);
        expect(NotificationService.getUserNotifications).not.toHaveBeenCalled();
    });
    test("REGRESSION: reads the session user's notifications, ignoring ?userID", async () => {
        auth.mockResolvedValue(USER);
        const res = await GET(getReq("?userID=victim"));
        expect(res.status).toBe(200);
        expect(NotificationService.getUserNotifications).toHaveBeenCalledWith("me");
    });
});

describe("PUT — mark read on own notifications only (SEC-14)", () => {
    test("REGRESSION: anonymous -> 401", async () => {
        auth.mockResolvedValue(null);
        expect((await PUT(jsonReq({ action: "markAllRead", userID: "victim" }))).status).toBe(401);
        expect(NotificationService.markAllRead).not.toHaveBeenCalled();
    });
    test("REGRESSION: markRead is scoped to the session user, ignoring body userID", async () => {
        auth.mockResolvedValue(USER);
        await PUT(jsonReq({ action: "markRead", notificationID: "n9", userID: "victim" }));
        expect(NotificationService.markRead).toHaveBeenCalledWith("n9", "me");
    });
    test("REGRESSION: markAllRead is scoped to the session user, ignoring body userID", async () => {
        auth.mockResolvedValue(USER);
        await PUT(jsonReq({ action: "markAllRead", userID: "victim" }));
        expect(NotificationService.markAllRead).toHaveBeenCalledWith("me");
    });
});

describe("POST — create is admin-only (SEC-14)", () => {
    test("REGRESSION: anonymous cannot spoof a notification -> 401", async () => {
        auth.mockResolvedValue(null);
        expect((await POST(jsonReq({ userID: "victim", title: "x", message: "y" }))).status).toBe(401);
        expect(NotificationService.create).not.toHaveBeenCalled();
    });
    test("REGRESSION: a non-admin cannot create a notification -> 403", async () => {
        auth.mockResolvedValue(USER);
        expect((await POST(jsonReq({ userID: "victim", title: "x", message: "y" }))).status).toBe(403);
        expect(NotificationService.create).not.toHaveBeenCalled();
    });
    test("an admin may create a notification", async () => {
        auth.mockResolvedValue(ADMIN);
        expect((await POST(jsonReq({ userID: "u2", title: "x", message: "y" }))).status).toBe(201);
        expect(NotificationService.create).toHaveBeenCalled();
    });
});
