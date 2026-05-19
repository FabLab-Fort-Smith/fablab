
import { NextResponse } from "next/server";
import crypto from "crypto";
import UserService from "@/app/api/v1/users/service";
import squareClient from "@/lib/square";

function verifySquareSignature(rawBody, signature, notificationUrl) {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key) return true; // skip verification if key not configured
  const hmac = crypto.createHmac("sha256", key);
  hmac.update(notificationUrl + rawBody);
  return hmac.digest("base64") === signature;
}

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-square-hmacsha256-signature") || "";
    const notificationUrl = `${process.env.NEXT_PUBLIC_URL}/api/v1/square/webhooks/payment`;

    if (!verifySquareSignature(rawBody, signature, notificationUrl)) {
      console.warn("⚠️ Square webhook signature mismatch — rejected");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const body = JSON.parse(rawBody);
    
    // Square webhooks send events in an array, but usually one at a time
    
    // 1. Handle Successful Payments (New Subscriptions / Renewals / Sponsorships)
    if (body.type === "payment.updated") {
        const payment = body.data.object.payment;
        
        if (payment.status === "COMPLETED") {
            console.log("✅ Payment Completed:", payment.id);
            
            // Check for sponsorship note
            // Format: "Sponsorship for user: <userID>" OR "SPONSORSHIP_SUB:<recipientId>:<donorId>"
            const note = payment.note || "";
            const subscriptionId = payment.subscription_id;
            
            let recipientId = null;
            let isRecurringSponsorship = false;
            let donorId = "SquarePayment";

            // Case 1: First Payment of Recurring Sponsorship
            if (note.startsWith("SPONSORSHIP_SUB:")) {
                const parts = note.split(":");
                recipientId = parts[1];
                donorId = parts[2] || "Anonymous";
                isRecurringSponsorship = true;

                if (subscriptionId && recipientId) {
                    // Link subscription to recipient immediately
                    await UserService.updateUser(recipientId, {
                        "membership.sponsoredSubscriptionId": subscriptionId,
                        "membership.sponsoredBy": donorId
                    });
                }
            }
            // Case 2: One-time Sponsorship
            else if (note.startsWith("Sponsorship for user:")) {
                recipientId = note.split(":")[1].trim();
            }
            // Case 3: Subsequent Recurring Payment (No Note)
            else if (subscriptionId) {
                // Check if this subscription is a sponsorship for someone
                const { db } = await import("@/lib/database");
                const usersCollection = await db.dbUsers();
                
                // Check if it's a sponsorship subscription
                const recipient = await usersCollection.findOne({ "membership.sponsoredSubscriptionId": subscriptionId });
                
                if (recipient) {
                    recipientId = recipient.userID;
                    isRecurringSponsorship = true;
                    donorId = recipient.membership?.sponsoredBy || "Sponsor";
                } else {
                    // Check if it's a personal subscription
                    const user = await usersCollection.findOne({ "membership.squareSubscriptionId": subscriptionId });
                    if (user) {
                        // It's a personal subscription renewal
                        console.log(`🔄 Personal Subscription Renewal for ${user.userID}`);
                        await UserService.updateUser(user.userID, {
                            "membership.status": "active",
                            "membership.type": "co-op", // ✅ Ensure they are co-op
                            "membership.subscriptionStatus": "ACTIVE",
                            "membership.lastPaymentDate": new Date().toISOString(),
                            // Ensure key is valid if they were suspended
                            "membership.accessKey.issued": true 
                        });
                        return NextResponse.json({ success: true }, { status: 200 });
                    }
                }
            }

            if (recipientId) {
                console.log(`🎁 Processing Sponsorship for User: ${recipientId} (Recurring: ${isRecurringSponsorship})`);
                
                // 1. Fetch User to check for existing subscription
                const user = await UserService.getUserByQuery({ userID: recipientId });
                
                // 2. Calculate expiration date (30 days from now)
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 30);

                // 3. Handle Existing Square Subscription (Pause it)
                // We only pause if the user has their OWN subscription (not the one sponsoring them)
                if (user?.membership?.squareSubscriptionId && user.membership.squareSubscriptionId !== subscriptionId) {
                    try {
                        const subId = user.membership.squareSubscriptionId;
                        const { result } = await squareClient.subscriptionsApi.retrieveSubscription(subId);
                        const subscription = result.subscription;

                        if (subscription.status === 'ACTIVE') {
                            const chargedThroughDate = subscription.chargedThroughDate; // YYYY-MM-DD
                            
                            if (chargedThroughDate) {
                                // Calculate resume date (30 days after current billing cycle ends)
                                const resumeDateObj = new Date(chargedThroughDate);
                                resumeDateObj.setDate(resumeDateObj.getDate() + 30);
                                const resumeDate = resumeDateObj.toISOString().split('T')[0];

                                console.log(`⏸️ Pausing Subscription ${subId} from ${chargedThroughDate} to ${resumeDate}`);
                                
                                await squareClient.subscriptionsApi.pauseSubscription(subId, {
                                    pauseEffectiveDate: chargedThroughDate,
                                    resumeEffectiveDate: resumeDate,
                                    pauseReason: "Member Sponsorship Gift"
                                });
                            }
                        }
                    } catch (subError) {
                        console.error("⚠️ Failed to pause existing subscription:", subError);
                        // Continue to update user record even if pause fails
                    }
                }

                // 4. Update the user record
                const updateData = {
                    "membership.sponsorshipExpiresAt": expiresAt.toISOString(),
                    "membership.subscriptionStatus": isRecurringSponsorship ? "SPONSORED_RECURRING" : "SPONSORED",
                    "membership.lastPaymentDate": new Date().toISOString(),
                    "membership.status": "active", // Ensure they are active
                    "membership.type": "co-op", // ✅ Ensure they are co-op
                    "membership.accessKey.issued": true // Re-enable key if it was disabled
                };
                
                if (!isRecurringSponsorship) {
                     updateData["membership.sponsoredBy"] = "OneTimeGift";
                }
                
                await UserService.updateUser(recipientId, updateData);
                console.log(`✅ User ${recipientId} marked as sponsored until ${expiresAt.toISOString()}.`);
            }
        }
    }

    // 2. Handle Failed/Canceled Subscriptions (Revoke Access)
    if (body.type === "subscription.updated") {
        const subscription = body.data.object.subscription;
        const status = subscription.status;
        const subscriptionId = subscription.id;

        console.log(`🔄 Subscription ${subscriptionId} updated to ${status}`);

        if (['CANCELED', 'DEACTIVATED', 'PAST_DUE'].includes(status)) {
            const { db } = await import("@/lib/database");
            const usersCollection = await db.dbUsers();

            // Find user by Personal Subscription OR Sponsored Subscription
            const user = await usersCollection.findOne({
                $or: [
                    { "membership.squareSubscriptionId": subscriptionId },
                    { "membership.sponsoredSubscriptionId": subscriptionId }
                ]
            });

            if (user) {
                console.log(`⚠️ Revoking access for user ${user.userID} due to subscription status: ${status}`);
                
                await UserService.updateUser(user.userID, {
                    "membership.status": "suspended",
                    "membership.type": "community", // ✅ Revert to community
                    "membership.subscriptionStatus": status,
                    "membership.accessKey.issued": false, // Deactivate Key
                    "membership.accessKey.revokedReason": `Subscription ${status}`
                });
            }
        }
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error("Error processing payment webhook:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
