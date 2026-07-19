// E2E for the Turnstile captcha gate on POST /api/auth/register (ADR 0015 — reCAPTCHA→Turnstile).
// Regression against the migration: the route must fail closed when TURNSTILE_SECRET_KEY is unset,
// reject a missing/invalid token, verify against Cloudflare's siteverify with a POST FORM body
// (not the query string), and never register a user whose captcha didn't verify. These assertions
// fail against the pre-migration Google-reCAPTCHA code.

const ROUTE = "@/app/api/auth/register/route";
const ORIGINAL = process.env.TURNSTILE_SECRET_KEY;

// jest.mock is hoisted: the path must be a literal and the factory may only close over
// `mock`-prefixed vars. Mock the controller so no real DB/registration runs.
const mockRegister = jest.fn();
jest.mock("@/app/api/auth/[...nextauth]/controller", () => ({
  __esModule: true,
  default: { register: (...a) => mockRegister(...a) },
}));

async function loadPOST() {
  jest.resetModules();
  return (await import(ROUTE)).POST;
}
const post = (body = {}) =>
  new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: new Headers({ "content-type": "application/json" }),
    body: JSON.stringify(body),
  });

const okUser = { firstName: "Ada", email: "ada@example.com", password: "hunter2hunter2", captchaToken: "tok" };

beforeEach(() => {
  mockRegister.mockReset();
  mockRegister.mockResolvedValue({ id: "user-1" });
});
afterEach(() => {
  delete global.fetch;
});
afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = ORIGINAL;
});

describe("POST /api/auth/register — Turnstile gate (ADR 0015)", () => {
  test("500 fail-closed when TURNSTILE_SECRET_KEY is not configured", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    global.fetch = jest.fn();
    const POST = await loadPOST();
    const res = await POST(post(okUser));
    expect(res.status).toBe(500);
    expect(global.fetch).not.toHaveBeenCalled(); // never even calls out without a secret
    expect(mockRegister).not.toHaveBeenCalled();
  });

  test("400 when the captcha token is missing", async () => {
    process.env.TURNSTILE_SECRET_KEY = "sekret";
    global.fetch = jest.fn();
    const POST = await loadPOST();
    const { captchaToken, ...noToken } = okUser;
    const res = await POST(post(noToken));
    expect(res.status).toBe(400);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  test("verifies against Cloudflare siteverify with a POST form body, then registers on success", async () => {
    process.env.TURNSTILE_SECRET_KEY = "sekret";
    global.fetch = jest.fn().mockResolvedValue({ json: async () => ({ success: true }) });
    const POST = await loadPOST();
    const res = await POST(post(okUser));

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(opts.method).toBe("POST");
    // secret + token must be in the request BODY, never the URL/query string.
    expect(String(url)).not.toMatch(/sekret|tok/);
    const sent = opts.body instanceof URLSearchParams ? opts.body : new URLSearchParams(String(opts.body));
    expect(sent.get("secret")).toBe("sekret");
    expect(sent.get("response")).toBe("tok");

    expect(res.status).toBe(201);
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });

  test("400 and NO registration when Cloudflare reports success:false", async () => {
    process.env.TURNSTILE_SECRET_KEY = "sekret";
    global.fetch = jest.fn().mockResolvedValue({ json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }) });
    const POST = await loadPOST();
    const res = await POST(post(okUser));
    expect(res.status).toBe(400);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  test("503 fail-closed (no registration) when the verify call errors/times out", async () => {
    process.env.TURNSTILE_SECRET_KEY = "sekret";
    global.fetch = jest.fn().mockRejectedValue(new Error("timeout"));
    const POST = await loadPOST();
    const res = await POST(post(okUser));
    expect(res.status).toBe(503);
    expect(mockRegister).not.toHaveBeenCalled();
  });
});
