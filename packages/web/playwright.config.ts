import { defineConfig, devices } from "@playwright/test";

// The production build (`npm run build --workspace=packages/web`) must
// already exist in dist/ before this runs — this config only previews it
// (`vite preview`), it never builds. CI's own e2e job builds first with
// GITHUB_PAGES=true (matching the real GitHub Pages deploy), which is also
// why baseURL below reads that same env var: vite.config.ts's own `base`
// (the "/PokemonGoCalculator/" project-page path) is derived from it, so
// `vite preview` serves the built assets under that same path only when the
// build was made with it set. Getting these two out of sync (build with the
// flag, preview/test without it, or vice versa) produces a blank page with
// 404s for every asset, not a helpful error.
const isGithubPages = Boolean(process.env.GITHUB_PAGES);
const baseURL = isGithubPages ? "http://localhost:4173/PokemonGoCalculator/" : "http://localhost:4173/";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run preview -- --port 4173 --strictPort",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
