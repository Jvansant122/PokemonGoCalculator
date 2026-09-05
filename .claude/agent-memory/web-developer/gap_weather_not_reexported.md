---
name: gap-weather-not-reexported
description: packages/engine/src/index.ts does not re-export weather.ts (WeatherCondition/WEATHER_BOOSTED_TYPES/isWeatherBoosted) even though Scenario.weather uses the type — the workaround used in AssumptionPanel.tsx, and what to do once this is fixed
metadata:
  type: project
---

Found 2026-09-05 while wiring the weather assumption (engine-developer's
`feature_weather_and_boss_moveset_sweep.md`). `packages/engine/src/index.ts`
lists 16 `export * from "./X.js"` lines but has none for `weather.ts` — only
`scenario.ts` (which does `import type { WeatherCondition } from
"./weather.js"`, a type-only import, not a re-export) pulls it in indirectly.
Confirmed by grep: `WeatherCondition`/`WEATHER_BOOSTED_TYPES`/`isWeatherBoosted`
appear only in `comparison.ts`, `scenario.ts`, `weather.ts` itself — never in
`index.ts`. So `import { WeatherCondition, WEATHER_BOOSTED_TYPES } from
"@pogo-analyzer/engine"` fails; `Scenario` (which DOES export fine) is the only
way to touch this type from packages/web today.

**Workaround used** (did not touch packages/engine, per this task's explicit
instruction): `AssumptionPanel.tsx` derives `export type WeatherCondition =
Scenario["weather"]` (zero drift risk, since it's mechanically tied to the
real field) and hand-duplicates `WEATHER_BOOSTED_TYPES`'s 7 real mappings as a
local `WEATHER_OPTIONS` display-label array (typed against the derived
`WeatherCondition`, so a mismatched literal would fail to compile) — commented
at both definition sites explaining this is a stopgap, not a design choice.

**Also could not import `@pogo-analyzer/engine/src/weather.js`** as a subpath
workaround — the engine's `package.json` `"exports"` field only maps `"."`
(no wildcard), so Node/Vite's resolver would reject any subpath import outright
regardless of index.ts. The only two ways to expose a new engine-internal
symbol to packages/web are (1) re-export it from index.ts, or (2) let it ride
along embedded in a type that's already exported (what `Scenario["weather"]`
does here). Worth remembering next time an engine addition lands without an
index.ts export line — check `index.ts`'s `export *` list explicitly, don't
assume something existing in `packages/engine/src/*.ts` is reachable from web.

**If engine-developer later adds `export * from "./weather.js";` to
index.ts**: replace `AssumptionPanel.tsx`'s local `WeatherCondition` alias and
`WEATHER_OPTIONS`'s hardcoded type lists with the real `WeatherCondition` type
and a `WEATHER_BOOSTED_TYPES`-driven label builder, so there's only one copy of
the mapping. Flagged in the AFFECTS line of that session's report rather than
fixed directly, since "don't touch packages/engine" was an explicit constraint
that session.
