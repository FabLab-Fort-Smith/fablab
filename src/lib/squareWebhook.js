import squareClient from "@/lib/square";
import { db } from "@/lib/database";

let cachedSignatureKey = null;

const WEBHOOK_CONFIG_KEY = "square_webhook_signature_key";
const WEBHOOK_EVENT_TYPES = ["payment.updated", "subscription.updated"];

async function getStoredSignatureKey() {
  try {
    const dbInstance = await db.connect();
    const config = dbInstance.collection("config");
    const doc = await config.findOne({ key: WEBHOOK_CONFIG_KEY });
    return doc?.value || null;
  } catch {
    return null;
  }
}

async function storeSignatureKey(signatureKey) {
  try {
    const dbInstance = await db.connect();
    const config = dbInstance.collection("config");
    await config.updateOne(
      { key: WEBHOOK_CONFIG_KEY },
      { $set: { key: WEBHOOK_CONFIG_KEY, value: signatureKey, updatedAt: new Date() } },
      { upsert: true }
    );
  } catch (err) {
    console.error("⚠️ Failed to persist webhook signature key:", err);
  }
}

export async function ensureWebhookRegistered() {
  if (cachedSignatureKey) return cachedSignatureKey;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL;
  if (!appUrl) {
    console.warn("⚠️ NEXT_PUBLIC_APP_URL not set — skipping webhook registration.");
    return null;
  }

  const notificationUrl = `${appUrl}/api/v1/square/webhooks/payment`;

  try {
    // Check if we already stored a key from a previous run
    const stored = await getStoredSignatureKey();
    if (stored) {
      cachedSignatureKey = stored;
      return stored;
    }

    // List existing webhook subscriptions and look for a match
    const { result: listResult } = await squareClient.webhookSubscriptionsApi.listWebhookSubscriptions();
    const existing = listResult.subscriptions?.find(
      (s) => s.notificationUrl === notificationUrl && s.enabled
    );

    if (existing?.signatureKey) {
      cachedSignatureKey = existing.signatureKey;
      await storeSignatureKey(existing.signatureKey);
      console.log("✅ Reusing existing Square webhook subscription.");
      return existing.signatureKey;
    }

    // Register a new webhook subscription
    const { result: createResult } = await squareClient.webhookSubscriptionsApi.createWebhookSubscription({
      idempotencyKey: `fablab-webhook-${Date.now()}`,
      subscription: {
        name: "FabLab Membership Webhooks",
        notificationUrl,
        enabled: true,
        eventTypes: WEBHOOK_EVENT_TYPES,
        apiVersion: "2024-01-18",
      },
    });

    const signatureKey = createResult.subscription?.signatureKey;
    if (signatureKey) {
      cachedSignatureKey = signatureKey;
      await storeSignatureKey(signatureKey);
      console.log("✅ Registered new Square webhook subscription.");
    }

    return signatureKey || null;
  } catch (err) {
    console.error("❌ Failed to register Square webhook:", err);
    return null;
  }
}
