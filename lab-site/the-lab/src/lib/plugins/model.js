// Persistence for plugin runtime state (enabled + config). This is the ONLY
// file in the platform that touches the database (layering: the-lab/CLAUDE.md §4).
// One document per plugin, keyed by a stable fixed _id — mirrors the existing
// settings-doc pattern used by admin/plans.

import { db } from "@/lib/database";

const COLLECTION = "plugins";
const docId = (pluginId) => `plugin:${pluginId}`;

async function collection() {
  const database = await db.connect();
  return database.collection(COLLECTION);
}

/**
 * @typedef {{ pluginId: string, enabled: boolean, config: object,
 *   updatedAt?: string, updatedBy?: string|null }} PluginState
 */

/**
 * Read a plugin's persisted state, or null if it has never been configured.
 * @param {string} pluginId
 * @returns {Promise<PluginState|null>}
 */
export async function getState(pluginId) {
  const col = await collection();
  const doc = await col.findOne({ _id: docId(pluginId) });
  if (!doc) return null;
  return { pluginId: doc.pluginId, enabled: !!doc.enabled, config: doc.config || {}, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy ?? null };
}

/**
 * Read every persisted plugin state as a map keyed by pluginId.
 * @returns {Promise<Record<string, PluginState>>}
 */
export async function listStates() {
  const col = await collection();
  const docs = await col.find({}).toArray();
  const out = {};
  for (const doc of docs) {
    out[doc.pluginId] = { pluginId: doc.pluginId, enabled: !!doc.enabled, config: doc.config || {}, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy ?? null };
  }
  return out;
}

/**
 * Upsert the enabled flag for a plugin.
 * @param {string} pluginId
 * @param {boolean} enabled
 * @param {string|null} actorID - userID performing the change (for audit trail)
 */
export async function setEnabled(pluginId, enabled, actorID = null) {
  const col = await collection();
  await col.updateOne(
    { _id: docId(pluginId) },
    {
      $set: { pluginId, enabled: !!enabled, updatedAt: new Date().toISOString(), updatedBy: actorID },
      $setOnInsert: { config: {} },
    },
    { upsert: true }
  );
}

/**
 * Upsert the config object for a plugin (already validated by the service).
 * @param {string} pluginId
 * @param {object} config
 * @param {string|null} actorID
 */
export async function setConfig(pluginId, config, actorID = null) {
  const col = await collection();
  await col.updateOne(
    { _id: docId(pluginId) },
    {
      $set: { pluginId, config, updatedAt: new Date().toISOString(), updatedBy: actorID },
      $setOnInsert: { enabled: false },
    },
    { upsert: true }
  );
}

export default { getState, listStates, setEnabled, setConfig };
