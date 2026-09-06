import { NextResponse } from "next/server";
import { auth } from "../../../../../../auth";
import {
  getCatalogObject, listCatalog, upsertCatalogObject, deleteCatalogObject,
  searchSubscriptions, cancelSubscription, pauseSubscription, resumeSubscription, swapPlan,
  getOrder,
} from "@/lib/square";
import { db } from "@/lib/database";
import { auditLog } from "@/lib/audit";
import { v4 as uuidv4 } from "uuid";

// ── helpers ──────────────────────────────────────────────────────────────────

async function getHiddenPlanIds() {
  const col = await db.dbPlans();
  const doc = await col.findOne({ _id: "hidden_plans" });
  return new Set(doc?.ids || []);
}
async function setHiddenPlanId(planId) {
  const col = await db.dbPlans();
  await col.updateOne({ _id: "hidden_plans" }, { $addToSet: { ids: planId } }, { upsert: true });
}
async function unsetHiddenPlanId(planId) {
  const col = await db.dbPlans();
  await col.updateOne({ _id: "hidden_plans" }, { $pull: { ids: planId } });
}
async function getHiddenVariationIds() {
  const col = await db.dbPlans();
  const doc = await col.findOne({ _id: "hidden_variations" });
  return new Set(doc?.ids || []);
}
async function setHiddenVariationId(variationId) {
  const col = await db.dbPlans();
  await col.updateOne({ _id: "hidden_variations" }, { $addToSet: { ids: variationId } }, { upsert: true });
}
async function unsetHiddenVariationId(variationId) {
  const col = await db.dbPlans();
  await col.updateOne({ _id: "hidden_variations" }, { $pull: { ids: variationId } });
}
async function getLegacyPlanIds() {
  const col = await db.dbPlans();
  const doc = await col.findOne({ _id: "legacy_plans" });
  return new Set(doc?.ids || []);
}
async function setLegacyPlanId(planId) {
  const col = await db.dbPlans();
  await col.updateOne({ _id: "legacy_plans" }, { $addToSet: { ids: planId } }, { upsert: true });
}
async function unsetLegacyPlanId(planId) {
  const col = await db.dbPlans();
  await col.updateOne({ _id: "legacy_plans" }, { $pull: { ids: planId } });
}

async function getPlanMeta() {
  const col = await db.dbPlans();
  const doc = await col.findOne({ _id: "plan_meta" });
  return doc?.plans || {};
}
async function setPlanMeta(planId, meta) {
  const col = await db.dbPlans();
  await col.updateOne(
    { _id: "plan_meta" },
    { $set: { [`plans.${planId}`]: meta } },
    { upsert: true }
  );
}

// Fetch the base price from a list of order template IDs (parallel, non-fatal)
async function fetchOrderTemplatePrices(templateIds) {
  const priceMap = {};
  await Promise.allSettled(
    [...new Set(templateIds)].filter(Boolean).map(async (id) => {
      try {
        const result = await getOrder(id);
        const amount = result.order?.lineItems?.[0]?.basePriceMoney?.amount;
        if (amount != null) priceMap[id] = Number(amount);
      } catch { /* non-fatal */ }
    })
  );
  return priceMap;
}

async function fetchAllSubscriptions(filter) {
  const subs = [];
  let cursor;
  do {
    const result = await searchSubscriptions({ cursor, limit: 200, query: { filter } });
    subs.push(...(result.subscriptions || []));
    cursor = result.cursor;
  } while (cursor);
  return subs;
}

function shapePlan(plan, hidden, subscriberCount = 0, legacy = new Set()) {
  return {
    id: plan.id,
    version: Number(plan.version),
    name: plan.subscriptionPlanData?.name || "Unnamed Plan",
    hidden: hidden.has(plan.id),
    legacy: legacy.has(plan.id),
    subscriberCount,
    variations: (plan.subscriptionPlanData?.subscriptionPlanVariations || []).map((v) => {
      const phases = v.subscriptionPlanVariationData?.phases || [];
      // Square places billing last; trial (if any) is first with $0 price
      const billingPhase = phases[phases.length - 1];
      const trialPhase = phases.length > 1 ? phases[0] : null;
      // RELATIVE pricing = price is set per-subscription at creation, not stored in the catalog
      const pricingType = billingPhase?.pricing?.type;
      const isRelative = pricingType === "RELATIVE" || (!billingPhase?.pricing?.priceMoney?.amount && !billingPhase?.recurringPriceMoney?.amount);
      const priceAmount = isRelative
        ? null
        : Number(billingPhase?.pricing?.priceMoney?.amount ?? billingPhase?.recurringPriceMoney?.amount ?? 0);
      return {
        id: v.id,
        name: v.subscriptionPlanVariationData?.name || "",
        cadence: billingPhase?.cadence || "UNKNOWN",
        priceCents: priceAmount,
        trialDays: trialPhase ? Number(trialPhase.periods ?? 0) : 0,
      };
    }),
  };
}

