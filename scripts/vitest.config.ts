import { defineConfig } from "vitest/config";

// Tests for the data pipeline (scripts/sync-data*) and the check scripts. Run with
// `npm run test:scripts` from the repo root. Kept separate from the engine's config so
// the engine suite stays the fast, hook-triggered gate.
export default defineConfig({
  test: {
    include: ["scripts/**/*.test.ts"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
