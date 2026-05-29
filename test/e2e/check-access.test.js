// E2E for SEC-04: the IoT access endpoint must require a configured secret
// (no hardcoded fallback) and reject the old leaked fallback value.
const ROUTE = "@/app/api/internal/check-access/route";
const ORIGINAL = process.env.INTERNAL_API_SECRET;

async function loadGET() {
  jest.resetModules();
  return (await import(ROUTE)).GET;
}
const get = (headers = {}, qs = "") =>
  new Request(`http://localhost/api/internal/check-access${qs}`, { headers: new Headers(headers) });

afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.INTERNAL_API_SECRET;
  else process.env.INTERNAL_API_SECRET = ORIGINAL;
});

describe("GET /api/internal/check-access — auth gate (SEC-04)", () => {
  test("500 when INTERNAL_API_SECRET is not configured (fail closed)", async () => {
    delete process.env.INTERNAL_API_SECRET;
    const GET = await loadGET();
    const res = await GET(get({ authorization: "Bearer anything" }));
    expect(res.status).toBe(500);
  });

  test("401 rejects the old hardcoded fallback secret", async () => {
    process.env.INTERNAL_API_SECRET = "a-real-configured-secret";
    const GET = await loadGET();
    const res = await GET(get({ authorization: "Bearer super-secure-internal-secret-882" }, "?cardId=abc"));
    expect(res.status).toBe(401);
  });

  test("401 on a wrong bearer token", async () => {
    process.env.INTERNAL_API_SECRET = "a-real-configured-secret";
    const GET = await loadGET();
    const res = await GET(get({ authorization: "Bearer wrong" }, "?cardId=abc"));
    expect(res.status).toBe(401);
  });

  test("400 (missing cardId) with the correct bearer — auth passes, no DB needed", async () => {
    process.env.INTERNAL_API_SECRET = "a-real-configured-secret";
    const GET = await loadGET();
    const res = await GET(get({ authorization: "Bearer a-real-configured-secret" }));
    expect(res.status).toBe(400);
  });
});
