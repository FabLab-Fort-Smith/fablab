import { NextResponse } from "next/server";
import { auth } from "../../../../../../auth";
import { db } from "@/lib/database";
import AuthService from "@/app/api/auth/[...nextauth]/service";

async function requireAdmin() {
    const session = await auth();
    if (!session || session.user.role !== "admin") return null;
    return session;
}

// GET /api/v1/admin/duplicates
// Returns groups of users that share an identity signal (email, googleId, discordId, username, name)
export async function GET() {
    if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const usersCol = await db.dbUsers();

    // Run all grouping aggregations in parallel
    const [byEmail, byGoogleId, byDiscordId, byUsername, byName] = await Promise.all([
        // Same encrypted email
        usersCol.aggregate([
            { $match: { email: { $exists: true, $ne: null, $ne: "" } } },
            { $group: { _id: "$email", users: { $push: "$$ROOT" }, count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } },
        ]).toArray(),

        // Same googleId
        usersCol.aggregate([
            { $match: { googleId: { $exists: true, $ne: null, $ne: "" } } },
            { $group: { _id: "$googleId", users: { $push: "$$ROOT" }, count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } },
        ]).toArray(),

        // Same discordId
        usersCol.aggregate([
            { $match: { discordId: { $exists: true, $ne: null, $ne: "" } } },
            { $group: { _id: "$discordId", users: { $push: "$$ROOT" }, count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } },
        ]).toArray(),

        // Same username (non-empty)
        usersCol.aggregate([
            { $match: { username: { $exists: true, $ne: null, $ne: "" } } },
            { $group: { _id: { $toLower: "$username" }, users: { $push: "$$ROOT" }, count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } },
        ]).toArray(),

        // Same full name (case-insensitive)
        usersCol.aggregate([
            { $match: { firstName: { $ne: null, $ne: "" }, lastName: { $ne: null, $ne: "" } } },
            { $group: {
                _id: { $toLower: { $concat: ["$firstName", " ", "$lastName"] } },
                users: { $push: "$$ROOT" },
                count: { $sum: 1 },
            }},
            { $match: { count: { $gt: 1 } } },
        ]).toArray(),
    ]);

    const strip = (u) => ({
        userID: u.userID,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email ? (() => { try { return AuthService.decryptEmail(u.email); } catch { return u.email; } })() : null,
        username: u.username,
        role: u.role,
        provider: u.provider,
        googleId: u.googleId,
        discordId: u.discordId,
        createdAt: u.createdAt,
        "membership.status": u.membership?.status,
        "membership.subscriptionStatus": u.membership?.subscriptionStatus,
        "membership.squareCustomerId": u.membership?.squareCustomerId,
    });

    // Build deduplicated groups keyed by sorted userID pair
    const seen = new Set();
    const groups = [];

    const addGroup = (reason, users) => {
        const stripped = users.map(strip);
        const key = stripped.map(u => u.userID).sort().join("|");
        if (seen.has(key)) {
            // Already in groups — add reason to existing entry
            const existing = groups.find(g => g.key === key);
            if (existing && !existing.reasons.includes(reason)) existing.reasons.push(reason);
            return;
        }
        seen.add(key);
        groups.push({ key, reasons: [reason], users: stripped });
    };

    for (const g of byEmail)     addGroup("email",      g.users);
    for (const g of byGoogleId)  addGroup("google_id",  g.users);
    for (const g of byDiscordId) addGroup("discord_id", g.users);
    for (const g of byUsername)  addGroup("username",   g.users);
    for (const g of byName)      addGroup("name",       g.users);

    // Sort: strongest signals first (email/id matches before name-only)
    const strength = { email: 0, google_id: 1, discord_id: 2, username: 3, name: 4 };
    groups.sort((a, b) => Math.min(...a.reasons.map(r => strength[r])) - Math.min(...b.reasons.map(r => strength[r])));

    return NextResponse.json(groups);
}
