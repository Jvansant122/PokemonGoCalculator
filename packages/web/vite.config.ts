import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Repo is deployed as a project Pages site at
// https://<user>.github.io/PokemonGoCalculator/ (confirmed via `git remote -v`),
// so all built asset URLs need the repo name as a base path. Use "/" for local
// dev so `vite dev` still works from the root.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/PokemonGoCalculator/" : "/",
  plugins: [react()],
});
