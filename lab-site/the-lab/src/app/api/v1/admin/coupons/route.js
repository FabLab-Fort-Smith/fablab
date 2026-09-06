import { NextResponse } from "next/server";
import { auth } from "../../../../../../auth";
import { listCatalog, upsertCatalogObject, deleteCatalogObject, getCatalogObject } from "@/lib/square";
import { auditLog } from "@/lib/audit";
import { v4 as uuidv4 } from "uuid";

async function requireAdmin() {
    const session = await auth();
    if (!session || session.user.role !== "admin") return null;
    return session;
}

const couponView = (o) => ({
    id: o.id,
    name: o.discountData?.name,
    discountType: o.discountData?.discountType,
    percentage: o.discountData?.percentage,
    amountMoney: o.discountData?.amountMoney
        ? { amount: Number(o.discountData.amountMoney.amount), currency: o.discountData.amountMoney.currency }
        : null,
});

export async function GET() {
    if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    try {
        const result = await listCatalog("DISCOUNT");
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
    const session = await requireAdmin();
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
        const result = await upsertCatalogObject({
            idempotencyKey: uuidv4(),
            object: { type: "DISCOUNT", id: "#new", discountData },
        });
        const o = result.catalogObject;
        auditLog("admin.catalog.coupon.create", { actor: session.user?.userID || "admin", target: o.id, name: o.discountData?.name, outcome: "success" });
        return NextResponse.json(couponView(o), { status: 201 });
    } catch (err) {
        return NextResponse.json({ error: err?.errors?.[0]?.detail || "Failed to create discount." }, { status: 500 });
    }
}

// AC-6: update an existing coupon (rename / change percentage or amount). Uses catalog version.
export async function PUT(req) {
    const session = await requireAdmin();
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id, name, discountType, percentage, amountCents, currency = "USD" } = await req.json();
    if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });

    try {
        const current = (await getCatalogObject(id))?.object;
        if (!current || current.type !== "DISCOUNT") {
            return NextResponse.json({ error: "coupon not found." }, { status: 404 });
        }
        const type = discountType || current.discountData?.discountType;
        const discountData = { name: ((name ?? current.discountData?.name) || "").toUpperCase().trim(), discountType: type };
        if (type === "FIXED_PERCENTAGE") {
            const pct = percentage ?? current.discountData?.percentage;
            if (!pct) return NextResponse.json({ error: "percentage required." }, { status: 400 });
            discountData.percentage = String(pct);
        } else if (type === "FIXED_AMOUNT") {
            const cents = amountCents ?? (current.discountData?.amountMoney ? Number(current.discountData.amountMoney.amount) : null);
            if (!cents) return NextResponse.json({ error: "amountCents required." }, { status: 400 });
            discountData.amountMoney = { amount: BigInt(cents), currency };
        } else {
            return NextResponse.json({ error: "discountType must be FIXED_PERCENTAGE or FIXED_AMOUNT." }, { status: 400 });
        }

        const result = await upsertCatalogObject({
            idempotencyKey: uuidv4(),
            object: { type: "DISCOUNT", id: current.id, version: current.version, discountData },
        });
        const o = result.catalogObject;
        auditLog("admin.catalog.coupon.update", { actor: session.user?.userID || "admin", target: o.id, name: o.discountData?.name, outcome: "success" });
        return NextResponse.json(couponView(o), { status: 200 });
    } catch (err) {
        return NextResponse.json({ error: err?.errors?.[0]?.detail || "Failed to update discount." }, { status: 500 });
    }
}

export async function DELETE(req) {
    const session = await requireAdmin();
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
    try {
        await deleteCatalogObject(id);
        auditLog("admin.catalog.coupon.delete", { actor: session.user?.userID || "admin", target: id, outcome: "success" });
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: err?.errors?.[0]?.detail || "Failed to delete discount." }, { status: 500 });
    }
}
