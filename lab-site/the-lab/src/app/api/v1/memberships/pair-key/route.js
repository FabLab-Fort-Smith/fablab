import { NextResponse } from "next/server";
import { auth } from "../../../../../../auth";
import { db } from "@/lib/database";
import UserService from "@/app/api/v1/users/service";

// POST /api/v1/memberships/pair-key
// body: { userID }
// Triggers pairing mode on the door panel for the requesting member.
// Requires accessKey.issued === true (admin must have approved key first).
// Clears any existing card code so the old card stops working immediately.
export async function POST(req) {
    const { userID } = await req.json();
    if (!userID) return NextResponse.json({ error: "userID required." }, { status: 400 });

    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (session.user.userID !== userID && session.user.role !== "admin") {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const usersCol = await db.dbUsers();
    const user = await usersCol.findOne({ userID });
    if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

    if (!user.membership?.accessKey?.issued) {
        return NextResponse.json({ error: "Access key not yet approved for this account. Contact an admin." }, { status: 403 });
    }

    // Clear old card code immediately so the previous card stops working
    await UserService.updateUser(userID, { "membership.accessKey.code": null });

    // SEC-21: require the socket-server URL from env (no hardcoded fallback).
    const wsServerUrl = process.env.WS_SERVER_URL;
    if (!wsServerUrl) {
        console.error("WS_SERVER_URL is not configured");
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    try {
        const response = await fetch(`${wsServerUrl}/api/v2/pairing/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: userID, deviceId: "access-scanner-01" }),
        });

        if (!response.ok) {
            const errText = await response.text();
            return NextResponse.json({ error: `Panel error: ${errText}` }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json({ success: true, message: data.message || "Pairing mode started. You have 60 seconds to tap your card." });
    } catch (err) {
        console.error("Pair-key error:", err);
        return NextResponse.json({ error: "Could not reach door panel. Make sure you are on-site." }, { status: 502 });
    }
}
