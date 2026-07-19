// Unit coverage for member-email local-part validation + reserved blocklist.
import { validateLocalPart, isReserved, RESERVED } from "@/plugins/member-email/reserved";

describe("validateLocalPart", () => {
  test("accepts a normal name (lowercased)", () => {
    expect(validateLocalPart("JDoe")).toEqual({ ok: true, localPart: "jdoe" });
    expect(validateLocalPart("jane.doe")).toEqual({ ok: true, localPart: "jane.doe" });
  });

  test("rejects reserved role names", () => {
    for (const name of ["admin", "postmaster", "info", "no-reply", "board", "fablab"]) {
      expect(validateLocalPart(name).ok).toBe(false);
      expect(validateLocalPart(name).reason).toBe("reserved");
    }
  });

  test("rejects bad formats", () => {
    expect(validateLocalPart("ab").reason).toBe("length"); // too short
    expect(validateLocalPart("a".repeat(40)).reason).toBe("length"); // too long
    expect(validateLocalPart(".lead").reason).toBe("format");
    expect(validateLocalPart("trail-").reason).toBe("format");
    expect(validateLocalPart("has space").reason).toBe("format");
    expect(validateLocalPart("dou..ble").reason).toBe("format");
    expect(validateLocalPart("bad$chars").reason).toBe("format");
  });

  test("rejects non-strings / empty", () => {
    expect(validateLocalPart(undefined).ok).toBe(false);
    expect(validateLocalPart("").reason).toBe("required");
  });

  test("honors additional reserved names from config", () => {
    expect(validateLocalPart("founder", ["founder"]).reason).toBe("reserved");
    expect(isReserved("founder", ["Founder"])).toBe(true); // case-insensitive
  });

  test("core reserved set includes the RFC-2142 essentials", () => {
    for (const n of ["postmaster", "abuse", "webmaster", "security"]) expect(RESERVED.has(n)).toBe(true);
  });
});
