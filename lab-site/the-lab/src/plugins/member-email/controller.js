// HTTP edge for the member-email plugin. The thin route shims under
// src/app/api/v1/plugins/member-email/** call requirePluginEnabled() first, then
// delegate here. Every handler authenticates via auth() and derives identity
// from the session (never the body/query). Errors are mapped to safe responses.

import { auth } from "@/auth";
import Service from "./service";
import { resolveConfig } from "./config";

const json = (body, status) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const unauthorized = () => json({ error: "Unauthorized" }, 401);

const toActor = (session) => ({
  userID: session?.user?.userID ?? null,
  role: session?.user?.role ?? null,
});

function errorResponse(e) {
  const status = e?.status && Number.isInteger(e.status) ? e.status : 500;
  if (status === 500) console.error("member-email error:", e);
  return json({ error: status === 500 ? "An unexpected error occurred." : e.message }, status);
}

export default class MemberEmailController {
  /** GET ?name=xxxx — availability (active member only). */
  static availability = async (req) => {
    try {
      const session = await auth();
      if (!session?.user?.userID) return unauthorized();
      const name = new URL(req.url).searchParams.get("name") || "";
      const config = await resolveConfig();
      const result = await Service.checkAvailability(name, toActor(session), config);
      return json(result, 200);
    } catch (e) {
      return errorResponse(e);
    }
  };

  /** POST { localPart } — claim a mailbox. */
  static claim = async (req) => {
    try {
      const session = await auth();
      if (!session?.user?.userID) return unauthorized();
      const body = await req.json().catch(() => ({}));
      const config = await resolveConfig();
      const result = await Service.claim({ localPart: body?.localPart }, toActor(session), config);
      return json(result, 201);
    } catch (e) {
      return errorResponse(e);
    }
  };

  /** GET — the caller's own mailbox. */
  static mine = async () => {
    try {
      const session = await auth();
      if (!session?.user?.userID) return unauthorized();
      const result = await Service.getOwn(toActor(session));
      return json(result, 200);
    } catch (e) {
      return errorResponse(e);
    }
  };

  /** GET — list all mailboxes (admin). */
  static adminList = async () => {
    try {
      const session = await auth();
      if (!session?.user?.userID) return unauthorized();
      const mailboxes = await Service.adminList(toActor(session));
      return json({ mailboxes }, 200);
    } catch (e) {
      return errorResponse(e);
    }
  };

  /** POST { action: 'suspend'|'reset'|'delete', userID } — admin management. */
  static adminAction = async (req) => {
    try {
      const session = await auth();
      if (!session?.user?.userID) return unauthorized();
      const actor = toActor(session);
      const { action, userID } = await req.json().catch(() => ({}));
      if (typeof userID !== "string" || !userID) return json({ error: "userID required" }, 400);
      let result;
      if (action === "suspend") result = await Service.adminSuspend(userID, actor);
      else if (action === "reset") result = await Service.adminReset(userID, actor);
      else if (action === "delete") result = await Service.adminDelete(userID, actor);
      else return json({ error: "Unknown action" }, 400);
      return json(result, 200);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
