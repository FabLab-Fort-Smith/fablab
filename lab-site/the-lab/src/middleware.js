import NextAuth from "next-auth";
import { authConfig } from "../auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

// List of public routes that can be accessed without authentication.
// The recovery flows (forgot/reset/verify) are used by logged-OUT users — they
// MUST be public, or the middleware bounces them to /auth/signin and the feature
// is unusable (issue #152).
export const publicRoutes = [
    "/",
    "/auth/signin",
    "/auth/register",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/auth/verify-email",
];

/**
 * Whether a pathname is reachable without an authenticated session.
 * Pure (no I/O) so the routing decision is unit-testable (issue #152).
 * @param {string} pathname - the request path (no query string)
 * @returns {boolean} true if the path is public
 */
export function isPublicRoute(pathname) {
    return publicRoutes.includes(pathname) || pathname.startsWith('/members');
}

// Account-recovery pages that must ALSO work while signed in. A signed-in user has
// legitimate reasons to be here: an OAuth-only account setting its first password,
// or opening a reset/verification link from an email in a browser that still holds
// a live session. Bouncing them to /dashboard silently discards the token in the
// link, so the reset never happens.
const recoveryRoutes = [
    "/auth/forgot-password",
    "/auth/reset-password",
    "/auth/verify-email",
];

/**
 * Whether a signed-in user is still allowed to view this /auth page.
 * Pure (no I/O) so the exemption is unit-testable.
 * @param {string} pathname - the request path (no query string)
 * @returns {boolean} true if an authenticated user may proceed instead of being redirected
 */
export function isRecoveryRoute(pathname) {
    return recoveryRoutes.includes(pathname);
}

export default async function middleware(req) {
    const session = await auth();
    const { pathname } = req.nextUrl;

    // ✅ Redirect authenticated users away from auth pages — EXCEPT the recovery
    // pages, which a signed-in user may legitimately need (set a first password,
    // or open a reset/verify link while a session is live).
    if (session && pathname.startsWith('/auth') && !isRecoveryRoute(pathname)) {
        return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    // ✅ Allow public routes to be accessed without authentication
    if (isPublicRoute(pathname)) {
        return NextResponse.next();
    }

    // ✅ Block protected routes if not authenticated
    if (!session) {
        const signInUrl = new URL("/auth/signin", req.url);
        signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
        return NextResponse.redirect(signInUrl);
    }

    // ✅ If authenticated, allow access to dashboard routes
    return NextResponse.next();
}

// ✅ Apply middleware only to protected routes and auth routes
export const config = {
    matcher: ["/dashboard/:path*", "/auth/:path*"],
};
