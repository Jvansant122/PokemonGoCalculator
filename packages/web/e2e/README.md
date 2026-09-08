# e2e — Playwright browser smoke suite

Previews the already-built production bundle (`vite preview`) and drives it
with real Chromium — this is NOT a component-test suite (that's `src/**/*.test.ts`
under vitest); it exists to catch what only a rendered browser shows: console
errors, silently-broken calculations (NaN/undefined/Infinity text), and a
shared-scenario link failing to round-trip.

## Run locally

```bash
npm run build --workspace=packages/web
npm run test:e2e
```

`chromium` only, via `npx --workspace=packages/web playwright install chromium`
if the browser binary isn't installed yet.

## In CI

Runs after `npm run verify`, with `GITHUB_PAGES=true` set for both the build
and the test run (`playwright.config.ts` derives `baseURL` from that same
variable, matching `vite.config.ts`'s own `base` path logic).
