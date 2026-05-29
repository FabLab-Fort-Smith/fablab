import { callRoute } from "../helpers/route";

describe("E2E harness smoke", () => {
  test("jest + transform run", () => {
    expect(1 + 1).toBe(2);
  });

  test("callRoute invokes a handler and parses JSON + status", async () => {
    const handler = async (req) => {
      const { searchParams } = new URL(req.url);
      return new Response(JSON.stringify({ ok: true, who: searchParams.get("who") }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    };
    const res = await callRoute(handler, { url: "http://localhost/api/x?who=lab" });
    expect(res.status).toBe(201);
    expect(res.json).toEqual({ ok: true, who: "lab" });
  });

  test("callRoute forwards method, body and headers", async () => {
    const handler = async (req) => {
      const body = await req.json();
      return new Response(
        JSON.stringify({ method: req.method, auth: req.headers.get("authorization"), body }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };
    const res = await callRoute(handler, {
      method: "POST",
      body: { hello: "world" },
      headers: { authorization: "Bearer test" },
    });
    expect(res.json.method).toBe("POST");
    expect(res.json.auth).toBe("Bearer test");
    expect(res.json.body).toEqual({ hello: "world" });
  });
});
