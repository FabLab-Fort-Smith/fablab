import { getCustomer, searchSubscriptions } from "@/lib/square";
import UserService from "../../users/service.js";
import AuthService from "@/app/api/auth/[...nextauth]/service.js";
import Constants from "@/lib/constants";

export default class SubscriptionService {
  static processWebhook = async (payload) => {
    try {
      // Extract the customer_id from the nested payload.
      const subscription = payload?.data?.object?.subscription;
      const customer_id = subscription?.customer_id;
      const subscriptionStatus = subscription?.status; // ACTIVE, CANCELED, etc.

      if (!customer_id) {
        throw new Error("Missing customer_id in webhook payload.");
      }

      let customer;
      try {
        // Retrieve the full customer object from Square.
        const response = await getCustomer(customer_id);
        customer = response.customer;
      } catch (error) {
        if (error.statusCode === 404) {
          console.warn(
            `Customer with ID ${customer_id} not found. It may not be created yet. Skipping update.`
          );
          return; // Optionally, implement a retry mechanism here.
        }
        throw error;
      }

      if (!customer || !customer.emailAddress) {
        throw new Error("Customer not found or missing email address in Square response.");
      }

      // Find the lab user with the matching email.
      const labUser = await UserService.getUserByQuery({ email: customer.emailAddress });
      if (!labUser) {
        throw new Error("No lab user found with matching email.");
      }

      // Encrypt the customer email to match the stored value.
      const encryptedEmail = AuthService.encryptEmail(customer.emailAddress);

      // Determine membership type based on subscription status
      const membershipType = subscriptionStatus === 'ACTIVE' ? 'co-op' : 'community';

      // Update the lab user with the Square customer_id using the encrypted email as query.
      const updateData = { 
        squareID: customer_id,
        "membership.squareSubscriptionId": subscription.id,
        "membership.subscriptionStatus": subscriptionStatus,
        "membership.type": membershipType, // ✅ Update membership type
        "membership.lastPaymentDate": new Date().toISOString()
      };

      // Check if this is a new ACTIVE subscription
      if (subscriptionStatus === 'ACTIVE' && labUser.membership?.subscriptionStatus !== 'ACTIVE') {
          updateData.stake = (labUser.stake || 0) + Constants.ONBOARDING_REWARDS.SUBSCRIBE;
          
          if (!updateData.$push) updateData.$push = {};
          if (!updateData.$push.stakeHistory) updateData.$push.stakeHistory = { $each: [] };
          
          updateData.$push.stakeHistory.$each.push({
              amount: Constants.ONBOARDING_REWARDS.SUBSCRIBE,
              reason: "Subscription Reward",
              timestamp: new Date()
          });
      }

      const updatedUser = await UserService.updateUser(encryptedEmail, updateData);
      if (!updatedUser) {
        throw new Error("Failed to update lab user with squareID.");
      }

      console.log("Successfully updated lab user with squareID:", updatedUser);
      return updatedUser;
    } catch (error) {
      console.error("Error in SubscriptionService.processWebhook:", error);
      throw error;
    }
  }

  static syncSubscription = async (squareID, userID = null) => {
    try {
      // Search for subscriptions for this customer
      const response = await searchSubscriptions({
        query: {
          filter: {
            customerIds: [squareID],
          },
        },
      });

      const subscriptions = response.subscriptions;
      if (!subscriptions || subscriptions.length === 0) {
        return null;
      }

      // Find the most relevant subscription (ACTIVE takes precedence)
      const activeSubscription =
        subscriptions.find((s) => s.status === "ACTIVE") || subscriptions[0];

      let targetUserID = userID;
      let targetUser = null;
      if (!targetUserID) {
          targetUser = await UserService.getUserByQuery({ squareID });
          if (!targetUser) {
            throw new Error("User not found for squareID: " + squareID);
          }
          targetUserID = targetUser.userID;
      } else {
          targetUser = await UserService.getUserByQuery({ userID: targetUserID });
      }

      // Waived members are exempt — never let a Square sync revoke their access
      if (targetUser?.membership?.isWaived) {
          console.log(`⏭ Skipping sync for waived member ${targetUserID}`);
          return targetUser;
      }

      // ACTIVE = paying. PENDING = future-dated (e.g. annual plan paid upfront, sub starts later).
      // Both get door access. PAUSED is intentional — keep access.
      const hasAccess = ['ACTIVE', 'PENDING'].includes(activeSubscription.status);
      const membershipType = hasAccess ? 'co-op' : 'community';

      const updateData = {
        squareID: squareID,
        "membership.squareSubscriptionId": activeSubscription.id,
        "membership.subscriptionStatus": activeSubscription.status,
        "membership.type": membershipType,
        "membership.status": hasAccess ? "active" : "suspended",
        "membership.accessKey.issued": hasAccess,
        "membership.lastPaymentDate": activeSubscription.status === 'ACTIVE' ? new Date().toISOString() : undefined,
      };

      if (!hasAccess) {
        updateData["membership.accessKey.revokedReason"] = `Subscription ${activeSubscription.status}`;
      }
      
      // Use userID for update query
      const updatedUser = await UserService.updateUser(targetUserID, updateData);
      
      return updatedUser;
    } catch (error) {
      console.error("Error syncing subscription:", error);
      throw error;
    }
  };
}
