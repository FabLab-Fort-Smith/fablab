// E2E for SEC-11: card-pairing must require an admin/staff session (the role
// check was commented out) and the outbound pairing call must carry the secret.
jest.mock("@/auth", () => ({ auth: jest.fn() }));

import { auth } from "@/auth";
import { POST } from "@/app/api/admin/pair-card/route";

const ORIGINAL = process.env.SOCKET_API_SECRET;

function post(body = { userId: "u1" }) {
  return new Request("http://localhost/api/admin/pair-card", {
    method: "POST",
    headers: new Headers({ "content-type": "application/json" }),
    body: JSON.stringify(body),
  });
}

afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.SOCKET_API_SECRET;
  else process.env.SOCKET_API_SECRET = ORIGINAL;
});

describe("POST /api/admin/pair-card — admin authorization (SEC-11)", () => {
  test("REGRESSION: no session -> 401 (the role check used to be commented out)", async () => {
    auth.mockResolvedValue(null);
    const res = await POST(post());
    expect(res.status).toBe(401);
  });

  test("non-admin/staff session -> 401", async () => {
    auth.mockResolvedValue({ user: { role: "user" } });
    const res = await POST(post());
    expect(res.status).toBe(401);
  });

  test("admin session -> calls the WS pairing endpoint with a Bearer secret", async () => {
    auth.mockResolvedValue({ user: { role: "admin" } });
    process.env.SOCKET_API_SECRET = "sock-secret";
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ paired: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const res = await POST(post({ userId: "u1", deviceId: "d1" }));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.headers.Authorization).toBe("Bearer sock-secret");
  });
});
