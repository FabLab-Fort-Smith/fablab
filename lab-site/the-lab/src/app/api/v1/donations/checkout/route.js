import { NextResponse } from 'next/server';
import { createPaymentLink } from '@/lib/square';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/database';
import { auth } from '@/auth';
import { parseAmountCents, InvalidAmountError } from '@/lib/money';
import { stripMongoOperators } from '@/lib/mongoSanitize';

// Anonymous donations are intentional — the kiosk QR and the public /donate page both use
// this. So this route is NOT auth-gated. What it must NOT do is trust the client for
// anything the client shouldn't decide (#182):
//   * amount  — validated as money and bounded, not `Math.round(unvalidated * 100)`
//   * senderId — from the SESSION if the donor happens to be signed in, never the body
//                (the body version let a donation be credited to any member)
//   * redirectUrl — was client-controlled and fed into the Square payment link, an
//                open-redirect/phishing vector. Always built server-side now.
//   * donorInfo — sanitized before it touches Mongo (SEC-19)
//
// A pending row is written before payment, but it only becomes `completed` via the
// signature-verified webhook — so an attacker can create junk PENDING rows but cannot forge
// completed revenue. Admin dashboards must sum completed donations, not pending.

export async function POST(req) {
    try {
        const body = await req.json();
        const { frequency, donorInfo } = body;

        let amountCents;
        try {
            amountCents = parseAmountCents(body.amount, { label: 'Donation' });
        } catch (err) {
            if (err instanceof InvalidAmountError) {
                return NextResponse.json({ error: err.message }, { status: 400 });
            }
            throw err;
        }

        // Attribution comes from the session, never the body. Anonymous donors get null.
        const session = await auth();
        const senderId = session?.user?.userID || null;

        const isRecurring = frequency === 'monthly';
        const transactionId = `txn-${uuidv4()}`;

        const transactions = await db.dbTransactions();
        await transactions.insertOne({
            transactionId,
            type: 'donation',
            amount: amountCents,
            currency: 'USD',
            status: 'pending', // becomes 'completed' only via the verified Square webhook
            senderId,
            createdAt: new Date(),
            metadata: stripMongoOperators({
                donorName: typeof donorInfo?.name === 'string' ? donorInfo.name.slice(0, 200) : undefined,
                donorEmail: typeof donorInfo?.email === 'string' ? donorInfo.email.slice(0, 320) : undefined,
                frequency: isRecurring ? 'monthly' : 'one-time',
                isRecurring,
            }),
        });

        const result = await createPaymentLink({
            idempotencyKey: transactionId, // stable per attempt, so a retry is not a second link
            quickPay: {
                name: isRecurring ? 'Monthly Donation' : 'Donation to Fab Lab Fort Smith',
                priceMoney: { amount: BigInt(amountCents), currency: 'USD' },
                locationId: process.env.SQUARE_LOCATION_ID,
            },
            // Server-built, never client-supplied — closes the open-redirect. (A shared
            // appUrl() helper lands in #162; kept inline here so #182 merges independently.)
            redirectUrl: `${(process.env.NEXT_PUBLIC_URL || '').replace(/\/+$/, '')}/donate/success?txnId=${transactionId}`,
        });

        if (!result.paymentLink?.url) {
            return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 502 });
        }

        await transactions.updateOne(
            { transactionId },
            { $set: { 'metadata.paymentLinkId': result.paymentLink.id } }
        );

        return NextResponse.json({ url: result.paymentLink.url });
    } catch (error) {
        // Generic to the client; detail stays in the log (§5).
        console.error('Donation Checkout Error:', error?.message);
        return NextResponse.json({ error: 'Checkout failed. Please try again.' }, { status: 500 });
    }
}
