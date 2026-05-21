import { NextResponse } from "next/server";
import { auth } from "../../../../../../auth";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

/**
 * POST /api/v1/auth/link-intent
 *
 * Sets a short-lived HttpOnly cookie that signals the upcoming OAuth flow
 * is a Discord LINK (not a new sign-in). The profile() callback in auth.js
 * reads this cookie to return the existing user instead of creating a ghost.
 */
export async function POST() {
    const session = await auth();
    if (!session?.user?.userID) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = jwt.sign(
        { userID: session.user.userID },
        process.env.JWT_SECRET,
        { expiresIn: "10m" }
    );

    const cookieStore = await cookies();
    cookieStore.set("discord_link_for", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 600, // 10 minutes — enough to complete the OAuth flow
        path: "/",
        sameSite: "lax",
    });

    return NextResponse.json({ ok: true });
}
