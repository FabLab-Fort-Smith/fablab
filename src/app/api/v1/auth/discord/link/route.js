import { NextResponse } from "next/server";
import { auth } from "@/../../auth";
import jwt from "jsonwebtoken";

/**
 * GET /api/v1/auth/discord/link
 *
 * Initiates the Discord OAuth flow for LINKING a Discord account to an
 * already-authenticated user. Completely separate from NextAuth's signIn —
 * NextAuth doesn't preserve the existing session when signIn() is called
 * from the client, so we run our own OAuth redirect here instead.
 *
 * Encodes the current userID in a signed state JWT so the callback can
 * verify it and write the Discord credentials to the right user.
 */
export async function GET(request) {
    const session = await auth();
    if (!session?.user?.userID) {
        return NextResponse.redirect(new URL("/auth/signin", request.url));
    }

    const state = jwt.sign(
        { userID: session.user.userID, nonce: Math.random().toString(36).slice(2) },
        process.env.JWT_SECRET,
        { expiresIn: "10m" }
    );

    const params = new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        redirect_uri: `${process.env.NEXT_PUBLIC_URL}/api/v1/auth/discord/callback`,
        response_type: "code",
        scope: "identify email guilds.join",
        state,
    });

    return NextResponse.redirect(
        `https://discord.com/api/oauth2/authorize?${params}`
    );
}
