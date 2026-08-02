// Money parsing and bounds for anything that reaches Square (#182).
//
// One place, because the bugs this replaces were all the same bug wearing different
// clothes: `Math.round(amount * 100)` on an unvalidated body field. `"abc"` became NaN,
// negatives passed through, and there was no ceiling at all.
//
// Rule of thumb for callers: an amount the MEMBER legitimately chooses (a donation) gets
// parsed and bounded here. An amount the BUSINESS decides (a subscription price) is never
// parsed from input at all — read it from the Square catalog. Validating a
// client-supplied price still lets the client pick the price.

/** Smallest charge worth taking; also below Square's practical floor. */
export const MIN_CHARGE_CENTS = 100;          // $1.00

/**
 * Ceiling for a self-service donation. Not a limit on generosity — a limit on how much
 * damage one malformed or malicious request can do unattended. Larger gifts go through a
 * human.
 */
export const MAX_DONATION_CENTS = 500000;     // $5,000.00

/** Thrown for any amount we refuse. Carries a member-safe message. */
export class InvalidAmountError extends Error {
    /** @param {string} message - safe to show a member */
    constructor(message) {
        super(message);
        this.name = 'InvalidAmountError';
    }
}

/**
 * Parse a client-supplied amount in DOLLARS into integer cents, or throw.
 *
 * Rejects: non-numeric, NaN, Infinity, negative, zero, sub-cent precision abuse, and
 * anything outside [min, max]. Accepts a number or a numeric string, because JSON bodies
 * arrive both ways and coercing quietly is how `"abc"` reached Square as NaN.
 *
 * @param {unknown} input - the raw value from the request body, in dollars
 * @param {{ min?: number, max?: number, label?: string }} [opts]
 * @returns {number} a safe integer number of cents
 * @throws {InvalidAmountError}
 */
export function parseAmountCents(input, opts = {}) {
    const { min = MIN_CHARGE_CENTS, max = MAX_DONATION_CENTS, label = 'Amount' } = opts;

    if (input === null || input === undefined || input === '') {
        throw new InvalidAmountError(`${label} is required.`);
    }
    // Reject objects/arrays/booleans outright rather than letting Number() coerce them.
    if (typeof input !== 'number' && typeof input !== 'string') {
        throw new InvalidAmountError(`${label} must be a number.`);
    }

    const dollars = typeof input === 'number' ? input : Number(input.trim());
    if (!Number.isFinite(dollars)) {
        throw new InvalidAmountError(`${label} must be a number.`);
    }
    if (dollars <= 0) {
        throw new InvalidAmountError(`${label} must be greater than zero.`);
    }

    const cents = Math.round(dollars * 100);
    if (!Number.isSafeInteger(cents)) {
        throw new InvalidAmountError(`${label} is out of range.`);
    }
    if (cents < min) {
        throw new InvalidAmountError(`${label} must be at least ${formatCents(min)}.`);
    }
    if (cents > max) {
        throw new InvalidAmountError(`${label} cannot exceed ${formatCents(max)}. Contact us to arrange a larger gift.`);
    }
    return cents;
}

/**
 * Pull the recurring price, in cents, out of a Square subscription plan variation.
 *
 * Mirrors the derivation already used by the plans model so the checkout price and the
 * price shown on the plans page cannot drift apart. Returns null for RELATIVE-priced
 * variations, which carry no fixed amount — callers must refuse rather than guess.
 *
 * @param {object} variation - a Square CatalogObject of type SUBSCRIPTION_PLAN_VARIATION
 * @returns {number|null} price in cents, or null when the variation has no fixed price
 */
export function variationPriceCents(variation) {
    const phases = variation?.subscriptionPlanVariationData?.phases || [];
    const billingPhase = phases[phases.length - 1];
    if (!billingPhase) return null;
    if (billingPhase?.pricing?.type === 'RELATIVE') return null;

    const amount = billingPhase?.pricing?.priceMoney?.amount
        ?? billingPhase?.recurringPriceMoney?.amount;
    if (amount === undefined || amount === null) return null;

    const cents = Number(amount);   // Square returns bigint in v44
    return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

/**
 * Format cents for a member-facing message.
 * @param {number} cents
 * @returns {string}
 */
export function formatCents(cents) {
    return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
