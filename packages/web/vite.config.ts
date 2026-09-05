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
  // Game data is bundled at build time from data/normalized/, outside this
  // package's own directory (see src/registry.ts) — allow the dev server to
  // read outside packages/web to serve it.
  server: {
    fs: {
      allow: [repoRoot],
    },
  },
});
