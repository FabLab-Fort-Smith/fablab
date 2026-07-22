// src/app/api/auth/reset-password/route.js
//
// #73 — Self-service password reset, step 2: CONSUME the token + set a new password.
// - Accepts { token, newPassword }. The user is located purely by the token's
//   hash (unique, 256-bit), so no email/lookup key is needed or accepted — this
//   avoids any account-enumeration surface on this endpoint.
// - Token is validated in constant time, must be unexpired + unused, and is
//   consumed on success (single-use). Works for OAuth-only accounts.
// - All token failure modes collapse to one generic error. Rate-limited per-IP.
// - Never logs the token or the request body.
import { NextResponse } from "next/server";
import AuthController from "../[...nextauth]/controller";
import { rateLimit } from "@/lib/rateLimit";
import { stripMongoOperators } from "@/lib/mongoSanitize";
import { auditLog } from "@/lib/audit";

export const runtime = "nodejs";

// Service errors that are safe to surface verbatim (already generic).
const CLIENT_ERRORS = new Set([
    "Invalid or expired reset token.",
    "Password does not meet requirements.",
]);

/** First hop from x-forwarded-for (proxy chain), else x-real-ip, else "unknown". */
function clientIp(req) {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
    return req.headers.get("x-real-ip") || "unknown";
}

/**
 * @route POST /api/auth/reset-password
 * @desc  Reset a password using a valid, unexpired, single-use token.
 * @access Public (bearer is the token itself)
 */
export async function POST(req) {
    const ip = clientIp(req);
    try {
        // Per-IP limit: defence-in-depth against token brute force (the 256-bit
        // token already makes guessing infeasible) and protects the datastore.
        const limit = rateLimit(`reset-password:ip:${ip}`, { limit: 10, windowMs: 15 * 60_000 });
        if (!limit.allowed) {
            auditLog("auth.password_reset.reset_rate_limited", { source: ip, outcome: "blocked" });
            return NextResponse.json(
                { error: "Too many requests. Please try again later." },
                { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
            );
        }

        // Reject $-prefixed keys before anything reaches persistence (SEC-19).
        const body = stripMongoOperators(await req.json().catch(() => ({})));
        const token = typeof body.token === "string" ? body.token : "";
        const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

        if (!token || !newPassword) {
            return NextResponse.json({ error: "Invalid or expired reset token." }, { status: 400 });
        }

        await AuthController.resetPassword(token, newPassword);
        auditLog("auth.password_reset.completed", { source: ip, outcome: "success" });
        return NextResponse.json({ ok: true, message: "Password has been reset." }, { status: 200 });
    } catch (error) {
        if (CLIENT_ERRORS.has(error?.message)) {
            auditLog("auth.password_reset.rejected", { source: ip, outcome: "failure" });
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        // Unexpected: fail closed, log server-side only (no token/body), generic 500.
        console.error("Reset-password error:", error?.message || "error");
        return NextResponse.json({ error: "Internal server error." }, { status: 500 });
    }
}
