import { db } from "@/lib/database";
import { listCatalog, searchSubscriptions, getOrder } from "@/lib/square";

export default class PlansModel {
  static async getPlans() {
    const dbPlans = await db.dbPlans();
    const [hiddenDoc, hiddenVarDoc, metaDoc, legacyDoc] = await Promise.all([
      dbPlans.findOne({ _id: "hidden_plans" }),
      dbPlans.findOne({ _id: "hidden_variations" }),
      dbPlans.findOne({ _id: "plan_meta" }),
      dbPlans.findOne({ _id: "legacy_plans" }),
    ]);
    const hiddenIds = new Set(hiddenDoc?.ids || []);
    const hiddenVarIds = new Set(hiddenVarDoc?.ids || []);
    const legacyIds = new Set(legacyDoc?.ids || []);
    const planMeta = metaDoc?.plans || {};

    const result = await listCatalog("SUBSCRIPTION_PLAN");
    const rawPlans = (result.objects || []).filter(p => !hiddenIds.has(p.id) && !legacyIds.has(p.id));

    const plans = rawPlans.map(p => ({
      id: p.id,
      name: p.subscriptionPlanData?.name || "Unnamed Plan",
      description: planMeta[p.id]?.description || '',
      benefits: planMeta[p.id]?.benefits || [],
      variations: (p.subscriptionPlanData?.subscriptionPlanVariations || []).filter(v => !hiddenVarIds.has(v.id)).map(v => {
        const phases = v.subscriptionPlanVariationData?.phases || [];
        const billingPhase = phases[phases.length - 1];
        const pricingType = billingPhase?.pricing?.type;
        const isRelative = pricingType === "RELATIVE" ||
          (!billingPhase?.pricing?.priceMoney?.amount && !billingPhase?.recurringPriceMoney?.amount);
        return {
          id: v.id,
          name: v.subscriptionPlanVariationData?.name || "",
          cadence: billingPhase?.cadence || "UNKNOWN",
          priceCents: isRelative
            ? null
            : Number(billingPhase?.pricing?.priceMoney?.amount ?? billingPhase?.recurringPriceMoney?.amount ?? 0),
        };
      }),
    }));

    // For RELATIVE-priced variations, inject price from a subscriber's order template
    try {
      const relativeVarIds = new Set(
        plans.flatMap(p => p.variations.filter(v => v.priceCents == null).map(v => v.id))
      );
      if (relativeVarIds.size) {
        const subsResult = await searchSubscriptions({
          limit: 200,
          query: { filter: { statuses: ["ACTIVE", "PAUSED"] } },
        });

        const varToTemplate = {};
        for (const s of (subsResult.subscriptions || [])) {
          if (s.planVariationId && relativeVarIds.has(s.planVariationId) &&
              s.phases?.[0]?.orderTemplateId && !varToTemplate[s.planVariationId])
            varToTemplate[s.planVariationId] = s.phases[0].orderTemplateId;
        }

        const uniqueTemplates = [...new Set(Object.values(varToTemplate))].filter(Boolean);
        const priceMap = {};
        await Promise.allSettled(
          uniqueTemplates.map(async (templateId) => {
            try {
              const orderResult = await getOrder(templateId);
              const amount = orderResult.order?.lineItems?.[0]?.basePriceMoney?.amount;
              if (amount != null) priceMap[templateId] = Number(amount);
            } catch { /* non-fatal */ }
          })
        );

        for (const plan of plans)
          for (const v of plan.variations)
            if (v.priceCents == null && varToTemplate[v.id] && priceMap[varToTemplate[v.id]] != null)
              v.priceCents = priceMap[varToTemplate[v.id]];
      }
    } catch (e) {
      console.error("⚠️ Failed to inject order template prices:", e);
    }

    return plans;
  }
}
