import SubscriptionService from "../service";

export async function POST(req) {
    try {
        const { squareID, userID } = await req.json();

        if (!squareID) {
            return new Response(
                JSON.stringify({ error: "squareID is required." }),
                { status: 400 }
            );
        }

        const updatedUser = await SubscriptionService.syncSubscription(squareID, userID);

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
