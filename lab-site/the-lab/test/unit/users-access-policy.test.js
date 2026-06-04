// SEC-02: the user API must not let a client escalate privilege or read PII.
// These exercise the access-control policy (access.js) that the service applies
// to every non-admin write and every non-owner read. They fail against the old
// code, which had no policy module and persisted whatever the client sent.

import {
    isAdmin,
    isPublicActiveMember,
    toPublicUser,
    stripSensitive,
    stripOperatorKeys,
    sanitizeSelfUpdate,
} from "@/app/api/v1/users/access";

describe("isAdmin", () => {
    test("only the admin role is privileged", () => {
        expect(isAdmin({ role: "admin" })).toBe(true);
        expect(isAdmin({ role: "user" })).toBe(false);
        expect(isAdmin({ role: "ghost" })).toBe(false);
        expect(isAdmin({ userID: "u1" })).toBe(false);
        expect(isAdmin(null)).toBe(false);
    });
});

describe("toPublicUser projection (no PII / credentials leak)", () => {
    const full = {
        _id: "x", userID: "u1", username: "bob", firstName: "Bob", lastName: "B",
        email: "bob@x.com", phoneNumber: "555-1234", password: "$2a$hash",
        googleId: "g1", discordId: "d1", squareID: "sq1", bio: "hi", image: "i.png",
        role: "user", stake: 5,
        membership: {
            status: "active", type: "co-op", isWaived: false, subscriptionStatus: "ACTIVE",
            accessKey: { issued: true, code: "SECRET" },
            squareSubscriptionId: "sub_1", sponsorshipExpiresAt: "2030-01-01",
            volunteerLog: [{ id: "v1", description: "private", hours: 3 }],
        },
    };

    test("REGRESSION: never exposes email, phone, password, or integration IDs", () => {
        const pub = toPublicUser(full);
        expect(pub.email).toBeUndefined();
        expect(pub.phoneNumber).toBeUndefined();
        expect(pub.password).toBeUndefined();
        expect(pub.googleId).toBeUndefined();
        expect(pub.discordId).toBeUndefined();
        expect(pub.squareID).toBeUndefined();
    });

    test("REGRESSION: membership is reduced to safe sub-fields only", () => {
        const pub = toPublicUser(full);
        expect(pub.membership).toEqual({
            status: "active", type: "co-op", isWaived: false, subscriptionStatus: "ACTIVE",
        });
        expect(pub.membership.accessKey).toBeUndefined();
        expect(pub.membership.squareSubscriptionId).toBeUndefined();
        expect(pub.membership.volunteerLog).toBeUndefined();
    });

    test("keeps the safe display fields the public profile renders", () => {
        const pub = toPublicUser(full);
        expect(pub).toMatchObject({ userID: "u1", username: "bob", firstName: "Bob", bio: "hi", image: "i.png", stake: 5 });
    });
});

describe("stripSensitive (owner/admin HTTP view)", () => {
    test("REGRESSION: drops the password hash but keeps decrypted PII", () => {
        const out = stripSensitive({ userID: "u1", email: "bob@x.com", phoneNumber: "555", password: "$2a$hash" });
        expect(out.password).toBeUndefined();
        expect(out.email).toBe("bob@x.com");
        expect(out.phoneNumber).toBe("555");
    });
});

describe("isPublicActiveMember gate", () => {
    test("hidden profiles are not visible to non-owners", () => {
        expect(isPublicActiveMember({ isPublic: false, membership: { status: "active" } })).toBe(false);
    });
    test("inactive members are not visible to non-owners", () => {
        expect(isPublicActiveMember({ membership: { status: "registered" } })).toBe(false);
    });
    test("public active / waived / subscribed members are visible", () => {
        expect(isPublicActiveMember({ membership: { status: "active" } })).toBe(true);
        expect(isPublicActiveMember({ membership: { status: "probation" } })).toBe(true);
        expect(isPublicActiveMember({ membership: { isWaived: true } })).toBe(true);
        expect(isPublicActiveMember({ membership: { subscriptionStatus: "ACTIVE" } })).toBe(true);
    });
});

describe("stripOperatorKeys (Mongo operator injection)", () => {
    test("REGRESSION: $-prefixed keys are removed at every depth", () => {
        const out = stripOperatorKeys({ bio: "ok", $set: { role: "admin" }, nested: { $inc: { stake: 1 }, keep: 1 } });
        expect(out).toEqual({ bio: "ok", nested: { keep: 1 } });
    });
});

describe("sanitizeSelfUpdate (privilege-escalation guard)", () => {
    const current = {
        role: "user",
        membership: {
            status: "registered", isWaived: false, type: "community",
            accessKey: { issued: false },
            volunteerLog: [{ id: "v1", hours: 2, status: "approved", verifiedBy: "admin1" }],
        },
    };

    test("REGRESSION: a non-admin cannot set role / status / stake / badges", () => {
        const out = sanitizeSelfUpdate(
            { bio: "new bio", role: "admin", stake: 9999, badges: ["x"], status: "verified" },
            current
        );
        expect(out.bio).toBe("new bio");
        expect(out.role).toBeUndefined();
        expect(out.stake).toBeUndefined();
        expect(out.badges).toBeUndefined();
        expect(out.status).toBeUndefined();
    });

    test("REGRESSION: a non-admin cannot self-grant membership/access via the membership object", () => {
        const out = sanitizeSelfUpdate(
            { membership: { status: "active", isWaived: true, accessKey: { issued: true } } },
            current
        );
        // Access-granting fields are taken from the stored record, not the client.
        expect(out.membership.status).toBe("registered");
        expect(out.membership.isWaived).toBe(false);
        expect(out.membership.accessKey).toEqual({ issued: false });
    });

    test("REGRESSION: a non-admin cannot self-approve volunteer hours", () => {
        const out = sanitizeSelfUpdate(
            { membership: { volunteerLog: [
                { id: "v1", hours: 2, status: "approved", verifiedBy: "self" }, // existing — try to flip
                { id: "v2", hours: 5, status: "approved", verifiedBy: "self" }, // new — try to pre-approve
            ] } },
            current
        );
        const [v1, v2] = out.membership.volunteerLog;
        expect(v1.status).toBe("approved");      // unchanged from stored
        expect(v1.verifiedBy).toBe("admin1");     // verifier preserved
        expect(v2.status).toBe("pending");        // new entry forced pending
        expect(v2.verifiedBy).toBeNull();
    });

    test("allows the legitimate self-service edits (profile + application date)", () => {
        const out = sanitizeSelfUpdate(
            { firstName: "Bob", bio: "hi", interests: ["3d"], privacy: { showEmail: false },
              membership: { applicationDate: "2026-01-01T00:00:00Z" } },
            { membership: {} }
        );
        expect(out).toMatchObject({ firstName: "Bob", bio: "hi", interests: ["3d"], privacy: { showEmail: false } });
        expect(out.membership.applicationDate).toBe("2026-01-01T00:00:00Z");
    });

    test("the application date can be set once but not rewritten", () => {
        const out = sanitizeSelfUpdate(
            { membership: { applicationDate: "2027-09-09T00:00:00Z" } },
            { membership: { applicationDate: "2026-01-01T00:00:00Z" } }
        );
        expect(out.membership.applicationDate).toBe("2026-01-01T00:00:00Z");
    });

    test("REGRESSION: strips $-operator keys from a self update", () => {
        const out = sanitizeSelfUpdate({ $set: { role: "admin" }, bio: "ok" }, current);
        expect(out.$set).toBeUndefined();
        expect(out.bio).toBe("ok");
    });
});
