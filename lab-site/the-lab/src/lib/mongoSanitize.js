// src/lib/mongoSanitize.js
//
// SEC-19: body-driven writes must not let a client inject MongoDB operators.
// `stripMongoOperators` recursively removes any `$`-prefixed key from an object
// (e.g. a body field named `$where`, `$set`, `$gt`) so a crafted JSON body can't
// alter query/update semantics or write unintended operator documents. Apply it
// to any value that originates from `await req.json()` before it reaches a
// model/persistence call.

/**
 * Recursively strip `$`-prefixed keys from a value. Arrays are mapped, Dates and
 * primitives pass through unchanged.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function stripMongoOperators(value) {
    if (Array.isArray(value)) return value.map(stripMongoOperators);
    if (value && typeof value === "object" && !(value instanceof Date)) {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            if (k.startsWith("$")) continue; // drop operator-like keys
            out[k] = stripMongoOperators(v);
        }
        return out;
    }
    return value;
}

export default stripMongoOperators;
