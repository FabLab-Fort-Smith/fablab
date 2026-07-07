import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import UserService from "@/app/api/v1/users/service";
import DiscordService from "@/lib/discord";
import { maskId } from "@/lib/redact"; // redact identifiers in logs (CLAUDE.md §5/§9, #133)

/**
 * GET /api/v1/auth/discord/callback
 *
 * Handles the Discord OAuth callback for the account-LINKING flow.
 * Verifies the signed state JWT, exchanges the code for a Discord access
 * token, fetches the Discord profile, and writes discordId + discordHandle
 * to the existing user record.
 *
 * NOTE: This redirect URI must be added to your Discord application's
 * OAuth2 redirect list:
 *   {NEXT_PUBLIC_URL}/api/v1/auth/discord/callback
 */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    const baseUrl = (process.env.NEXT_PUBLIC_URL || '').replace(/\/$/, '');
    const dashboardBase = baseUrl + "/dashboard";

    // User cancelled the Discord auth
    if (error) {
        console.warn("Discord link cancelled:", error);
        return NextResponse.redirect(`${dashboardBase}?discord_link=cancelled`);
    }

    if (!code || !state) {
        return NextResponse.redirect(`${dashboardBase}?discord_link=error&reason=missing_params`);
    }

    // Verify the signed state to get the target userID
    let targetUserID;
    try {
        const payload = jwt.verify(state, process.env.JWT_SECRET);
        targetUserID = payload.userID;
    } catch (e) {
        console.error("Discord link: invalid state JWT", e.message);
        return NextResponse.redirect(`${dashboardBase}?discord_link=error&reason=invalid_state`);
    }

    // Exchange authorization code for access token
    let accessToken;
    try {
        const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: "authorization_code",
                code,
                redirect_uri: `${baseUrl}/api/v1/auth/discord/callback`,
            }),
        });
        if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`);
        const tokenData = await tokenRes.json();
        accessToken = tokenData.access_token;
    } catch (e) {
        console.error("Discord link: OAuth code exchange error", e.message);
        return NextResponse.redirect(`${dashboardBase}?discord_link=error&reason=token_exchange`);
    }

    // Fetch Discord user profile
    let profile;
    try {
        const profileRes = await fetch("https://discord.com/api/users/@me", {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!profileRes.ok) throw new Error(`Profile fetch failed: ${profileRes.status}`);
        profile = await profileRes.json();
    } catch (e) {
        console.error("Discord link: identity fetch error", e.message);
        return NextResponse.redirect(`${dashboardBase}?discord_link=error&reason=profile_fetch`);
    }

    // Write Discord credentials to the existing user
    try {
        await UserService.updateUser(targetUserID, {
            discordId: profile.id,
            discordHandle: profile.username,
        });
        const discordRef = maskId(profile.id);
        console.log(`✅ Discord linked: user ${maskId(targetUserID)} → Discord ${discordRef}`);
    } catch (e) {
        console.error("Discord link: DB update failed", e.message);
        return NextResponse.redirect(`${dashboardBase}?discord_link=error&reason=db_update`);
    }

    // Attempt to add them to the Discord guild (non-fatal)
    try {
        await DiscordService.addMemberToGuild(profile.id, accessToken);
    } catch (e) {
        console.warn("Discord link: guild add failed (non-fatal)", e.message);
    }

    // Redirect back to profile settings tab
    const user = await UserService.getUserByQuery({ userID: targetUserID }).catch(() => null);
    const returnURL = user
        ? `${baseUrl}/dashboard/${user.userID}/profile?tab=3&discord_link=success`
        : `${dashboardBase}?discord_link=success`;

    return NextResponse.redirect(returnURL);
}
