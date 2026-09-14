import { fileURLToPath } from "node:url";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(packageDir, "../../");

// Repo is deployed as a project Pages site at
// https://<user>.github.io/PokemonGoCalculator/ (confirmed via `git remote -v`),
// so all built asset URLs need the repo name as a base path. Use "/" for local
// dev so `vite dev` still works from the root.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/PokemonGoCalculator/" : "/",
  plugins: [react()],
  // Emit dist/.vite/manifest.json. Nothing in the app reads it; it exists so a
  // checker can tell a STATIC import of the entry from a DYNAMIC one, which is
  // the difference between "the species data is deferred" and "someone changed
  // import() to a static import and the saving silently evaporated while every
  // test still passed". No test in this repo can see bytes — see
  // PLAN_species_moves_split.md's Guard 2.
  build: {
    manifest: true,
  },
  // Game data is bundled at build time from data/normalized/, outside this
  // package's own directory (see src/registry.ts) — allow the dev server to
  // read outside packages/web to serve it.
  server: {
    fs: {
      allow: [repoRoot],
    },
  },
});
