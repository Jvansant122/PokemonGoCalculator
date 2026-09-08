import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    benchmark: {
      include: ["test/**/*.bench.ts"],
    },
    // A single forked worker. On this project's Windows dev machine vitest's default
    // multi-worker pool reports "Zone Allocation failed" worker OOM errors alongside an
    // all-green suite — environment noise that used to be worked around by hand on every
    // run. One fork is also what CI and the PostToolUse hook expect (deterministic, no
    // per-run flake), and the suite is small enough (~240 tests) that it costs nothing.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
