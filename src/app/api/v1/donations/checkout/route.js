
import { NextResponse } from 'next/server';
import squareClient from '@/lib/square';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/database';

export async function POST(req) {
    try {
        const { amount, frequency, redirectUrl, donorInfo, userId } = await req.json(); // amount in USD
        
        if (!amount) {
            return NextResponse.json({ error: "Amount required" }, { status: 400 });
        }

        const amountCents = Math.round(amount * 100);
        const transactionId = `txn-${uuidv4()}`;

        // Create Pending Transaction in DB
        const transactions = await db.dbTransactions();
        await transactions.insertOne({
            transactionId,
            type: 'donation',
            amount: amountCents,
            currency: 'USD',
            status: 'pending', // Will be updated by webhook or admin
            senderId: userId || null, // If logged in
            createdAt: new Date(),
            metadata: {
                donorName: donorInfo?.name,
                donorEmail: donorInfo?.email,
                frequency: frequency || 'one-time',
                isRecurring: frequency === 'monthly'
            }
        });
        
        const checkoutBody = {
            idempotencyKey: uuidv4(),
            quickPay: {
                name: frequency === 'monthly' ? "Monthly Donation" : "Donation to Fab Lab Fort Smith",
                priceMoney: {
                    amount: amountCents,
                    currency: "USD"
                },
                locationId: process.env.SQUARE_LOCATION_ID
            },
            redirectUrl: redirectUrl || `${process.env.NEXT_PUBLIC_URL}/donate/success?txnId=${transactionId}`,
        };

        const { result } = await squareClient.checkoutApi.createPaymentLink(checkoutBody);

        if (!result.paymentLink) {
            return NextResponse.json({ error: "Square did not return a payment link" }, { status: 500 });
        }

        // Update transaction with Square payment link ID
        await transactions.updateOne(
            { transactionId },
            { $set: { 'metadata.paymentLinkId': result.paymentLink.id } }
        );

        return NextResponse.json({ url: result.paymentLink.url });
    } catch (error) {
        console.error("Donation Checkout Error:", error);
        return NextResponse.json({ error: "Checkout failed: " + error.message }, { status: 500 });
    }
}
