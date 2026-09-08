import { defineConfig } from "vitest/config";

// Tests for packages/web's pure (React-free) modules only — scenario codecs,
// the run/*.ts computation functions, chart/breakpoint helpers, and
// rankingFlip.ts. No component rendering here (no DOM, no React Testing
// Library) — this project's UI-behavior verification is the manual/browser
// checklist each web-developer session already follows, not a component test
// suite. `environment: "node"` reflects that every tested module is plain
// TypeScript with no DOM dependency.
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    // Same "single forked worker" rationale as packages/engine/vitest.config.ts
    // — this Windows dev machine's default multi-worker pool reports "Zone
    // Allocation failed" worker OOM noise alongside an all-green suite.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
