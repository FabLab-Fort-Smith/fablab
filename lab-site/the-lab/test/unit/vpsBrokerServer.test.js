// vps/broker-server.js — smoke: the entrypoint module imports cleanly and does NOT auto-run (the
// import.meta guard means run() only fires when executed directly, not when imported/tested).

test("broker-server imports without side effects and exports run()", async () => {
  const m = await import("../../vps/broker-server.js");
  expect(typeof m.run).toBe("function");
});
