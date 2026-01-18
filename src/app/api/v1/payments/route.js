// src/app/api/v1/payments/route.js
import { NextResponse } from 'next/server';
import squareClient from "@/lib/square";
import { v4 as uuidv4 } from 'uuid';

export async function POST(req) {
  try {
    const { amount, customerId, sourceId, currency = "USD" } = await req.json();

    if (!amount || !sourceId) {
        return NextResponse.json({ error: "Missing amount or sourceId" }, { status: 400 });
    }

    const { result } = await squareClient.paymentsApi.createPayment({
      idempotencyKey: uuidv4(), // Ensure unique key for each request
      amountMoney: {
        amount: BigInt(amount), // Amount in cents (e.g., $10.00 => 1000)
        currency: currency,
      },
      sourceId: sourceId, // From Square payment form
      customerId: customerId, // Optional
    });

    // Note: BigInt cannot be serialized to JSON directly. Convert to string.
    const response = JSON.parse(JSON.stringify(result, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
    ));

    return NextResponse.json(response);
  } catch (error) {
    console.error("Square Payment Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
