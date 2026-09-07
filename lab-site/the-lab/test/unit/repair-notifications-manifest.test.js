// AD-5 pilot addon — manifest + registration shape. Pure/sync: validates the
// manifest against the platform schema, proves the addon is discoverable in the
// static registry and ships DISABLED by default, and that register() binds the
// handler to the repair.created + repair.updated hooks (and nothing else).

import manifest from "@/plugins/repair-notifications/plugin.manifest";
import { register } from "@/plugins/repair-notifications";
import { collectManifestProblems } from "@/lib/plugins/manifest.schema";
import { listPlugins, _resetRegistry } from "@/lib/plugins/registry";
import { CORE_EVENTS } from "@/lib/plugins/hooks";

afterEach(() => _resetRegistry());

describe("repair-notifications manifest", () => {
  test("is a valid platform manifest (no problems)", () => {
    // Note: defineManifest() already froze/validated at import; re-run the pure
    // collector to assert zero problems explicitly.
    expect(collectManifestProblems(manifest)).toEqual([]);
  });

  test("declares the expected identity + addon-manager card metadata", () => {
    expect(manifest.id).toBe("repair-notifications");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.category).toBe("Operations");
    expect(typeof manifest.icon).toBe("string");
    expect(manifest.icon.length).toBeLessThanOrEqual(8);
  });

  test("subscribes only to the repair.created + repair.updated hooks", () => {
    expect(manifest.sockets.hooks).toEqual([
      CORE_EVENTS.REPAIR_CREATED,
      CORE_EVENTS.REPAIR_UPDATED,
    ]);
    expect(manifest.sockets.adminSettings).toBe(true);
    // No API routes and no admin-nav slot — pure hook behaviour.
    expect(manifest.sockets.apiRoutes).toBeUndefined();
    expect(manifest.sockets.adminNav).toBeUndefined();
  });

  test("ships DISABLED by default (enabling it is the feature flag)", () => {
    expect(manifest.enabledByDefault).toBe(false);
  });

  test("config schema uses only declarative types incl. a select; no secret field", () => {
    const { notifyTo, subjectPrefix, notifyOn } = manifest.configSchema;
    expect(notifyTo.type).toBe("string");
    expect(subjectPrefix.type).toBe("string");
    expect(notifyOn.type).toBe("select");
    expect(notifyOn.options).toEqual(["all", "in_progress", "completed", "cancelled"]);
    expect(notifyOn.default).toBe("all");
    // No credential to hold — a secret field would be dead surface.
    for (const spec of Object.values(manifest.configSchema)) {
      expect(spec.type).not.toBe("secret");
    }
  });
});

describe("repair-notifications registration", () => {
  test("appears in the static registry, DISABLED, with default config", () => {
    const entry = listPlugins().find((p) => p.manifest.id === "repair-notifications");
    expect(entry).toBeDefined();
    expect(entry.enabled).toBe(false);
    expect(entry.config.notifyTo).toBe(""); // default = disabled/no-op
    expect(entry.config.notifyOn).toBe("all");
  });

  test("register() binds exactly the repair.created + repair.updated hooks", () => {
    const on = jest.fn();
    register({ on });
    expect(on).toHaveBeenCalledTimes(2);
    expect(on).toHaveBeenNthCalledWith(1, CORE_EVENTS.REPAIR_CREATED, expect.any(Function));
    expect(on).toHaveBeenNthCalledWith(2, CORE_EVENTS.REPAIR_UPDATED, expect.any(Function));
  });
});
