// vps/lib/scanAuthorize.js — the shared door-scan decision (WS `scan` handler + HTTP
// /api/v2/authorize). Online-first with a fail-secure offline fallback. Deps are injected so this
// unit test needs no network and no running server.

import { makeAuthorizeScan } from "../../vps/lib/scanAuthorize.js";

const ENV = { APP_INTERNAL_URL: "http://app.internal", INTERNAL_API_SECRET: "s3cr3t" };

// A stub offline decider that records its calls.
function stubOffline(result = { granted: false, reason: "no-match" }) {
  const calls = [];
  return {
    calls,
    authorizeOffline(args) {
      calls.push(args);
      return result;
    },
  };
}

function okResponse(body) {
  return { ok: true, json: async () => body };
}

test("online success → returns the app-core body with mode:'online' and does NOT consult offline", async () => {
  const offline = stubOffline();
  let calledUrl;
  const fetchImpl = async (url, opts) => {
    calledUrl = url;
    // Auth header carries the internal secret.
    expect(opts.headers.authorization).toBe("Bearer s3cr3t");
    return okResponse({ granted: true, userId: "u1", username: "ada", role: "member" });
  };
  const authorizeScan = makeAuthorizeScan({ offline, fetchImpl, env: ENV });

  const out = await authorizeScan({ cardId: "CARD-A", doorId: "front" });
  expect(out).toEqual({ granted: true, userId: "u1", username: "ada", role: "member", mode: "online" });
  expect(offline.calls).toHaveLength(0);
  // Card code + door are URL-encoded into the check-access call.
  expect(calledUrl).toContain("cardId=CARD-A");
  expect(calledUrl).toContain("doorId=front");
});

test("app core returns non-2xx → fail-secure offline fallback (mode:'offline')", async () => {
  const offline = stubOffline({ granted: false, reason: "no-match" });
  const fetchImpl = async () => ({ ok: false, json: async () => ({}) });
  const authorizeScan = makeAuthorizeScan({ offline, fetchImpl, env: ENV });

  const out = await authorizeScan({ cardId: "CARD-A", doorId: "front", tz: "America/Chicago" });
  expect(out).toEqual({ granted: false, reason: "no-match", mode: "offline" });
  expect(offline.calls[0]).toEqual({ code: "CARD-A", doorId: "front", tz: "America/Chicago" });
});

test("app core throws (unreachable) → offline fallback, never throws", async () => {
  const offline = stubOffline({ granted: true, reason: "allowlisted" });
  const fetchImpl = async () => {
    throw new Error("ECONNREFUSED");
  };
  const authorizeScan = makeAuthorizeScan({ offline, fetchImpl, env: ENV });

  const out = await authorizeScan({ cardId: "CARD-B", doorId: "back" });
  expect(out).toEqual({ granted: true, reason: "allowlisted", mode: "offline" });
});

test("no APP_INTERNAL_URL / secret configured → offline directly (never calls fetch)", async () => {
  const offline = stubOffline({ granted: false, reason: "no-snapshot" });
  let fetched = false;
  const fetchImpl = async () => {
    fetched = true;
    return okResponse({ granted: true });
  };
  const authorizeScan = makeAuthorizeScan({ offline, fetchImpl, env: {} });

  const out = await authorizeScan({ cardId: "CARD-C", doorId: "front" });
  expect(out).toEqual({ granted: false, reason: "no-snapshot", mode: "offline" });
  expect(fetched).toBe(false);
});

test("construction fails loudly without an offline decider (fail-closed wiring)", () => {
  expect(() => makeAuthorizeScan({})).toThrow(/offline decider/);
});
