// AD-4 pilot addon — manifest + registration shape. Pure/sync: validates the
// manifest against the platform schema, proves the addon is discoverable in the
// static registry and ships DISABLED by default, and that register() binds the
// handler to the contact.submitted hook (and nothing else).

import manifest from "@/plugins/contact-submissions/plugin.manifest";
import { register } from "@/plugins/contact-submissions";
import { collectManifestProblems } from "@/lib/plugins/manifest.schema";
import { listPlugins, _resetRegistry } from "@/lib/plugins/registry";
import { CORE_EVENTS } from "@/lib/plugins/hooks";

afterEach(() => _resetRegistry());

describe("contact-submissions manifest", () => {
  test("is a valid platform manifest (no problems)", () => {
    // Note: defineManifest() already froze/validated at import; re-run the pure
    // collector to assert zero problems explicitly.
    expect(collectManifestProblems(manifest)).toEqual([]);
  });

  test("declares the expected identity + addon-manager card metadata", () => {
    expect(manifest.id).toBe("contact-submissions");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.category).toBe("Communications");
    expect(typeof manifest.icon).toBe("string");
    expect(manifest.icon.length).toBeLessThanOrEqual(8);
  });

  test("subscribes only to the contact.submitted hook", () => {
    expect(manifest.sockets.hooks).toEqual([CORE_EVENTS.CONTACT_SUBMITTED]);
    expect(manifest.sockets.adminSettings).toBe(true);
    // No API routes and no admin-nav slot — pure hook behaviour.
    expect(manifest.sockets.apiRoutes).toBeUndefined();
    expect(manifest.sockets.adminNav).toBeUndefined();
  });

  test("ships DISABLED by default (enabling it is the feature flag)", () => {
    expect(manifest.enabledByDefault).toBe(false);
  });

  test("config schema uses only declarative types incl. a select; no secret field", () => {
    const { forwardTo, subjectPrefix, includeMessage } = manifest.configSchema;
    expect(forwardTo.type).toBe("string");
    expect(subjectPrefix.type).toBe("string");
    expect(includeMessage.type).toBe("select");
    expect(includeMessage.options).toEqual(["full", "summary", "none"]);
    expect(includeMessage.default).toBe("full");
    // No credential to hold — a secret field would be dead surface.
    for (const spec of Object.values(manifest.configSchema)) {
      expect(spec.type).not.toBe("secret");
    }
  });
});

describe("contact-submissions registration", () => {
  test("appears in the static registry, DISABLED, with default config", () => {
    const entry = listPlugins().find((p) => p.manifest.id === "contact-submissions");
    expect(entry).toBeDefined();
    expect(entry.enabled).toBe(false);
    expect(entry.config.forwardTo).toBe(""); // default = disabled/no-op
    expect(entry.config.includeMessage).toBe("full");
  });

  test("register() binds exactly the contact.submitted hook", () => {
    const on = jest.fn();
    register({ on });
    expect(on).toHaveBeenCalledTimes(1);
    expect(on).toHaveBeenCalledWith(CORE_EVENTS.CONTACT_SUBMITTED, expect.any(Function));
  });
});
