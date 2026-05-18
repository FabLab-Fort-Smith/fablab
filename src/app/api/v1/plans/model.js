import { db } from "@/lib/database";
import squareClient from "@/lib/square";

const catalogApi = squareClient.catalogApi;
const subscriptionsApi = squareClient.subscriptionsApi;
const ordersApi = squareClient.ordersApi;

export default class PlansModel {
  static async getPlans() {
    // Load hidden plan IDs from DB
    const dbPlans = await db.dbPlans();
    const hiddenDoc = await dbPlans.findOne({ _id: "hidden_plans" });
    const hiddenIds = new Set(hiddenDoc?.ids || []);

    // Fetch live plan catalog from Square, filter out hidden
    const { result } = await catalogApi.listCatalog(undefined, "SUBSCRIPTION_PLAN");
    const rawPlans = (result.objects || []).filter(p => !hiddenIds.has(p.id));

    // Shape into a stable format for the frontend
    const plans = rawPlans.map(p => ({
      id: p.id,
      name: p.subscriptionPlanData?.name || "Unnamed Plan",
      variations: (p.subscriptionPlanData?.subscriptionPlanVariations || []).map(v => {
        const phases = v.subscriptionPlanVariationData?.phases || [];
        const billingPhase = phases[phases.length - 1];
        return {
          id: v.id,
          name: v.subscriptionPlanVariationData?.name || "",
          cadence: billingPhase?.cadence || "UNKNOWN",
          priceCents: null, // RELATIVE pricing — injected below from order templates
        };
      }),
    }));

    // Inject prices from one active subscriber's order template per variation
    try {
      const allVariationIds = plans.flatMap(p => p.variations.map(v => v.id));
      if (allVariationIds.length) {
        const { result: subsResult } = await subscriptionsApi.searchSubscriptions({
          limit: 200,
          query: { filter: { planVariationIds: allVariationIds, statuses: ["ACTIVE", "PAUSED"] } },
        });

        const varToTemplate = {};
        for (const s of (subsResult.subscriptions || [])) {
          if (s.planVariationId && s.phases?.[0]?.orderTemplateId && !varToTemplate[s.planVariationId])
            varToTemplate[s.planVariationId] = s.phases[0].orderTemplateId;
        }

        const uniqueTemplates = [...new Set(Object.values(varToTemplate))].filter(Boolean);
        const priceMap = {};
        await Promise.allSettled(
          uniqueTemplates.map(async (templateId) => {
            try {
              const { result: orderResult } = await ordersApi.retrieveOrder(templateId);
              const amount = orderResult.order?.lineItems?.[0]?.basePriceMoney?.amount;
              if (amount != null) priceMap[templateId] = Number(amount);
            } catch { /* non-fatal */ }
          })
        );

        for (const plan of plans)
          for (const v of plan.variations)
            if (varToTemplate[v.id] && priceMap[varToTemplate[v.id]] != null)
              v.priceCents = priceMap[varToTemplate[v.id]];
      }
    } catch (e) {
      console.error("⚠️ Failed to inject order template prices:", e);
    }

    return plans;
  }
}
