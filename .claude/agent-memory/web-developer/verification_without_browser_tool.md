---
name: verification-without-browser-tool
description: What "verify it actually works" looks like in a session with no browser-preview tool available — build+serve+node-level checks, plus scratch scripts against engine functions
metadata:
  type: project
---

This agent's declared tool grant is Read/Write/Edit/Bash/Grep/Glob — no browser tool, despite a
`PostToolUse` hook message mentioning `preview_start`/a "Browser pane" after edits. That hook
message is generic environment boilerplate that fires regardless of whether the tool is actually
granted — it is not evidence the tool exists. Check the literal `<functions>` list given at the
start of the conversation, not hook text. Reconfirmed 2026-09-05: no `chromium`/`chrome`/
`google-chrome`/`msedge` usable from the Bash shell, and no `playwright`/`puppeteer` in
`node_modules/.bin` anywhere in the repo — there is no scriptable browser fallback, only the ladder
below.

**Verification ladder used absent a browser tool** (2026-09-05, wiring
[[wiring-persists-through-faint]]):
1. `npx tsc --noEmit` in `packages/web` (catches shape mismatches immediately).
2. `npm run build --workspace=packages/web` (real production build, not just typecheck).
3. `npm run test:engine` (confirms untouched engine still green — useful even when the task is
   UI-only, since it's cheap and rules out any accidental engine edit).
4. `npx vite preview` served in background (write its log to the scratchpad dir, not `/tmp` —
   `/tmp` write failed with a permission error on this Windows/Git-Bash setup), then `curl` the
   root and the built JS/CSS asset paths for 200s, and `node --check` the built JS bundle for
   syntax validity. This confirms the app *loads* without a 404/error but does NOT confirm no
   runtime console error — say that limitation explicitly in the report rather than implying full
   verification.
5. For logic that's hard to eyeball (a formula combining two optional params in a non-obvious
   way), write a tiny throwaway `.ts` script mirroring the exact call shape from the component,
   copy it briefly into the relevant package's `src/` dir (so relative imports work) and run it
   with `node --experimental-strip-types` (Node 24 supports this) — then delete it and confirm via
   `git status` that no trace remains. This is a legitimate way to numerically prove a formula's
   behavior when you can't click through the actual chart. `npx tsx` also works for this and
   handles TS-source imports directly; either way, use a **relative** import path
   (`../engine/src/index.ts`), not an absolute `C:/...` one — Node's ESM loader throws
   `ERR_UNSUPPORTED_ESM_URL_SCHEME` on an absolute Windows path. The pinned Scenario A fixtures
   (`MEGA_RAICHU_X`/`MEGA_RAICHU_Y`/`PRIMAL_KYOGRE`/`SCENARIO_A_LEVEL`/`SCENARIO_A_PERFECT_IVS`,
   exported from `packages/engine/src/fixtures/scenarioA.ts`) are the exact default scenario
   `App.tsx` loads on a fresh page — using them in the scratch script makes its output directly
   comparable to what a user actually sees, not just an arbitrary check.

Always kill the background `vite preview` process before finishing (find it via
`Get-NetTCPConnection -LocalPort <port>` in PowerShell) — don't leave it running.

**Update 2026-09-05 (IV sensitivity checks): `npx tsx` clears the import-resolution ceiling that
blocks `node --experimental-strip-types`.** [[sensitivity-flip-bar-and-share-bar]] found that
`node --experimental-strip-types` throws `ERR_MODULE_NOT_FOUND` the moment a scratch script
imports a sibling module via a `.js`-suffixed specifier resolving to `.ts` source (this repo's
"bundler" moduleResolution convention) — that was treated as a hard ceiling, forcing a fallback to
grep-the-built-bundle instead of actually exercising the function. Re-tested this session:
dropping the scratch script *inside* `packages/web/src/` (as a real sibling of the module under
test, e.g. `_scratch_iv_check.ts` next to `sensitivity.ts`) and running it with `npx tsx
path/to/script.ts` resolves `./sensitivity.js` → `sensitivity.ts` and `./registry.js` →
`registry.ts` correctly, including pulling in the real bundled `data/normalized/species.json` via
`registry.ts`'s own relative import. This means a full `computeSensitivity(...)` call (or any
function with sibling-module imports) genuinely is numerically provable pre-browser, not just an
isolated pure-formula file — this raises the ceiling from step 5 above. Always delete the scratch
file and confirm via `git status --porcelain` afterward; it must not linger even uncommitted.

**The pinned default fixtures (Mega Raichu X/Y vs Primal Kyogre) are so lopsided that almost every
sensitivity check reports "no flip found"** — a real `computeSensitivity` output of all-Infinity
distances doesn't distinguish "my new check is broken" from "this scenario just doesn't flip
here." To get a genuine positive case while testing a new check, swap in two real, comparably-
matched mega species from `data/normalized/species.json` (e.g. `latias-mega` vs `latios-mega` —
same typing, one bulkier/one harder-hitting, a real tradeoff pair) via `speciesRegistry.get(id)`
directly in the scratch script — this reliably produces real flips across several checks at once,
useful both for confirming the new check's positive case and for spot-confirming the pre-existing
checks weren't disturbed. Also useful: the 1.3x mega-boost swamps modest IV deltas by default (IV
checks report "no flip" for a fair matchup), but setting `candidateMegaBoostDisabled: [true, true]`
removes that dominant term and lets Attack/Defense IV checks show real flips — a legitimate way to
get a same-run positive-and-negative pair (Stamina IV stayed "no flip" while Attack/Defense both
flipped) without needing two separate scratch scenarios.
