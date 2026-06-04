
import { NextResponse } from "next/server";
import { createPaymentLink } from "@/lib/square";
import { db } from "@/lib/database";
import { v4 as uuidv4 } from "uuid";

export async function POST(request) {
  try {
    const { recipientId, donorId, type = 'one-time' } = await request.json();

    if (!recipientId) {
      return NextResponse.json(
        { error: "Missing recipient ID." },
        { status: 400 }
      );
    }

    // Fetch recipient to get name
    const usersCollection = await db.dbUsers();
    const recipient = await usersCollection.findOne({ userID: recipientId });
    
    if (!recipient) {
        return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
    }

    const recipientName = `${recipient.firstName} ${recipient.lastName}`;
    const idempotencyKey = uuidv4();
    
    let checkoutBody;

    if (type === 'subscription') {
        // Recurring Sponsorship (Basic Monthly Plan - $45)
        // Plan ID: PCEZ6T7O75VRUSXXYNVOD2PC
        const planID = "PCEZ6T7O75VRUSXXYNVOD2PC";
        
        checkoutBody = {
            idempotencyKey,
            quickPay: {
                name: `Monthly Sponsorship for ${recipientName}`,
                priceMoney: {
                    amount: 4500, // $45.00
                    currency: "USD",
                },
                locationId: process.env.SQUARE_LOCATION_ID,
            },
            checkoutOptions: {
                subscription_plan_id: planID,
            },
            // We use a structured note to identify the recipient on the first payment
            paymentNote: `SPONSORSHIP_SUB:${recipientId}:${donorId}`,
            redirectUrl: `${process.env.NEXTAUTH_URL}/dashboard/directory?sponsorship=success&recipient=${recipientId}&type=subscription`
        };
    } else {
        // One-time Gift ($45)
        checkoutBody = {
            idempotencyKey,
            quickPay: {
                name: `Sponsorship Gift for ${recipientName}`,
                priceMoney: {
                    amount: 4500, // $45.00
                    currency: "USD",
                },
                locationId: process.env.SQUARE_LOCATION_ID,
            },
            paymentNote: `Sponsorship for user: ${recipientId}`,
            metadata: {
                type: "sponsorship",
                recipientId: recipientId,
                donorId: donorId || "anonymous"
            },
            redirectUrl: `${process.env.NEXTAUTH_URL}/dashboard/directory?sponsorship=success&recipient=${recipientId}&type=onetime`
        };
    }

    const result = await createPaymentLink(checkoutBody);

    if (!result.paymentLink) {
      return NextResponse.json(
        { error: "Failed to create checkout link." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { url: result.paymentLink.url },
      { status: 200 }
    );

  } catch (error) {
    console.error("Error creating sponsorship link:", error);
    return NextResponse.json(
      { error: "Failed to create sponsorship link." },
      { status: 500 }
    );
  }
}
