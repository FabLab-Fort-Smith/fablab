// SEC-19: body-driven writes must not let a client inject Mongo operators.
// stripMongoOperators recursively removes $-prefixed keys before a JSON body
// reaches persistence. (The user self-update path is additionally covered by the
// SEC-02 whitelist; this guards the shared sanitizer applied at createUser /
// notifications create.)

import { stripMongoOperators } from "@/lib/mongoSanitize";

describe("stripMongoOperators (SEC-19)", () => {
    test("REGRESSION: drops $-prefixed keys at every depth", () => {
        const out = stripMongoOperators({
            firstName: "Bob",
            $where: "sleep(1000)",
            membership: { status: "registered", $set: { status: "active" } },
            tags: [{ name: "ok", $gt: 1 }],
        });
        expect(out).toEqual({
            firstName: "Bob",
            membership: { status: "registered" },
            tags: [{ name: "ok" }],
        });
    });

    test("leaves clean scalar/array/Date values intact", () => {
        const d = new Date("2026-01-01T00:00:00Z");
        expect(stripMongoOperators({ a: 1, b: "x", c: [1, 2], d })).toEqual({ a: 1, b: "x", c: [1, 2], d });
    });

    test("non-object input passes through", () => {
        expect(stripMongoOperators("hi")).toBe("hi");
        expect(stripMongoOperators(42)).toBe(42);
        expect(stripMongoOperators(null)).toBe(null);
    });
});
