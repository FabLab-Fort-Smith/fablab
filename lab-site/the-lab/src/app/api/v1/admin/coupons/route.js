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

// Validate discount inputs before they reach Square (SEC #186 F-1): reject float/negative/out-of-range
// rather than relying on Square-side rejection or throwing in BigInt(). Returns an error string or null.
function validateDiscount(type, percentage, amountCents) {
    if (type === "FIXED_PERCENTAGE") {
        const p = Number(percentage);
        if (!Number.isFinite(p) || p <= 0 || p > 100) return "percentage must be a number in (0, 100].";
        return null;
    }
    if (type === "FIXED_AMOUNT") {
        if (!Number.isInteger(amountCents) || amountCents <= 0) return "amountCents must be a positive integer (minor units).";
        return null;
    }
    return "discountType must be FIXED_PERCENTAGE or FIXED_AMOUNT.";
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
        console.error("admin coupons op failed:", err?.errors?.[0]?.detail || err?.message); return NextResponse.json({ error: "Failed to fetch discounts." }, { status: 500 });
    }
}

export async function POST(req) {
    const session = await requireAdmin();
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { name, discountType, percentage, amountCents, currency = "USD" } = await req.json();
    if (!name || !discountType) return NextResponse.json({ error: "name and discountType required." }, { status: 400 });

    const invalid = validateDiscount(discountType, percentage, amountCents);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const discountData = { name: name.toUpperCase().trim(), discountType };
    if (discountType === "FIXED_PERCENTAGE") {
        discountData.percentage = String(percentage);
    } else {
        discountData.amountMoney = { amount: BigInt(amountCents), currency };
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
        console.error("admin coupons op failed:", err?.errors?.[0]?.detail || err?.message); return NextResponse.json({ error: "Failed to create discount." }, { status: 500 });
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
        const pct = type === "FIXED_PERCENTAGE" ? (percentage ?? current.discountData?.percentage) : undefined;
        const cents = type === "FIXED_AMOUNT"
            ? (amountCents ?? (current.discountData?.amountMoney ? Number(current.discountData.amountMoney.amount) : undefined))
            : undefined;
        const invalid = validateDiscount(type, pct, cents);
        if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

        const discountData = { name: ((name ?? current.discountData?.name) || "").toUpperCase().trim(), discountType: type };
        if (type === "FIXED_PERCENTAGE") discountData.percentage = String(pct);
        else discountData.amountMoney = { amount: BigInt(cents), currency };

        const result = await upsertCatalogObject({
            idempotencyKey: uuidv4(),
            object: { type: "DISCOUNT", id: current.id, version: current.version, discountData },
        });
        const o = result.catalogObject;
        auditLog("admin.catalog.coupon.update", { actor: session.user?.userID || "admin", target: o.id, name: o.discountData?.name, outcome: "success" });
        return NextResponse.json(couponView(o), { status: 200 });
    } catch (err) {
        console.error("admin coupons op failed:", err?.errors?.[0]?.detail || err?.message); return NextResponse.json({ error: "Failed to update discount." }, { status: 500 });
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
        console.error("admin coupons op failed:", err?.errors?.[0]?.detail || err?.message); return NextResponse.json({ error: "Failed to delete discount." }, { status: 500 });
    }
}
