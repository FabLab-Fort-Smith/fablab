// E2E abuse-case test for SEC-03: the Square webhook must FAIL CLOSED.
// Previously, an unset signing key caused every webhook to be accepted.
describe("POST /api/v1/square/webhooks/payment — signature gate (SEC-03)", () => {
  const ORIGINAL = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  let POST;

  beforeAll(async () => {
    delete process.env.SQUARE_WEBHOOK_SIGNATURE_KEY; // no key configured
    ({ POST } = await import("@/app/api/v1/square/webhooks/payment/route"));
  });

  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    else process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = ORIGINAL;
  });

  async function post(body, headers = {}) {
    const req = new Request("http://localhost/api/v1/square/webhooks/payment", {
      method: "POST",
      headers: new Headers({ "content-type": "application/json", ...headers }),
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
    const res = await POST(req);
    return { status: res.status };
  }

  test("rejects (401) when no signing key is configured — fails closed", async () => {
    const res = await post(
      { type: "payment.updated", data: { object: {} } },
      { "x-square-hmacsha256-signature": "anything" }
    );
    expect(res.status).toBe(401);
  });

  test("rejects (401) a forged signature", async () => {
    const res = await post(
      { type: "payment.updated", data: { object: {} } },
      { "x-square-hmacsha256-signature": "Zm9yZ2VkLXNpZw==" }
    );
    expect(res.status).toBe(401);
  });
});
