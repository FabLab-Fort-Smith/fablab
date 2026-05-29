// SEC-02: the /api/v1/users endpoints were fully unauthenticated — anyone could
// list/read/update/delete/merge any user. These drive the controller (the HTTP
// edge) with the auth + service layers mocked, asserting the authn/authz gates
// and the ownership binding. They fail against the old controller, which had no
// auth() calls at all.

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/app/api/v1/users/service", () => ({
    __esModule: true,
    default: {
        createUser: jest.fn(),
        getUserByQuery: jest.fn(),
        getAllUsers: jest.fn(),
        updateUser: jest.fn(),
        deleteUser: jest.fn(),
        nudgeUser: jest.fn(),
        mergeUsers: jest.fn(),
        verifyCredentials: jest.fn(),
    },
}));

import { auth } from "@/auth";
import UserController from "@/app/api/v1/users/controller";
import UserService from "@/app/api/v1/users/service";

const ANON = null;
const USER = { user: { userID: "user-self", role: "user" } };
const ADMIN = { user: { userID: "admin-1", role: "admin" } };

const req = (url, { method = "GET", body } = {}) =>
    new Request(url, {
        method,
        headers: new Headers({ "content-type": "application/json" }),
        body: body === undefined ? undefined : JSON.stringify(body),
    });

beforeEach(() => {
    jest.clearAllMocks();
    UserService.getAllUsers.mockResolvedValue({ users: [], total: 0, page: 1, totalPages: 0 });
    UserService.getUserByQuery.mockResolvedValue({ userID: "u9" });
    UserService.updateUser.mockResolvedValue({ userID: "user-self" });
    UserService.deleteUser.mockResolvedValue(true);
    UserService.createUser.mockResolvedValue({ userID: "new" });
    UserService.nudgeUser.mockResolvedValue({ success: true });
    UserService.mergeUsers.mockResolvedValue({ userID: "user-self" });
    UserService.verifyCredentials.mockResolvedValue(false);
});

describe("POST create (admin only)", () => {
    test("REGRESSION: anonymous -> 401", async () => {
        auth.mockResolvedValue(ANON);
        expect((await UserController.createUser(req("http://x/api/v1/users", { method: "POST", body: { username: "x" } }))).status).toBe(401);
        expect(UserService.createUser).not.toHaveBeenCalled();
    });
    test("non-admin -> 403", async () => {
        auth.mockResolvedValue(USER);
        expect((await UserController.createUser(req("http://x/api/v1/users", { method: "POST", body: { username: "x" } }))).status).toBe(403);
    });
    test("admin -> 201", async () => {
        auth.mockResolvedValue(ADMIN);
        expect((await UserController.createUser(req("http://x/api/v1/users", { method: "POST", body: { username: "x" } }))).status).toBe(201);
    });
});

describe("GET reads (public, projected by the service)", () => {
    test("anonymous list is allowed and passes an anonymous actor", async () => {
        auth.mockResolvedValue(ANON);
        const res = await UserController.getAllUsers(req("http://x/api/v1/users?isPublic=true"));
        expect(res.status).toBe(200);
        const actor = UserService.getAllUsers.mock.calls[0][3];
        expect(actor).toEqual({ userID: null, role: null });
    });
    test("anonymous by-query read passes an anonymous actor", async () => {
        auth.mockResolvedValue(ANON);
        await UserController.getUserByQuery(req("http://x/api/v1/users?username=bob"));
        expect(UserService.getUserByQuery.mock.calls[0][1]).toEqual({ userID: null, role: null });
    });
});

describe("PUT update (auth + ownership binding)", () => {
    test("REGRESSION: anonymous -> 401", async () => {
        auth.mockResolvedValue(ANON);
        const res = await UserController.updateUser(req("http://x/api/v1/users?userID=victim", { method: "PUT", body: { role: "admin" } }));
        expect(res.status).toBe(401);
        expect(UserService.updateUser).not.toHaveBeenCalled();
    });
    test("REGRESSION: a non-admin targeting another user is forced to their own record", async () => {
        auth.mockResolvedValue(USER);
        await UserController.updateUser(req("http://x/api/v1/users?userID=victim", { method: "PUT", body: { bio: "x" } }));
        const [query, , actor] = UserService.updateUser.mock.calls[0];
        expect(query).toBe("user-self");            // not "victim"
        expect(actor).toEqual({ userID: "user-self", role: "user" });
    });
    test("an admin may target any user", async () => {
        auth.mockResolvedValue(ADMIN);
        await UserController.updateUser(req("http://x/api/v1/users?userID=victim", { method: "PUT", body: { role: "admin" } }));
        expect(UserService.updateUser.mock.calls[0][0]).toBe("victim");
    });
});

