// The monthly funding goal, admin-editable, stored in the `config` collection (the same
// place the Square webhook signing key lives) so it can change without a code deploy.

import { db } from "@/lib/database";

const GOAL_KEY = "monthly_funding_goal_cents";
const DEFAULT_GOAL_CENTS = 70000; // $700 — the previous hardcoded value, now just the fallback

/** Read the current monthly goal in cents, falling back to the default. */
export async function getGoalCents() {
  try {
    const dbInstance = await db.connect();
    const doc = await dbInstance.collection("config").findOne({ key: GOAL_KEY });
    const v = Number(doc?.value);
    return Number.isSafeInteger(v) && v > 0 ? v : DEFAULT_GOAL_CENTS;
  } catch {
    return DEFAULT_GOAL_CENTS;
  }
}

/**
 * Set the monthly goal. Caller must have already checked admin authorization.
 * @param {number} cents - a positive integer number of cents
 * @returns {Promise<number>} the value stored
 * @throws {Error} on an invalid amount
 */
export async function setGoalCents(cents) {
  const v = Number(cents);
  if (!Number.isSafeInteger(v) || v <= 0) {
    throw new Error("Goal must be a positive whole number of cents.");
  }
  const dbInstance = await db.connect();
  await dbInstance.collection("config").updateOne(
    { key: GOAL_KEY },
    { $set: { key: GOAL_KEY, value: v, updatedAt: new Date() } },
    { upsert: true },
  );
  return v;
}

export { DEFAULT_GOAL_CENTS };
