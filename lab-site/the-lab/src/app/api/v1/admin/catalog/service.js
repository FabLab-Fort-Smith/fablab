// Admin catalog-item (product/service) CRUD service (AC-6). Manages generic Square catalog ITEMs and
// their ITEM_VARIATION prices — distinct from membership plans (SUBSCRIPTION_PLAN) and coupons
// (DISCOUNT), which have their own admin routes.
//
// All Square access goes through the @/lib/square seam. Amounts are minor units (bigint under v44).
// Every mutation is audited (admin.catalog.item.*). Updates use Square's optimistic-concurrency
// `version`: we re-fetch the current object to carry each variation's id+version so an edit can't
// clobber a concurrent change.

import { v4 as uuidv4 } from "uuid";
import { searchCatalogObjects, getCatalogObject, upsertCatalogObject, deleteCatalogObject } from "@/lib/square";
import { auditLog } from "@/lib/audit";

export class CatalogValidationError extends Error {
  constructor(message) { super(message); this.name = "CatalogValidationError"; this.status = 400; }
}
export class CatalogNotFoundError extends Error {
  constructor(message = "item not found") { super(message); this.name = "CatalogNotFoundError"; this.status = 404; }
}

function toCents(money) {
  const n = money?.amount == null ? null : Number(money.amount);
  return Number.isFinite(n) ? n : null;
}

// Allow-listed view of a Square ITEM (never the raw object).
function sanitizeItem(o) {
  const d = o?.itemData || {};
  return {
    id: o?.id || null,
    version: o?.version != null ? Number(o.version) : null,
    name: d.name || null,
    description: d.description || null,
    variations: (d.variations || []).map((v) => ({
      id: v?.id || null,
      version: v?.version != null ? Number(v.version) : null,
      name: v?.itemVariationData?.name || null,
      priceCents: toCents(v?.itemVariationData?.priceMoney),
      currency: v?.itemVariationData?.priceMoney?.currency || "USD",
    })),
  };
}

// Validate + normalize the client's variation list.
function normalizeVariations(variations) {
  if (!Array.isArray(variations) || variations.length === 0) {
    throw new CatalogValidationError("at least one variation is required");
  }
  return variations.map((v, i) => {
    if (!v || typeof v.name !== "string" || !v.name.trim()) {
      throw new CatalogValidationError(`variation ${i + 1}: name is required`);
    }
    if (!Number.isInteger(v.priceCents) || v.priceCents < 0) {
      throw new CatalogValidationError(`variation ${i + 1}: priceCents must be a non-negative integer (minor units)`);
    }
    return { id: typeof v.id === "string" && v.id ? v.id : null, name: v.name.trim(), priceCents: v.priceCents, currency: v.currency || "USD" };
  });
}

/** List catalog items (sanitized). */
export async function listItems() {
  const res = await searchCatalogObjects({ objectTypes: ["ITEM"] });
  return { items: (res.objects || []).map(sanitizeItem) };
}

/**
 * Create a catalog item with one or more priced variations.
 * @param {{name:string, description?:string, variations:Array<{name:string, priceCents:number, currency?:string}>, actor:object}} args
 */
export async function createItem({ name, description, variations, actor } = {}) {
  if (typeof name !== "string" || !name.trim()) throw new CatalogValidationError("name is required");
  const vars = normalizeVariations(variations);

  const object = {
    type: "ITEM",
    id: "#item",
    itemData: {
      name: name.trim(),
      ...(typeof description === "string" && description.trim() ? { description: description.trim() } : {}),
      variations: vars.map((v, i) => ({
        type: "ITEM_VARIATION",
        id: `#var-${i}`,
        itemVariationData: {
          itemId: "#item",
          name: v.name,
          pricingType: "FIXED_PRICING",
          priceMoney: { amount: BigInt(v.priceCents), currency: v.currency },
        },
      })),
    },
  };

  const res = await upsertCatalogObject({ idempotencyKey: uuidv4(), object });
  const item = sanitizeItem(res.catalogObject);
  auditLog("admin.catalog.item.create", { actor: actor?.userID || "admin", target: item.id, name: item.name, outcome: "success" });
  return item;
}

/**
 * Update a catalog item. Re-fetches the current object to carry the item + variation versions so the
 * edit uses Square optimistic concurrency and preserves ids for variations kept.
 * @param {{id:string, name:string, description?:string, variations:Array, actor:object}} args
 */
export async function updateItem({ id, name, description, variations, actor } = {}) {
  if (typeof id !== "string" || !id.trim()) throw new CatalogValidationError("id is required");
  if (typeof name !== "string" || !name.trim()) throw new CatalogValidationError("name is required");
  const vars = normalizeVariations(variations);

  const current = (await getCatalogObject(id))?.object;
  if (!current || current.type !== "ITEM") throw new CatalogNotFoundError();
  const currentVars = new Map((current.itemData?.variations || []).map((v) => [v.id, v]));

  const object = {
    type: "ITEM",
    id: current.id,
    version: current.version,
    itemData: {
      name: name.trim(),
      ...(typeof description === "string" ? { description: description.trim() } : {}),
      variations: vars.map((v, i) => {
        const existing = v.id ? currentVars.get(v.id) : null;
        return {
          type: "ITEM_VARIATION",
          id: existing ? existing.id : `#var-${i}`,
          ...(existing ? { version: existing.version } : {}),
          itemVariationData: {
            itemId: current.id,
            name: v.name,
            pricingType: "FIXED_PRICING",
            priceMoney: { amount: BigInt(v.priceCents), currency: v.currency },
          },
        };
      }),
    },
  };

  const res = await upsertCatalogObject({ idempotencyKey: uuidv4(), object });
  const item = sanitizeItem(res.catalogObject);
  auditLog("admin.catalog.item.update", { actor: actor?.userID || "admin", target: id, name: item.name, outcome: "success" });
  return item;
}

/** Delete a catalog item. Type-guarded so a mistyped id can't delete a DISCOUNT/SUBSCRIPTION_PLAN
 * through the items endpoint (SEC #186 F-2). */
export async function deleteItem({ id, actor } = {}) {
  if (typeof id !== "string" || !id.trim()) throw new CatalogValidationError("id is required");
  const current = (await getCatalogObject(id))?.object;
  if (!current || current.type !== "ITEM") throw new CatalogNotFoundError();
  await deleteCatalogObject(id);
  auditLog("admin.catalog.item.delete", { actor: actor?.userID || "admin", target: id, outcome: "success" });
  return { id, deleted: true };
}

const CatalogService = { listItems, createItem, updateItem, deleteItem, CatalogValidationError, CatalogNotFoundError };
export default CatalogService;