// ── GET: list plans with subscriber counts ────────────────────────────────────

export async function GET(request) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const subscribersPlanId = searchParams.get("subscribers");

    // ── Subscriber list for a specific plan ──
    if (subscribersPlanId) {
      const planResult = await getCatalogObject(subscribersPlanId, true);
      const variationIds = (planResult.object?.subscriptionPlanData?.subscriptionPlanVariations || [])
        .map(v => v.id).filter(Boolean);

      if (!variationIds.length)
        return NextResponse.json([], { status: 200 });

      const allSubs = await fetchAllSubscriptions({ planVariationIds: variationIds });
      // Guard: Square's filter may return broader results; enforce locally
      const varSet = new Set(variationIds);
      const subs = allSubs.filter(s => varSet.has(s.planVariationId));

      // Fetch prices + customer info in parallel
      const orderTemplateIds = subs.map(s => s.phases?.[0]?.orderTemplateId).filter(Boolean);
      const [orderPriceMap, usersCol] = await Promise.all([
        fetchOrderTemplatePrices(orderTemplateIds),
        db.dbUsers(),
      ]);

      const customerIds = [...new Set(subs.map(s => s.customerId).filter(Boolean))];
      const users = customerIds.length
        ? await usersCol.find({ $or: [
            { "membership.squareCustomerId": { $in: customerIds } },
            { squareCustomerId: { $in: customerIds } },
            { squareID: { $in: customerIds } },
          ]}).toArray()
        : [];
      const customerMap = {};
      for (const u of users) {
        const id = u.membership?.squareCustomerId || u.squareCustomerId || u.squareID;
        // emails are encrypted in DB — only expose name identifiers
        if (id) customerMap[id] = { userID: u.userID, firstName: u.firstName, lastName: u.lastName };
      }

      return NextResponse.json(subs.map(s => {
        const pendingSwapAction = (s.actions || []).find(a => a.type === "SWAP_PLAN");
        return {
          id: s.id,
          status: s.status,
          planVariationId: s.planVariationId,
          startDate: s.startDate,
          canceledDate: s.canceledDate,
          chargedThroughDate: s.chargedThroughDate,
          customerId: s.customerId,
          customer: customerMap[s.customerId] || null,
          priceCents: orderPriceMap[s.phases?.[0]?.orderTemplateId] ?? null,
          pendingSwap: pendingSwapAction
            ? { newPlanVariationId: pendingSwapAction.newPlanVariationId, effectiveDate: pendingSwapAction.effectiveDate }
            : null,
        };
      }), { status: 200 });
    }

    // ── Full plan list ──
    const [catalogResult, hidden, hiddenVars, planMeta, legacy] = await Promise.all([
      listCatalog("SUBSCRIPTION_PLAN"),
      getHiddenPlanIds(),
      getHiddenVariationIds(),
      getPlanMeta(),
      getLegacyPlanIds(),
    ]);

    const rawPlans = catalogResult.objects || [];
    const allVariationIds = rawPlans.flatMap(p =>
      (p.subscriptionPlanData?.subscriptionPlanVariations || []).map(v => v.id)
    );

    // Fetch subscriber counts + one representative order template per variation
    const countByPlan = {};
    const varToPriceCents = {};
    if (allVariationIds.length) {
      const subs = await fetchAllSubscriptions({
        planVariationIds: allVariationIds,
        statuses: ["ACTIVE", "PAUSED"],
      });
      const varToPlan = {};
      for (const p of rawPlans)
        for (const v of (p.subscriptionPlanData?.subscriptionPlanVariations || []))
          varToPlan[v.id] = p.id;

      // One order template ID per variation (first active sub seen)
      const varToTemplate = {};
      for (const s of subs) {
        const pid = varToPlan[s.planVariationId];
        if (pid) countByPlan[pid] = (countByPlan[pid] || 0) + 1;
        if (s.planVariationId && s.phases?.[0]?.orderTemplateId && !varToTemplate[s.planVariationId])
          varToTemplate[s.planVariationId] = s.phases[0].orderTemplateId;
      }

      // Fetch prices for one sub per variation
      const priceMap = await fetchOrderTemplatePrices(Object.values(varToTemplate));
      for (const [varId, templateId] of Object.entries(varToTemplate)) {
        if (priceMap[templateId] != null) varToPriceCents[varId] = priceMap[templateId];
      }
    }

    // Shape plans, strip hidden variations, inject real prices, merge metadata
    const plans = rawPlans.map(p => {
      const shaped = shapePlan(p, hidden, countByPlan[p.id] || 0, legacy);
      shaped.variations = shaped.variations.filter(v => !hiddenVars.has(v.id));
      const meta = planMeta[p.id] || {};
      shaped.description = meta.description || '';
      shaped.benefits = meta.benefits || [];
      return shaped;
    });
    for (const plan of plans)
      for (const v of plan.variations)
        if (v.priceCents == null && varToPriceCents[v.id] != null)
          v.priceCents = varToPriceCents[v.id];

    return NextResponse.json(plans, { status: 200 });
  } catch (error) {
    console.error("❌ Error fetching plans:", error);
    return NextResponse.json({ error: "Failed to fetch plans." }, { status: 500 });
  }
}

