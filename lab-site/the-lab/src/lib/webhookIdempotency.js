// src/lib/webhookIdempotency.js
//
// SEC-17: webhook idempotency. Square delivers events at-least-once and retries
// on non-2xx, so a handler that mutates state must dedupe by the unique event id
// or a redelivery re-runs side effects (re-extends sponsorships, re-applies
// renewals/revocations, etc.).
//
// Model: claim-before-process. claimWebhookEvent atomically records the event id
// (a unique insert); a duplicate insert means it was already processed → skip.
// If processing then fails, the caller calls releaseWebhookEvent so Square's
// retry can reprocess (at-least-once for failures, exactly-once for successes).

import { db } from "@/lib/database";

const COLLECTION = "processed_webhook_events";
const TTL_SECONDS = 30 * 24 * 60 * 60; // Square won't retry beyond ~weeks; expire after 30d.

let indexEnsured = false;
async function getCollection() {
    const database = await db.connect();
    const coll = database.collection(COLLECTION);
    if (!indexEnsured) {
        try {
            await coll.createIndex({ processedAt: 1 }, { expireAfterSeconds: TTL_SECONDS });
        } catch {
            // index creation is best-effort; dedup correctness doesn't depend on the TTL
        }
        indexEnsured = true;
    }
    return coll;
}

const keyFor = (eventId, source) => `${source}:${eventId}`;

/**
 * Atomically claim a webhook event for processing.
 * @returns {Promise<boolean>} true if newly claimed (process it); false if this
 *   event was already processed (a duplicate redelivery — skip side effects).
 */
export async function claimWebhookEvent(eventId, source = "square") {
    if (!eventId) return true; // nothing to dedupe on — process best-effort
    const coll = await getCollection();
    try {
        await coll.insertOne({ _id: keyFor(eventId, source), source, eventId, processedAt: new Date() });
        return true; // first time we've seen this event
    } catch (err) {
        if (err?.code === 11000) return false; // duplicate key → already processed
        throw err; // unexpected DB error — let the caller fail (Square will retry)
    }
}

/**
 * Release a previously-claimed event so a retry can reprocess it. Call this when
 * processing failed after the claim, so the failure isn't permanently swallowed.
 */
export async function releaseWebhookEvent(eventId, source = "square") {
    if (!eventId) return;
    try {
        const coll = await getCollection();
        await coll.deleteOne({ _id: keyFor(eventId, source) });
    } catch (err) {
        console.error("Failed to release webhook event claim:", err?.message);
    }
}
