// Dependency upgrade bcryptjs 2 → 3 (auth-critical: password hashing for the
// credentials login, change-password, verify-credentials, and self-merge paths).
// The make-or-break guarantee is backward compatibility: passwords stored as
// hashes created by the bcryptjs 2 line MUST still verify under v3, or every
// existing member is locked out. This also exercises the same default ESM
// import the app uses (`import bcrypt from "bcryptjs"`), confirming v3 resolves.

import bcrypt from "bcryptjs";

// A real hash produced by bcryptjs@2.4.3 for "TestPassword123" (the $2a$ format
// the previously-installed version emitted).
const V2_HASH = "$2a$10$PtCuuVVGlPWO/Wt1.HeOwe/ptSmvdakKl4plusIdr8AD43f43IasO";

describe("bcryptjs 2 → 3 password compatibility", () => {
    test("REGRESSION: a hash created by the bcryptjs 2 line still verifies under v3", async () => {
        expect(await bcrypt.compare("TestPassword123", V2_HASH)).toBe(true);
        expect(await bcrypt.compare("WrongPassword", V2_HASH)).toBe(false);
    });

    test("hash + compare round-trips under v3 (the app's hash(pw, 10) usage)", async () => {
        const hash = await bcrypt.hash("s3cret-pw", 10);
        expect(await bcrypt.compare("s3cret-pw", hash)).toBe(true);
        expect(await bcrypt.compare("s3cret-px", hash)).toBe(false);
    });
});
