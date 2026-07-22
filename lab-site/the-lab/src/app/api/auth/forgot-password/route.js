// src/app/api/auth/forgot-password/route.js
//
// #73 — Self-service password reset, step 1: REQUEST a reset link.
// - Accepts { email } and ALWAYS returns a generic 200 { ok: true } whether or
//   not the account exists (no account enumeration).
// - Resolves the user through the encrypting auth layer (deterministic email
//   ciphertext), stores a hashed single-use token, and emails the raw link.
// - Rate-limited per-IP and per-account to resist enumeration + mail-bombing.
// - Never logs the email, the token, or the reset link (SEC-24).
import { NextResponse } from "next/server";
import AuthController from "../[...nextauth]/controller";
import AuthService from "../[...nextauth]/service";
import { rateLimit } from "@/lib/rateLimit";
import { stripMongoOperators } from "@/lib/mongoSanitize";
import { auditLog } from "@/lib/audit";

export const runtime = "nodejs";

const GENERIC_OK = { ok: true };

/** First hop from x-forwarded-for (proxy chain), else x-real-ip, else "unknown". */
function clientIp(req) {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
    return req.headers.get("x-real-ip") || "unknown";
}

function tooMany(retryAfterMs) {
    return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } },
    );
}

/**
 * @route POST /api/auth/forgot-password
 * @desc  Request a password-reset link. Generic success regardless of existence.
 * @access Public
 */
export async function POST(req) {
    try {
        const ip = clientIp(req);

        // Per-IP limit: bounds enumeration + mail-bomb abuse from one source.
        const ipLimit = rateLimit(`forgot-password:ip:${ip}`, { limit: 5, windowMs: 15 * 60_000 });
        if (!ipLimit.allowed) {
            auditLog("auth.password_reset.request_rate_limited", { source: ip, outcome: "blocked" });
            return tooMany(ipLimit.retryAfterMs);
        }

        // Reject $-prefixed keys before anything reaches persistence (SEC-19).
        const body = stripMongoOperators(await req.json().catch(() => ({})));
        const email = typeof body.email === "string" ? body.email.trim() : "";

        // No email → still generic; can't key a per-account limit without one.
        if (!email) return NextResponse.json(GENERIC_OK, { status: 200 });

        // Per-account limit keyed by the DETERMINISTIC email ciphertext, so the
        // key is identical whether or not an account exists — no timing/behaviour
        // oracle for enumeration, and it curbs targeted mail-bombing.
        const acctKey = AuthService.encryptEmail(email);
        const acctLimit = rateLimit(`forgot-password:acct:${acctKey}`, { limit: 3, windowMs: 60 * 60_000 });
        if (!acctLimit.allowed) {
            auditLog("auth.password_reset.request_rate_limited", { source: ip, outcome: "blocked" });
            return tooMany(acctLimit.retryAfterMs);
        }

        await AuthController.requestPasswordReset(email);
        // Do NOT include the email in the audit record (log-side enumeration).
        auditLog("auth.password_reset.requested", { source: ip, outcome: "accepted" });

        return NextResponse.json(GENERIC_OK, { status: 200 });
    } catch (error) {
        // Fail closed but never leak internals; still generic to the client.
        console.error("Account-recovery request error:", error?.message || "error");
        return NextResponse.json(GENERIC_OK, { status: 200 });
    }
}
