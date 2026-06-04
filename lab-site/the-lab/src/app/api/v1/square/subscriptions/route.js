import SubscriptionController from "./controller";

export async function POST(request) {
    try {
      return await SubscriptionController.handleWebhook(request);
    } catch (error) {
      console.error("Error in subscriptions route POST:", error);
      return new Response(
        JSON.stringify({ error: "An error occurred processing the webhook." }),
        { status: 500 }
      );
    }
  }
