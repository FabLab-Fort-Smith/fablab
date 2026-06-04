// Dependency upgrade: MongoDB Node driver 6 → 7 (used everywhere via
// src/lib/database.js). The DB-backed e2e suites exercise real driver-7
// connectivity + CRUD against mongodb-memory-server; this guard additionally
// pins the major so the driver can't silently regress below 7.

import fs from "node:fs";
import path from "node:path";

test("REGRESSION: installed mongodb driver is on the v7+ line", () => {
    const pkgPath = path.resolve(__dirname, "..", "..", "node_modules", "mongodb", "package.json");
    const { version } = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    expect(Number(version.split(".")[0])).toBeGreaterThanOrEqual(7);
});
