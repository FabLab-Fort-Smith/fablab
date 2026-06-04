// E2E for SEC-04: card registration endpoint must require a configured secret.
const ROUTE = "@/app/api/internal/register-card/route";
const ORIGINAL = process.env.INTERNAL_API_SECRET;

async function loadPOST() {
  jest.resetModules();
  return (await import(ROUTE)).POST;
}
const post = (headers = {}, body = {}) =>
  new Request("http://localhost/api/internal/register-card", {
    method: "POST",
    headers: new Headers({ "content-type": "application/json", ...headers }),
    body: JSON.stringify(body),
  });

afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.INTERNAL_API_SECRET;
  else process.env.INTERNAL_API_SECRET = ORIGINAL;
});

describe("POST /api/internal/register-card — auth gate (SEC-04)", () => {
  test("500 when INTERNAL_API_SECRET is not configured (fail closed)", async () => {
    delete process.env.INTERNAL_API_SECRET;
    const POST = await loadPOST();
    const res = await POST(post({ authorization: "Bearer anything" }, { userId: "u", cardId: "c" }));
    expect(res.status).toBe(500);
  });

  test("401 rejects the old hardcoded fallback secret", async () => {
    process.env.INTERNAL_API_SECRET = "a-real-configured-secret";
    const POST = await loadPOST();
    const res = await POST(post({ authorization: "Bearer super-secure-internal-secret-882" }, { userId: "u", cardId: "c" }));
    expect(res.status).toBe(401);
  });
});
