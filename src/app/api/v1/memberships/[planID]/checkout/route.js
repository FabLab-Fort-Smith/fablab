import { NextResponse } from "next/server";
import squareClient from "@/lib/square";
import { db } from "@/lib/database";
import { v4 as uuidv4 } from "uuid";

const customersApi = squareClient.customersApi;
const checkoutApi = squareClient.checkoutApi; // For creating the checkout link

export async function POST(request, context) {
  try {
    const { params } = context;
    const { planID } = await params;
    // Expecting userID, price, currency, and addon in the request body
    const { userID, price, currency, addon } = await request.json();

    if (!userID || !price || !currency) {
      return NextResponse.json(
        { error: "Missing required parameters." },
        { status: 400 }
      );
    }

    // Retrieve the user collection and find the user in your database
    const usersCollection = await db.dbUsers();
    const user = await usersCollection.findOne({ userID });
    if (!user) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 }
      );
    }

    // Create a Square Customer if one doesn't exist for this user
    let squareCustomerId = user.squareCustomerId;
    if (!squareCustomerId) {
      const customerBody = {
        idempotencyKey: uuidv4(),
        givenName: user.firstName || "Unknown",
        familyName: user.lastName || "User",
        emailAddress: user.email,
        referenceId: userID,
      };

      const { result } = await customersApi.createCustomer(customerBody);
      squareCustomerId = result.customer.id;

      // Save the Square customer ID to your database
      await usersCollection.updateOne({ userID }, { $set: { squareCustomerId } });
    }

    // Build the checkout link request using the planID from the URL
    const checkoutBody = {
      idempotencyKey: uuidv4(),
      quickPay: {
        name: "Subscription Plan",
        priceMoney: {
          amount: price * 100, // Convert dollars to cents
          currency: currency,
        },
        locationId: process.env.SQUARE_LOCATION_ID,
      },
      checkoutOptions: {
        subscription_plan_id: planID,
      },
    };

    // Include addon in the checkout request if selected
    if (addon) {
      checkoutBody.quickPay.name += " + Locker Addon";
      checkoutBody.quickPay.priceMoney.amount += 500; // Example addon price in cents
    }

    // Create the checkout link using Square's Checkout API
    const { result: checkoutResult } = await checkoutApi.createPaymentLink(checkoutBody);

    if (!checkoutResult.paymentLink) {
      return NextResponse.json(
        { error: "Failed to create checkout link." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { url: checkoutResult.paymentLink.url },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error creating checkout link:", error);
    return NextResponse.json(
      { error: "Failed to create checkout link." },
      { status: 500 }
    );
  }
}
