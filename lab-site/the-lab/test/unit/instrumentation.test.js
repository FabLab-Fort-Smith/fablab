// Verifies the startup wiring: register() runs env validation in the Node
// runtime and (in non-production) does not throw on a partial env.
test("register() validates env without throwing in non-production", async () => {
  const prevRuntime = process.env.NEXT_RUNTIME;
  process.env.NEXT_RUNTIME = "nodejs";
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  try {
    jest.resetModules();
    const { register } = await import("@/instrumentation");
    await expect(register()).resolves.toBeUndefined();
  } finally {
    warnSpy.mockRestore();
    logSpy.mockRestore();
    if (prevRuntime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = prevRuntime;
  }
});

test("register() is a no-op outside the Node runtime", async () => {
  const prevRuntime = process.env.NEXT_RUNTIME;
  process.env.NEXT_RUNTIME = "edge";
  try {
    jest.resetModules();
    const { register } = await import("@/instrumentation");
    await expect(register()).resolves.toBeUndefined();
  } finally {
    if (prevRuntime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = prevRuntime;
  }
});
