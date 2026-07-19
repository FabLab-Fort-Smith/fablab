// Next.js runs register() once when the server starts. We validate required
// environment/secrets here so the app FAILS FAST in production instead of
// running mis-configured (WI-3.4; docs/audit/06-security-standards.md §4).
export async function register() {
  // Only run in the Node.js server runtime (not Edge), and never during the
  // build phase — instrumentation runs at server boot.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    validateEnv(); // throws in production when required secrets are missing

    // Initialize the plugin platform: build the registry, hydrate enabled/config
    // from the DB, and wire enabled plugins' hooks. Never blocks boot — plugins
    // default disabled and init fails safe if the DB is unavailable.
    try {
      const { initPlugins } = await import("@/lib/plugins/registry");
      await initPlugins();
    } catch (err) {
      console.error("⚠️ Plugin platform init failed (continuing):", err?.message);
    }
  }
}
