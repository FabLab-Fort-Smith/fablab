// GET /api/v1/users/auth-methods — powers the Google-retirement nudge.
// Security contract: session-bound (no client-supplied userID honoured), and the
// response leaks NO credential material (no password/hash, no email).
jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/app/api/v1/users/model", () => ({ __esModule: true, default: { getUserByQuery: jest.fn() } }));

import { GET } from "@/app/api/v1/users/auth-methods/route";
import { auth } from "@/auth";
import UserModel from "@/app/api/v1/users/model";

const GOOGLE_ONLY_USER = {
    userID: "u-1",
    googleId: "g-1",
    discordId: "",
    password: "no password",
    email: "encrypted-blob-hex",
    firstName: "Ada",
};

beforeEach(() => jest.clearAllMocks());

test("anonymous -> 401", async () => {
    auth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(UserModel.getUserByQuery).not.toHaveBeenCalled();
});

test("session user not found -> 404", async () => {
    auth.mockResolvedValue({ user: { userID: "ghost" } });
    UserModel.getUserByQuery.mockResolvedValue(null);
    expect((await GET()).status).toBe(404);
});

test("googleOnly user -> flags reported", async () => {
    auth.mockResolvedValue({ user: { userID: "u-1" } });
    UserModel.getUserByQuery.mockResolvedValue(GOOGLE_ONLY_USER);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ googleOnly: true, hasGoogle: true, hasPassword: false, hasDiscord: false });
});

test("REGRESSION: looks up ONLY the session user (no client-supplied id)", async () => {
    auth.mockResolvedValue({ user: { userID: "u-1" } });
    UserModel.getUserByQuery.mockResolvedValue(GOOGLE_ONLY_USER);
    await GET();
    expect(UserModel.getUserByQuery).toHaveBeenCalledWith({ userID: "u-1" });
});

test("REGRESSION: never returns password material or the email", async () => {
    auth.mockResolvedValue({ user: { userID: "u-1" } });
    UserModel.getUserByQuery.mockResolvedValue(GOOGLE_ONLY_USER);
    const body = await (await GET()).json();
    expect(body).not.toHaveProperty("password");
    expect(body).not.toHaveProperty("email");
    expect(JSON.stringify(body)).not.toContain("no password");
    expect(JSON.stringify(body)).not.toContain("encrypted-blob-hex");
});

test("user with a password is not nudged", async () => {
    auth.mockResolvedValue({ user: { userID: "u-2" } });
    UserModel.getUserByQuery.mockResolvedValue({ userID: "u-2", googleId: "g-2", discordId: "", password: "$2b$10$hash" });
    const body = await (await GET()).json();
    expect(body.googleOnly).toBe(false);
    expect(body.hasPassword).toBe(true);
});

test("DB failure -> 500, no crash", async () => {
    auth.mockResolvedValue({ user: { userID: "u-1" } });
    UserModel.getUserByQuery.mockRejectedValue(new Error("db down"));
    expect((await GET()).status).toBe(500);
});
