// Unit coverage for plugin manifest + config-schema validation.
import {
  collectManifestProblems, defineManifest, defaultConfig, validateConfig,
} from "@/lib/plugins/manifest.schema";

const good = {
  id: "member-email",
  name: "Member Email",
  version: "1.0.0",
  sockets: { hooks: ["member.deleted"], adminNav: { label: "x", path: "/dashboard/admin/x" } },
  configSchema: { cap: { type: "number", default: 1, min: 1, max: 5 } },
  requiredPermissions: ["member-email:admin"],
  enabledByDefault: false,
};

describe("manifest validation", () => {
  test("a well-formed manifest has no problems and freezes", () => {
    expect(collectManifestProblems(good)).toEqual([]);
    const m = defineManifest({ ...good, sockets: { ...good.sockets }, configSchema: { ...good.configSchema } });
    expect(Object.isFrozen(m)).toBe(true);
  });

  test("rejects bad id, version, unknown socket, bad adminNav path", () => {
    expect(collectManifestProblems({ ...good, id: "Bad ID" }).some((p) => /id/.test(p))).toBe(true);
    expect(collectManifestProblems({ ...good, version: "1.0" }).some((p) => /version/.test(p))).toBe(true);
    expect(collectManifestProblems({ ...good, sockets: { bogus: true } }).some((p) => /unknown socket/.test(p))).toBe(true);
    expect(collectManifestProblems({ ...good, sockets: { adminNav: { label: "x", path: "/nope" } } }).some((p) => /adminNav\.path/.test(p))).toBe(true);
  });

  test("rejects an unsupported config field type", () => {
    expect(collectManifestProblems({ ...good, configSchema: { x: { type: "object" } } }).some((p) => /type/.test(p))).toBe(true);
  });

  test("defineManifest throws on an invalid manifest", () => {
    expect(() => defineManifest({ id: "x" })).toThrow(/Invalid plugin manifest/);
  });
});

describe("config validation", () => {
  const schema = {
    cap: { type: "number", default: 1, min: 1, max: 5 },
    domain: { type: "string", default: "fablabfortsmith.org", immutable: true },
    extra: { type: "string[]", default: [] },
    flag: { type: "boolean", default: false },
  };

  test("defaultConfig fills declared defaults", () => {
    expect(defaultConfig(schema)).toEqual({ cap: 1, domain: "fablabfortsmith.org", extra: [], flag: false });
  });

  test("valid patch is coerced + merged over defaults", () => {
    const { ok, value } = validateConfig(schema, { cap: 3, extra: ["ceo"], flag: true });
    expect(ok).toBe(true);
    expect(value).toMatchObject({ cap: 3, extra: ["ceo"], flag: true });
  });

  test("out-of-range / wrong-type values are rejected", () => {
    expect(validateConfig(schema, { cap: 99 }).ok).toBe(false);
    expect(validateConfig(schema, { cap: "x" }).ok).toBe(false);
    expect(validateConfig(schema, { flag: "yes" }).ok).toBe(false);
    expect(validateConfig(schema, { extra: [1, 2] }).ok).toBe(false);
  });

  test("immutable fields cannot be changed via a patch", () => {
    const { value } = validateConfig(schema, { domain: "evil.example" }, { domain: "fablabfortsmith.org" });
    expect(value.domain).toBe("fablabfortsmith.org");
  });

  test("unknown and $-prefixed keys are dropped (injection guard)", () => {
    const { value } = validateConfig(schema, { unknown: 1, $where: "x", cap: 2 });
    expect(value.unknown).toBeUndefined();
    expect(value.$where).toBeUndefined();
    expect(value.cap).toBe(2);
  });
});
