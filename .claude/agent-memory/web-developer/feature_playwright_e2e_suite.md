---
name: feature-playwright-e2e-suite
description: Playwright browser smoke suite added to packages/web (2026-09-08) — the JSON-import-attribute gotcha that blocks a direct spec-file import of registry.ts, and the tsx-subprocess workaround
metadata:
  type: project
---

Added `packages/web/e2e/` (Playwright, chromium-only): `tabs.spec.ts` (all six tabs — console/page
error check, headline-region visibility, no literal NaN/undefined/Infinity text) and
`share-link.spec.ts` (Comparator: change `#level` via the UI, click "Build link", load the
resulting URL fresh, assert the value survived). `playwright.config.ts` previews the already-built
`dist/` (`vite preview`) rather than building itself; `baseURL`/the deploy path mirror
`vite.config.ts`'s own `GITHUB_PAGES` env check.

**The one real technical gotcha: `registry.ts`'s bare JSON imports break under Playwright's own
Node process, but not under Vite or Vitest.** `packages/web/src/registry.ts` does
`import speciesData from "../../../data/normalized/species.json"` with no import-attribute
clause. Vite and Vitest both resolve `.json` imports through their own module graph (no attribute
needed). Playwright Test's runtime, however, ultimately hands the transpiled ESM output to
**Node's own native ESM loader** (confirmed on Node v24), which throws `needs an import attribute
of "type: json"` the instant any `.spec.ts` file transitively imports `registry.ts` (directly, or
via importing a View file / `run/*.ts` module that imports it). This is NOT fixable from the spec
file's side — the failure is in the imported module, not the importer.

**Workaround chosen: shell out to `tsx` as a short-lived child process, not a direct top-level
`import`.** `e2e/helpers/computeExpected.ts` is a plain script (run under `tsx`, never under
plain `node` or Playwright's transform) that imports `registry.ts` + a View's `DEFAULT_ASSUMPTIONS`
+ its `run/*.ts` function exactly the way `run.smoke.test.ts` already does, computes one JSON
payload, and prints it to stdout. `e2e/helpers/runViaTsx.ts` (imported *from* the `.spec.ts` files,
no JSON problem here since it does no such import itself) resolves `tsx/cli` via
`createRequire(import.meta.url).resolve("tsx/cli")` — this walks up the directory tree the same
way Node's own bare-specifier resolution would, so it finds the ROOT `node_modules/tsx` (a
root-level devDependency used by `scripts/run-scenario.ts`, not a packages/web dependency) without
needing it hoisted into packages/web's own node_modules — then `execFileSync(process.execPath,
[tsxCliPath, scriptPath, tab], ...)`. This is a genuine deviation from "import from ../src/run/...
and ../src/<Tab>View in the spec" as literally read, but it does still exercise those exact
modules/functions — just from a subprocess, not the spec file's own module graph. Confirmed this
was the actual blocker (not a config mistake) by writing a throwaway spec that imported
`registry.ts` directly and reproducing the exact Node error message before building the
workaround.

**Two considered-but-rejected fixes, for if this resurfaces:** (1) adding
`with { type: "json" }` to `registry.ts`'s three JSON imports — would likely work (esbuild 0.21.5,
what Vite 5.4 bundles, supports the syntax) but touches a file every tab depends on for a
test-infra-only reason, higher blast radius than the subprocess trick for no real benefit.
(2) Playwright's own babel transform (`node_modules/playwright/lib/transform/babelBundle.js`) does
know about `assert`/`with`/`with-legacy` JSON import syntax — but only if the *source* already
declares it, which `registry.ts` doesn't; there's no transform-level way to inject the attribute
for an import that doesn't already have it.

**Other conventions established:** no test ids anywhere in this app (per existing convention) —
every selector is a heading's exact/regex-matched English text (`getByRole("heading", { name })`),
which was sufficient and stable for all six tabs; no tab needed a workaround selector.
Species Report's debounced (300ms) sweep only needed a 20s timeout in practice (default scope is
currently-active raids only, ~12 bosses, not the full ~600-boss past-raids sweep) — didn't need to
force `includePastRaids` off explicitly, it already defaults off. `webServer.command` runs
`npm run preview -- --port 4173 --strictPort` from `packages/web` (the config file's own
directory) rather than raw `vite preview`, for a stable, predictable port across both
`npx playwright test` (run from `packages/web`) and `npm run test:e2e` (root script that delegates
via `--workspace=packages/web`, which also sets cwd to that package dir) — verified both
invocation paths and both `GITHUB_PAGES` on/off build+preview combinations actually work, not just
type-check.
