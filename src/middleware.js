import NextAuth from "next-auth";
import { authConfig } from "../auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

// List of public routes that can be accessed without authentication
const publicRoutes = ["/", "/auth/signin", "/auth/register"];

export default async function middleware(req) {
    const session = await auth();
    const { pathname } = req.nextUrl;

    // ✅ Redirect authenticated users away from auth pages
    if (session && pathname.startsWith('/auth')) {
        return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    // ✅ Allow public routes to be accessed without authentication
    if (publicRoutes.includes(pathname) || pathname.startsWith('/members')) {
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