// ── POST: create plan with flexible variations ────────────────────────────────

export async function POST(request) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { name, variations } = await request.json();
    if (!name || !variations?.length)
      return NextResponse.json({ error: "name and at least one variation are required." }, { status: 400 });

    const builtVariations = variations.map((v, idx) => {
      const phases = [];
      if (v.trialDays > 0) {
        phases.push({
          cadence: "DAILY",
          periods: v.trialDays,
          pricing: { type: "STATIC", priceMoney: { amount: BigInt(0), currency: "USD" } },
          ordinal: BigInt(0),
        });
      }
      phases.push({
        cadence: v.cadence,
        pricing: { type: "STATIC", priceMoney: { amount: BigInt(v.priceCents), currency: "USD" } },
        ordinal: BigInt(v.trialDays > 0 ? 1 : 0),
      });
      return {
        type: "SUBSCRIPTION_PLAN_VARIATION",
        id: `#var-${idx}-${uuidv4()}`,
        presentAtAllLocations: true,
        subscriptionPlanVariationData: {
          name: v.name || v.cadence,
          phases,
        },
      };
    });

    const result = await upsertCatalogObject({
      idempotencyKey: uuidv4(),
      object: {
        type: "SUBSCRIPTION_PLAN",
        id: `#plan-${uuidv4()}`,
        presentAtAllLocations: true,
        subscriptionPlanData: { name, subscriptionPlanVariations: builtVariations },
      },
    });

    auditLog("admin.catalog.plan.create", { actor: session.user.userID, target: result.catalogObject?.id, name, outcome: "success" });
    return NextResponse.json({ success: true, planId: result.catalogObject?.id }, { status: 201 });
  } catch (error) {
    console.error("❌ Error creating plan:", error);
    return NextResponse.json({ error: "Failed to create plan." }, { status: 500 });
  }
}

// ── PUT: rename plan, edit variation prices, or restore hidden ────────────────

