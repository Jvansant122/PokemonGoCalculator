// Root ESLint config (flat). Deliberately narrow: the goal is the deterministic half of
// what `code-simplifier` used to do by hand (unused imports/vars, obvious hook misuse),
// not a style opinion. Formatting is not linted. Unused *exports* are ts-unused-exports' job
// (`npm run unused-exports`), not ESLint's.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "data/**",
      "packages/web/e2e/**",
      "eslint.config.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mjs,js}"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, ...globals.es2022 },
    },
    rules: {
      // The one rule that pays for itself here: dead imports/locals are the most common
      // leftover after a feature pass. `_`-prefixed names are an explicit opt-out.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // Existing code uses `any` in the sync scripts at the raw-JSON boundary on purpose.
      "@typescript-eslint/no-explicit-any": "off",
      // `as unknown as` casts on the data JSON are a documented, deliberate pattern.
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["packages/web/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // React-Compiler-era rules. Real findings (a component defined inside render, setState
      // inside an effect) but pre-existing and behaviour-preserving to fix — surfaced as
      // warnings for web-developer to pick up, not as a gate.
      "react-hooks/static-components": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
);
