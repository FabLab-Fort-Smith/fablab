import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import squareClient from "@/lib/square";
import { v4 as uuidv4 } from "uuid";

async function requireAdmin() {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "admin") return null;
    return session;
}

export async function GET() {
    if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    try {
        const { result } = await squareClient.catalogApi.listCatalog(undefined, "DISCOUNT");
        const discounts = (result.objects || []).map(o => ({
            id: o.id,
            name: o.discountData?.name,
            discountType: o.discountData?.discountType,
            percentage: o.discountData?.percentage,
            amountMoney: o.discountData?.amountMoney
                ? { amount: Number(o.discountData.amountMoney.amount), currency: o.discountData.amountMoney.currency }
                : null,
        }));
        return NextResponse.json(discounts);
    } catch (err) {
        return NextResponse.json({ error: err?.errors?.[0]?.detail || "Failed to fetch discounts." }, { status: 500 });
    }
}

export async function POST(req) {
    if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { name, discountType, percentage, amountCents, currency = "USD" } = await req.json();
    if (!name || !discountType) return NextResponse.json({ error: "name and discountType required." }, { status: 400 });

    const discountData = { name: name.toUpperCase().trim(), discountType };
    if (discountType === "FIXED_PERCENTAGE") {
        if (!percentage) return NextResponse.json({ error: "percentage required." }, { status: 400 });
        discountData.percentage = String(percentage);
    } else if (discountType === "FIXED_AMOUNT") {
        if (!amountCents) return NextResponse.json({ error: "amountCents required." }, { status: 400 });
        discountData.amountMoney = { amount: BigInt(amountCents), currency };
    } else {
        return NextResponse.json({ error: "discountType must be FIXED_PERCENTAGE or FIXED_AMOUNT." }, { status: 400 });
    }

    try {
        const { result } = await squareClient.catalogApi.upsertCatalogObject({
            idempotencyKey: uuidv4(),
            object: { type: "DISCOUNT", id: "#new", discountData },
        });
        const o = result.catalogObject;
        return NextResponse.json({
            id: o.id,
            name: o.discountData?.name,
            discountType: o.discountData?.discountType,
            percentage: o.discountData?.percentage,
            amountMoney: o.discountData?.amountMoney
                ? { amount: Number(o.discountData.amountMoney.amount), currency: o.discountData.amountMoney.currency }
                : null,
        }, { status: 201 });
    } catch (err) {
        return NextResponse.json({ error: err?.errors?.[0]?.detail || "Failed to create discount." }, { status: 500 });
    }
}

export async function DELETE(req) {
    if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
    try {
        await squareClient.catalogApi.deleteCatalogObject(id);
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: err?.errors?.[0]?.detail || "Failed to delete discount." }, { status: 500 });
    }
}
