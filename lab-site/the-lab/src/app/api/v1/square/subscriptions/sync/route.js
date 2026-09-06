import SubscriptionService from "../service";
import { auth } from "@/auth";
import { auditLog } from "@/lib/audit";

export async function POST(req) {
    try {
        // Admin-only: this rewrites a member's membership status/access from a caller-supplied Square
        // customer id — previously UNAUTHENTICATED (anyone could alter any member). (AC-5 security fix.)
        const session = await auth();
        if (!session || session.user?.role !== "admin") {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        }

        const { squareID, userID } = await req.json();

        // Type-check inputs (parity with the AC-5 member↔Square routes; reject operator-object injection).
        if (typeof squareID !== "string" || !squareID.trim()) {
            return new Response(
                JSON.stringify({ error: "squareID is required." }),
                { status: 400 }
            );
        }
        if (userID != null && typeof userID !== "string") {
            return new Response(
                JSON.stringify({ error: "userID must be a string." }),
                { status: 400 }
            );
        }

        const updatedUser = await SubscriptionService.syncSubscription(squareID, userID);

        auditLog("admin.member.square.sync", { actor: session.user?.userID || "admin", target: userID || null, squareID, outcome: updatedUser ? "success" : "no_change" });

        if (!updatedUser) {
            return new Response(
                JSON.stringify({ message: "No subscription found or user not updated." }),
                { status: 404 }
            );
        }

        return new Response(
            JSON.stringify({ message: "Subscription synced successfully.", user: updatedUser }),
            { status: 200 }
        );
    } catch (error) {
        console.error("Error syncing subscription:", error);
        return new Response(
            JSON.stringify({ error: "Failed to sync subscription." }),
            { status: 500 }
        );
    }
}
