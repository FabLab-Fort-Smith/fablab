import SubscriptionService from "./service";

export default class SubscriptionController {
    static handleWebhook = async (req) => {
      try {
        const payload = await req.json();
        console.log("Received Square webhook payload:", payload);
        
        // Process the webhook payload in the service layer.
        await SubscriptionService.processWebhook(payload);
        
        return new Response(
          JSON.stringify({ message: "Subscription processed successfully." }),
          { status: 200 }
        );
      } catch (error) {
        console.error("Error in SubscriptionController.handleWebhook:", error);
        return new Response(
          JSON.stringify({ error: "Failed to process subscription webhook." }),
          { status: 500 }
        );
      }
    }
  }