export async function PUT(request) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { planId, name, variations, newVariations, restore, removeVariationId, meta, markLegacy, unmarkLegacy } = await request.json();
    if (!planId)
      return NextResponse.json({ error: "planId is required." }, { status: 400 });

    if (restore) {
      await unsetHiddenPlanId(planId);
      auditLog("admin.catalog.plan.restore", { actor: session.user.userID, target: planId, outcome: "success" });
      return NextResponse.json({ success: true, restored: true }, { status: 200 });
    }

    if (markLegacy) {
      await setLegacyPlanId(planId);
      auditLog("admin.catalog.plan.legacy", { actor: session.user.userID, target: planId, legacy: true, outcome: "success" });
      return NextResponse.json({ success: true, legacy: true }, { status: 200 });
    }

    if (unmarkLegacy) {
      await unsetLegacyPlanId(planId);
      auditLog("admin.catalog.plan.legacy", { actor: session.user.userID, target: planId, legacy: false, outcome: "success" });
      return NextResponse.json({ success: true, legacy: false }, { status: 200 });
    }

    if (removeVariationId) {
      const current = await getCatalogObject(planId, true);
      const existing = current.object;
      if (!existing) return NextResponse.json({ error: "Plan not found." }, { status: 404 });
      const remaining = (existing.subscriptionPlanData?.subscriptionPlanVariations || [])
        .filter(v => v.id !== removeVariationId);
      if (!remaining.length)
        return NextResponse.json({ error: "Cannot remove the only variation." }, { status: 400 });
      try {
        const upsertResult = await upsertCatalogObject({
          idempotencyKey: uuidv4(),
          object: {
            ...existing,
            subscriptionPlanData: { ...existing.subscriptionPlanData, subscriptionPlanVariations: remaining },
          },
        });
        if (upsertResult.errors?.length) {
          // Square blocked removal — hide it locally instead
          await setHiddenVariationId(removeVariationId);
          auditLog("admin.catalog.plan.variation.remove", { actor: session.user.userID, target: planId, variationId: removeVariationId, mode: "hidden", outcome: "success" });
          return NextResponse.json({ success: true, hidden: true, note: "Square blocked deletion (subscription history). Variation hidden from member selection." }, { status: 200 });
        }
        auditLog("admin.catalog.plan.variation.remove", { actor: session.user.userID, target: planId, variationId: removeVariationId, mode: "removed", outcome: "success" });
        return NextResponse.json({ success: true, variationRemoved: true }, { status: 200 });
      } catch (squareErr) {
        console.warn("⚠️ Square blocked variation removal, hiding locally:", squareErr?.errors?.[0]?.detail || squareErr?.message);
        // Fall back to hiding locally (same pattern as archived plans)
        await setHiddenVariationId(removeVariationId);
        auditLog("admin.catalog.plan.variation.remove", { actor: session.user.userID, target: planId, variationId: removeVariationId, mode: "hidden", outcome: "success" });
        return NextResponse.json({ success: true, hidden: true, note: "Square blocked deletion (subscription history). Variation hidden from member selection." }, { status: 200 });
      }
    }

    const current = await getCatalogObject(planId, true);
    const existing = current.object;
    if (!existing)
      return NextResponse.json({ error: "Plan not found." }, { status: 404 });

    // Apply variation price updates if provided
    let updatedVariations = existing.subscriptionPlanData?.subscriptionPlanVariations || [];
    if (variations?.length) {
      updatedVariations = updatedVariations.map(v => {
        const update = variations.find(u => u.id === v.id);
        if (!update) return v;
        const cents = Math.round(Number(update.priceCents));
        if (!Number.isFinite(cents) || cents < 0) return v; // skip invalid
        const phases = (v.subscriptionPlanVariationData?.phases || []).map((phase, i) => {
          const isTrialPhase = i === 0 && (v.subscriptionPlanVariationData?.phases || []).length > 1;
          if (isTrialPhase) return phase;
          return {
            ...phase,
            pricing: { type: "STATIC", priceMoney: { amount: BigInt(cents), currency: "USD" } },
          };
        });
        return { ...v, subscriptionPlanVariationData: { ...v.subscriptionPlanVariationData, phases } };
      });
    }

    // Save description/benefits metadata (non-fatal if Square upsert later fails)
    if (meta) await setPlanMeta(planId, { description: meta.description || '', benefits: meta.benefits || [] });

    // Append any new variations (STATIC pricing, set from scratch)
    if (newVariations?.length) {
      for (const nv of newVariations) {
        const cents = Math.round(Number(nv.priceCents));
        if (!Number.isFinite(cents) || cents <= 0) continue;
        updatedVariations.push({
          type: "SUBSCRIPTION_PLAN_VARIATION",
          id: `#new-var-${uuidv4()}`,
          presentAtAllLocations: true,
          subscriptionPlanVariationData: {
            name: nv.name || nv.cadence,
            phases: [{
              cadence: nv.cadence,
              pricing: { type: "STATIC", priceMoney: { amount: BigInt(cents), currency: "USD" } },
              ordinal: BigInt(0),
            }],
          },
        });
      }
    }

    try {
      const result = await upsertCatalogObject({
        idempotencyKey: uuidv4(),
        object: {
          ...existing,
          subscriptionPlanData: {
            ...existing.subscriptionPlanData,
            ...(name ? { name } : {}),
            subscriptionPlanVariations: updatedVariations,
          },
        },
      });
      auditLog("admin.catalog.plan.update", { actor: session.user.userID, target: result.catalogObject?.id, outcome: "success" });
      return NextResponse.json({ success: true, planId: result.catalogObject?.id }, { status: 200 });
    } catch (squareErr) {
      const msg = squareErr?.errors?.[0]?.detail || squareErr?.message || "Square rejected the update.";
      console.error("❌ Square upsert error:", msg);
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  } catch (error) {
    // Internal (non-Square-business-rule) failure — log the detail server-side, return a generic 500
    // so Square/internal error text isn't leaked to the client (SEC #186 carry-in).
    console.error("❌ Error updating plan:", error?.errors?.[0]?.detail || error?.message);
    return NextResponse.json({ error: "Failed to update plan." }, { status: 500 });
  }
}

