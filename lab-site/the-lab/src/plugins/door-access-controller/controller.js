// HTTP edge for the door-access addon. The thin route shims under
// src/app/api/v1/plugins/door-access-controller/** call requirePluginEnabled() first,
// then delegate here.
//
// The /authorize endpoint is machine-to-machine (the VPS socket-server calls it on a
// scan), so it is guarded by the INTERNAL_API_SECRET bearer (constant-time, fail-closed)
// — NOT a user session. It returns only { granted } + minimal identity; the raw
// credential is never echoed or logged.

import Service from "./service";
import { auth } from "@/auth";
import { timingSafeEqualStr } from "@/lib/secureCompare";

const json = (body, status) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const unauthorized = () => json({ error: "Unauthorized" }, 401);
const toActor = (session) => ({ userID: session?.user?.userID ?? null, role: session?.user?.role ?? null });
function errorResponse(e) {
  const status = e?.status && Number.isInteger(e.status) ? e.status : 500;
  if (status === 500) console.error("door-access admin error:", e);
  return json({ error: status === 500 ? "An unexpected error occurred." : e.message }, status);
}

export default class DoorAccessController {
  /** POST /authorize — socket-server scan authorization. */
  static authorize = async (req) => {
    const secret = process.env.INTERNAL_API_SECRET;
    if (!secret) {
      console.error("door-access: INTERNAL_API_SECRET is not configured");
      return json({ error: "Server misconfiguration" }, 500);
    }
    if (!timingSafeEqualStr(req.headers.get("authorization"), `Bearer ${secret}`)) {
      return json({ error: "Unauthorized" }, 401);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const credentialType = body.credentialType || "nfc";
    const credentialValue = body.credentialValue ?? body.cardId; // accept the panel's `cardId`
    const doorId = body.doorId ?? body.deviceId;
    if (!credentialValue || !doorId) {
      return json({ error: "Missing credentialValue/doorId" }, 400);
    }

    try {
      const source = req.headers.get("x-forwarded-for") || undefined;
      const result = await Service.authorize({ credentialType, credentialValue, doorId, source });
      return json(result, 200);
    } catch (e) {
      console.error("door-access authorize error:", e);
      return json({ error: "Internal Error" }, 500);
    }
  };

  /** POST /allowlist/refresh — rebuild + push the signed offline allowlist. Internal (a cron/timer). */
  static refreshAllowlist = async (req) => {
    const secret = process.env.INTERNAL_API_SECRET;
    if (!secret) {
      console.error("door-access: INTERNAL_API_SECRET is not configured");
      return json({ error: "Server misconfiguration" }, 500);
    }
    if (!timingSafeEqualStr(req.headers.get("authorization"), `Bearer ${secret}`)) {
      return json({ error: "Unauthorized" }, 401);
    }
    try {
      const result = await Service.refreshAllowlist();
      return json(result, 200);
    } catch (e) {
      console.error("door-access allowlist refresh error:", e);
      return json({ error: "Internal Error" }, 500);
    }
  };

  // --- admin UI surface (session; admin authz enforced in the service) ---

  /** GET — everything the admin page renders (doors, policy, sanitized cards). */
  static adminOverview = async () => {
    try {
      const session = await auth();
      if (!session?.user?.userID) return unauthorized();
      return json(await Service.adminOverview(toActor(session)), 200);
    } catch (e) {
      return errorResponse(e);
    }
  };

  /** POST { action, ...payload } — door.upsert | policy.save | card.revoke | allowlist.refresh. */
  static adminAction = async (req) => {
    try {
      const session = await auth();
      if (!session?.user?.userID) return unauthorized();
      const actor = toActor(session);
      const body = await req.json().catch(() => ({}));
      switch (body.action) {
        case "door.upsert":
          return json(await Service.adminUpsertDoor(actor, body), 200);
        case "policy.save":
          return json(await Service.adminSavePolicy(actor, body), 200);
        case "card.revoke":
          return json(await Service.adminRevokeCard(actor, body), 200);
        case "allowlist.refresh": {
          // reuse the same permission gate as the other admin actions
          await Service.adminOverview(actor); // asserts admin (throws 403 otherwise)
          return json(await Service.refreshAllowlist(), 200);
        }
        default:
          return json({ error: "Unknown action" }, 400);
      }
    } catch (e) {
      return errorResponse(e);
    }
  };
}