describe("DELETE (admin only)", () => {
    test("REGRESSION: anonymous -> 401", async () => {
        auth.mockResolvedValue(ANON);
        expect((await UserController.deleteUser(req("http://x/api/v1/users?userID=victim", { method: "DELETE" }))).status).toBe(401);
        expect(UserService.deleteUser).not.toHaveBeenCalled();
    });
    test("non-admin -> 403", async () => {
        auth.mockResolvedValue(USER);
        expect((await UserController.deleteUser(req("http://x/api/v1/users?userID=victim", { method: "DELETE" }))).status).toBe(403);
        expect(UserService.deleteUser).not.toHaveBeenCalled();
    });
    test("admin -> 200", async () => {
        auth.mockResolvedValue(ADMIN);
        expect((await UserController.deleteUser(req("http://x/api/v1/users?userID=victim", { method: "DELETE" }))).status).toBe(200);
    });
});

describe("nudge (admin only)", () => {
    test("non-admin -> 403", async () => {
        auth.mockResolvedValue(USER);
        expect((await UserController.nudgeUser(req("http://x/api/v1/users/nudge", { method: "POST", body: { userID: "u9" } }))).status).toBe(403);
    });
    test("admin -> 200", async () => {
        auth.mockResolvedValue(ADMIN);
        expect((await UserController.nudgeUser(req("http://x/api/v1/users/nudge", { method: "POST", body: { userID: "u9" } }))).status).toBe(200);
    });
});

describe("merge (admin, or self with source-credential proof)", () => {
    const body = (extra = {}) => ({ targetUserID: "user-self", sourceUserID: "legacy-9", ...extra });

    test("REGRESSION: anonymous -> 401", async () => {
        auth.mockResolvedValue(ANON);
        expect((await UserController.mergeUsers(req("http://x/api/v1/users/merge", { method: "POST", body: body() }))).status).toBe(401);
    });
    test("REGRESSION: a non-admin cannot merge into someone else's account", async () => {
        auth.mockResolvedValue(USER);
        const res = await UserController.mergeUsers(req("http://x/api/v1/users/merge", { method: "POST", body: { targetUserID: "victim", sourceUserID: "legacy-9" } }));
        expect(res.status).toBe(403);
        expect(UserService.mergeUsers).not.toHaveBeenCalled();
    });
    test("REGRESSION: a self-merge without valid source credentials is rejected", async () => {
        auth.mockResolvedValue(USER);
        UserService.verifyCredentials.mockResolvedValue(false);
        const res = await UserController.mergeUsers(req("http://x/api/v1/users/merge", { method: "POST", body: body({ sourceEmail: "l@x.com", sourcePassword: "wrong" }) }));
        expect(res.status).toBe(403);
        expect(UserService.mergeUsers).not.toHaveBeenCalled();
    });
    test("a self-merge with valid source credentials proceeds", async () => {
        auth.mockResolvedValue(USER);
        UserService.verifyCredentials.mockResolvedValue(true);
        const res = await UserController.mergeUsers(req("http://x/api/v1/users/merge", { method: "POST", body: body({ sourceEmail: "l@x.com", sourcePassword: "right" }) }));
        expect(res.status).toBe(200);
        expect(UserService.mergeUsers).toHaveBeenCalled();
    });
    test("an admin may merge any pair without credentials", async () => {
        auth.mockResolvedValue(ADMIN);
        const res = await UserController.mergeUsers(req("http://x/api/v1/users/merge", { method: "POST", body: { targetUserID: "a", sourceUserID: "b" } }));
        expect(res.status).toBe(200);
        expect(UserService.verifyCredentials).not.toHaveBeenCalled();
        expect(UserService.mergeUsers).toHaveBeenCalled();
    });
});
