// SEC-22: the orchestrator builds Docker container/volume/image names and a
// Traefik `Host(...)` rule from userID/missionID. safeName must strip everything
// outside the allowlist so nothing can break out of those contexts, and must
// produce "" for all-illegal input (which the handler then rejects, preventing
// cross-user collisions).

const { safeName, USER_ID, MISSION_ID } = require("../../vps/orchestrator/lib/sanitize");

describe("orchestrator safeName (SEC-22)", () => {
    test("REGRESSION: strips chars that could break a Traefik Host() rule / path", () => {
        expect(safeName("a`b'c\" d", USER_ID)).toBe("abcd");           // backtick/quote/space gone
        expect(safeName("../../etc/passwd", USER_ID)).toBe("etcpasswd"); // path traversal gone
        expect(safeName("user.sub:tag", USER_ID)).toBe("usersubtag");   // dot/colon gone (no image-ref escape)
    });

    test("missionID allows - and _ but not / . : (no image-ref redirection)", () => {
        expect(safeName("mission-1_v2", MISSION_ID)).toBe("mission-1_v2");
        expect(safeName("evil/image:latest", MISSION_ID)).toBe("evilimagelatest");
    });

    test("REGRESSION: all-illegal input sanitizes to empty (handler must reject)", () => {
        expect(safeName("../", USER_ID)).toBe("");
        expect(safeName("!@#$%", USER_ID)).toBe("");
    });

    test("coerces non-string input (no .replace crash; objects/numbers handled)", () => {
        expect(safeName(12345, USER_ID)).toBe("12345");
        expect(safeName({ $gt: "" }, USER_ID)).toBe("objectObject"); // "[object Object]" stripped of brackets/space
        expect(safeName(null, USER_ID)).toBe("");
        expect(safeName(undefined, USER_ID)).toBe("");
    });
});
