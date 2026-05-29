import nextJest from "next/jest.js";

// next/jest wires up the SWC transform and Next's env handling.
const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testMatch: ["**/test/**/*.test.js"],
  // mongodb-memory-server may download a binary on first run.
  testTimeout: 60000,
  clearMocks: true,
  // App Router uses the "@/" path alias. jsconfig maps it to ["./src/*","./*"],
  // so try src first, then the repo root (e.g. root-level auth.js).
  moduleNameMapper: {
    "^@/(.*)$": ["<rootDir>/src/$1", "<rootDir>/$1"],
  },
};

export default createJestConfig(config);
