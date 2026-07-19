// src/app/api/auth/register/route.js
import { NextResponse } from "next/server";
import AuthController from "../[...nextauth]/controller";

export const runtime = "nodejs";

/**
 * @route POST /api/auth/register
 * @desc Handles new user registration with proper error handling and validation
 * @access Public
 */
export async function POST(req) {
    try {
        // Ensure the request body is properly formatted
        const data = await req.json();
        
        if (!data || typeof data !== "object") {
            return NextResponse.json({ error: "Invalid request data format." }, { status: 400 });
        }

        // Verify Cloudflare Turnstile (replaced reCAPTCHA — ADR 0015).
        const { captchaToken } = data;
        if (!captchaToken) {
             return NextResponse.json({ error: "Captcha token is missing." }, { status: 400 });
        }

        // SEC-21: require the Turnstile secret from env — no hardcoded fallback
        // key. Fail closed (don't silently verify) if it's unset.
        const secretKey = process.env.TURNSTILE_SECRET_KEY;
        if (!secretKey) {
            console.error("TURNSTILE_SECRET_KEY is not configured");
            return NextResponse.json({ error: "Captcha verification is unavailable." }, { status: 500 });
        }

        // POST the secret + token as a form body (NOT the query string) to Cloudflare's
        // siteverify. Bound the call with a timeout — the upstream is untrusted/unreliable
        // (topic-api-consumption) — and fail closed on any error.
        let captchaData;
        try {
            const body = new URLSearchParams({ secret: secretKey, response: captchaToken });
            const captchaRes = await fetch(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                { method: "POST", body, signal: AbortSignal.timeout(5000) },
            );
            captchaData = await captchaRes.json();
        } catch {
            // network error / timeout / non-JSON — do not let registration through unverified.
            return NextResponse.json({ error: "Captcha verification is unavailable." }, { status: 503 });
        }

        if (!captchaData || captchaData.success !== true) {
            return NextResponse.json({ error: "Captcha verification failed." }, { status: 400 });
        }

        // SEC-20: don't log the registration body (contains the plaintext password).
        // Register the new user using the AuthController service
        const result = await AuthController.register(data);

        // Check if registration was successful
        if (!result) {
            return NextResponse.json({
                error: "Registration failed. Please try again later.",
            }, { status: 500 });
        }

        return NextResponse.json({
            message: "User registered successfully!",
            user: result,  // ✅ Return a unique identifier for the created user
        }, { status: 201 });

    } catch (error) {
        console.error("Error during registration:", error);

        // Handle known MongoDB error patterns gracefully
        if (error.code === 11000) {  // Duplicate key error for unique fields
            return NextResponse.json({
                error: "A user with this email already exists. Please use a different email.",
            }, { status: 409 });
        }

        // Provide a generic error message for unexpected issues
        return NextResponse.json({
            error: error.message || "An unexpected error occurred during registration.",
        }, { status: 500 });
    }
}