// ── PATCH: pause / resume / cancel a single subscription ─────────────────────

export async function PATCH(request) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { action, subscriptionId, newPlanVariationId } = await request.json();
    if (!action || !subscriptionId)
      return NextResponse.json({ error: "action and subscriptionId are required." }, { status: 400 });

    if (action === "pause") {
      await pauseSubscription(subscriptionId, {});
    } else if (action === "resume") {
      await resumeSubscription(subscriptionId, {});
    } else if (action === "cancel") {
      await cancelSubscription(subscriptionId);
    } else if (action === "migrate") {
      if (!newPlanVariationId)
        return NextResponse.json({ error: "newPlanVariationId is required." }, { status: 400 });
      const swapResult = await swapPlan(subscriptionId, { newPlanVariationId });
      // Square queues the swap for the next billing cycle — find the pending action's effective date
      const pendingAction = (swapResult.subscription?.actions || []).find(a => a.type === "SWAP_PLAN");
      const effectiveDate = pendingAction?.effectiveDate || swapResult.subscription?.chargedThroughDate || null;
      auditLog("admin.catalog.plan.subscription", { actor: session.user.userID, action, subscriptionId, pending: true, outcome: "success" });
      return NextResponse.json({ success: true, pending: true, effectiveDate }, { status: 200 });
    } else {
      return NextResponse.json({ error: "Invalid action. Use pause, resume, cancel, or migrate." }, { status: 400 });
    }

    auditLog("admin.catalog.plan.subscription", { actor: session.user.userID, action, subscriptionId, outcome: "success" });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("❌ Subscription action error:", error?.errors?.[0]?.detail || error?.message);
    return NextResponse.json({ error: "Failed to update subscription." }, { status: 500 });
  }
}

// ── DELETE: cancel subscribers (optional) then delete from Square ─────────────

export async function DELETE(request) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { planId, cancelSubscriptions } = await request.json();
    if (!planId)
      return NextResponse.json({ error: "planId is required." }, { status: 400 });

    let cancelledCount = 0;
    if (cancelSubscriptions) {
      const planResult = await getCatalogObject(planId, true);
      const variationIds = (planResult.object?.subscriptionPlanData?.subscriptionPlanVariations || [])
        .map(v => v.id).filter(Boolean);

      if (variationIds.length) {
        const subs = await fetchAllSubscriptions({ planVariationIds: variationIds, statuses: ["ACTIVE", "PAUSED"] });
        await Promise.allSettled(
          subs.map(s =>
            cancelSubscription(s.id)
              .then(() => { cancelledCount++; })
              .catch(err => console.warn(`⚠️ Could not cancel ${s.id}:`, err?.message))
          )
        );
      }
    }

    try {
      const result = await deleteCatalogObject(planId);
      if (result.errors?.length)
        throw Object.assign(new Error(result.errors[0]?.detail), { errors: result.errors });
      await unsetHiddenPlanId(planId);
      auditLog("admin.catalog.plan.delete", { actor: session.user.userID, target: planId, cancelledCount, mode: "deleted", outcome: "success" });
      return NextResponse.json({ success: true, deleted: true, cancelledCount }, { status: 200 });
    } catch (squareErr) {
      const reason = squareErr?.errors?.[0]?.detail || squareErr?.message;
      console.warn("⚠️ Square blocked delete, hiding locally:", reason);
      await setHiddenPlanId(planId);
      auditLog("admin.catalog.plan.delete", { actor: session.user.userID, target: planId, cancelledCount, mode: "hidden", outcome: "success" });
      return NextResponse.json({
        success: true, hidden: true, cancelledCount,
        note: "Plan has active subscribers and cannot be removed from Square. Hidden from member selection.",
      }, { status: 200 });
    }
  } catch (error) {
    console.error("❌ Error archiving plan:", error);
    return NextResponse.json({ error: "Failed to archive plan." }, { status: 500 });
  }
}
