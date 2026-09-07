---
name: feature-shadow-toggle-all-tabs
description: Adding a general "Shadow" checkbox to every tab's own attacker/candidate picker (not raid targets), the shared shadowToggle.ts helper module, the raw-species-everywhere-except-the-engine-call-boundary convention it depends on, and a real gap found in breakpoints.ts
metadata:
  type: project
---

Built 2026-09-06/07. Scope confirmed directly with the user: a per-tab toggle
letting a user flag ANY selected own-attacker species as Shadow (applies
shadow.ts's `SHADOW_ATTACK_MULTIPLIER`/`SHADOW_DEFENSE_MULTIPLIER`), since a
species only ever gets `isShadow: true` from the registry when it HAPPENS to
be a currently-active "Shadow X" raid TARGET (`scripts/sync-data/shadowVariant.ts`,
raid-matching triggered) — a user's own owned Shadow Pokémon of any other
species had no way to be selected as one. Raid targets/bosses were explicitly
OUT of scope (already correctly Shadow-aware via that raid-matching path).

**New shared file: `packages/web/src/shadowToggle.ts`** — every one of the 4
affected tabs (Comparator, Team Raid, IV Breakpoints, Attack/Defense
Breakpoints) imports from this rather than reimplementing the guard logic 4
times:
- `applyShadowToggle(species, toggledOn)` — shallow-clones with
  `isShadow: true`, but refuses (returns the input unchanged) if species is
  null, the toggle is off, species is ALREADY isShadow, OR species carries a
  `boost` — this last check is a defensive belt-and-suspenders duplicate of
  each tab's own normalization, so a bug in a caller's disabled/normalize
  logic can never actually construct the invalid combination
  `shadowAdjustedBaseStats` throws on.
- `shadowToggledBaseStats(species, toggledOn)` — for breakpoints.ts's
  `attackDamageGrid`/`defenseDamageGrid`, which take a raw
  `baseAttack`/`baseDefense` NUMBER and never look at `isShadow` at all (see
  the real gap noted below) — calls the engine's own (already publicly
  exported, via `export * from "./shadow.js"` in index.ts)
  `shadowAdjustedBaseStats` directly, same guard as above.
- `effectiveIsShadow(species, toggledOn)` — badge-display boolean.
- `shadowToggleUiState(species)` — `{disabled, forcedOn, title}` for the
  checkbox: disabled+unchecked when species has `.boost` (mutually
  exclusive), disabled+FORCED CHECKED when species is already isShadow from
  the registry (nothing left for the toggle to do, and showing it
  unchecked+enabled would be misleading).

**Critical design decision — species objects stay RAW everywhere except the
exact engine-call boundary.** Every view keeps its `species`/`candidates`/
`slotSpecies` variable as the unmodified registry object at all times (used
for the picker, movepool logic, `.boost` checks, and badges via
`effectiveIsShadow`) — `applyShadowToggle`/`shadowToggledBaseStats` is called
ONLY at the last moment, right before/inside the engine call
(`runSustainedComparison`, `compareAcrossBossChargedMoves`,
`computeSensitivity`, `runTeamRaid`, `compareIvSpreads`, or the
`attackDamageGrid`/`defenseDamageGrid` base-stat computation). **Why this
matters**: if you instead store the toggle-applied clone back as the
component's main `species` variable, `shadowToggleUiState` (checking
`species.isShadow`) would see the clone's own `isShadow: true` and think
"this came pre-flagged from the registry" — permanently disabling+forcing-on
the very checkbox that turned it on, since the user can never turn it back
off. Caught this in design before writing any code, not as a bug fix — worth
flagging for the next tab addition that touches Shadow/isShadow, since it's
non-obvious and easy to reintroduce by "simplifying" the raw/toggled split.

**A real, closed-in-this-session finding: `breakpoints.ts`'s
`attackDamageGrid`/`defenseDamageGrid` are the ONE call path in this codebase
that takes a raw `baseAttack`/`baseDefense` number instead of a whole
`SpeciesDefinition`, so they never look at `isShadow` at all** — unlike
`effectiveStatsAtLevel` (stats.ts, used by comparison.ts/teamRaid.ts) and
`ivComparison.ts`'s `compareIvSpreads`, which both take the whole species and
internally call `shadowAdjustedBaseStats`. This meant the naive "just clone
the species with isShadow:true" trick (which works for the other 3 tabs)
would silently do NOTHING for Attack/Defense Breakpoints — the grid functions
would keep using whatever raw `baseAttack` number was passed regardless of
the clone's `isShadow` flag. Initially suspected this needed an engine change
(exporting `shadowAdjustedBaseStats` specifically for this use), but it was
ALREADY exported (`export * from "./shadow.js"` has been in index.ts since
shadow.ts was created) — a `grep` of index.ts with an overly-clever combined
pattern first returned a false negative here, worth re-checking with a
simpler pattern before concluding a gap exists. No engine change was needed;
`shadowToggledBaseStats` in shadowToggle.ts just calls the engine's own
already-public function directly. If a future tab adds another raw-number
(not whole-species) engine entry point, check for this same blind spot
first.

**`Scenario`/`TeamScenario` are BOTH engine-owned types (packages/engine/src/
scenario.ts and teamScenario.ts respectively)** — despite the launching
agent's task description saying `packages/web/src/teamScenario.ts`, that file
doesn't exist; `TeamScenario` is imported from `@pogo-analyzer/engine` in
TeamRaidView.tsx exactly like `Scenario` is in ComparatorView.tsx. Don't trust
a memory/task-description file path claim for an engine-vs-web scenario type
without grepping the actual import first — this project's other two scenario
types (`IvBreakpointsScenario`, `AttackDefenseBreakpointsScenario`) genuinely
DO live in packages/web, so the pattern is inconsistent across tabs and each
one needs checking individually.

**Adding a field to an engine-owned Scenario type without editing
packages/engine**: since this task's constraints forbade any packages/engine
edit, and `encodeScenario`/`decodeScenario`/`encodeTeamScenario`/
`decodeTeamScenario` are pure `JSON.stringify`/`JSON.parse` pass-throughs with
zero field enumeration, a field the engine's own type doesn't declare still
round-trips correctly through the exact same shared base64url transport. The
pattern used (twice, once per engine-owned scenario type):
```ts
interface ComparatorScenario extends Scenario {
  candidateShadow: [boolean, boolean];
}
```
Build the object as this local extended type (TS excess-property checks
don't fire since it's never a fresh literal passed directly where `Scenario`
is expected — it flows through a typed variable/function return first) and
pass it anywhere a `Scenario` is expected (structural typing: a superset is
assignable to a subset). On decode, cast `parseScenarioFromUrl(...)` (typed
`Scenario | null`) to `ComparatorScenario | null` before reading the extra
field — the actual runtime object really does carry it if the link was built
by this app version, since JSON doesn't care about TS's declared field list.
Verified this proof numerically with a throwaway `.mts` script (not just
"it compiles") — round-tripped `candidateShadow: [true, false]` through the
real `encodeScenario`/`decodeScenario` and got back the exact array, and
separately confirmed an old-shape scenario (built before this field existed)
decodes the field as `undefined`, proving the `?? [false, false]` guard in
`scenarioToAssumptions` — not the engine — is what prevents that reaching a
controlled checkbox. Did the same for `TeamScenarioSlot` → an inline
`TeamScenarioSlotWithShadow`/`TeamScenarioWithShadow` pair (per-slot field,
not per-scenario). **Flagged to engine-developer in this session's AFFECTS
note**: both `Scenario.candidateShadow` and `TeamScenarioSlot.isShadow` are
real, load-bearing fields currently living only in web-local type
extensions — folding them into the engine's own types properly (so a future
engine-side consumer doesn't have to know about this workaround) is
engine-developer's call, not forced here since the task explicitly
prohibited a packages/engine edit this session.

**Per-tab wiring summary** (all follow the same shape: add field to
Assumptions-equivalent type, thread through scenario codec with `?? default`
guard, add `normalizeAssumptions`/`normalizeTeamAssumptions` that forces the
toggle off when the selected species has `.boost`, wrap the raw `useState`
setter so normalization runs on every change not just on decode, add a
checkbox via `shadowToggleUiState`, apply the toggle at the engine-call
boundary only):
- **Comparator** (`ComparatorView.tsx` + `AssumptionPanel.tsx`): tuple field
  `candidateShadow: [boolean, boolean]`. New `shadowAdjustedCandidates` memo
  (species.candidates mapped through `applyShadowToggle`) feeds all three
  engine calls (`runSustainedComparison`, `compareAcrossBossChargedMoves`,
  `computeSensitivity`) — `species.candidates` itself stays raw for the
  panel/badges. Checkbox always rendered (not gated on `.boost` presence,
  unlike the existing mega-boost-disable checkbox) — disabled+titled instead,
  per this feature's explicit UI spec (different from the boost-disable
  toggle's "hide entirely for non-mega" precedent).
- **Team Raid** (`TeamRaidView.tsx` + `TeamAssumptionPanel.tsx`): per-slot
  field `TeamSlotAssumption.isShadow: boolean` (6 independent booleans, one
  per roster slot — NOT a tuple/single field, since each slot is an
  independent species selection unlike the Comparator's fixed 2 candidates).
  `normalizeTeamAssumptions` (already existed for `isMega`) extended to also
  force `isShadow` off per-slot when THAT slot's own species has `.boost`,
  independent of which slot (if any) is the roster's one `isMega` slot.
  `runTeamRaid`'s per-slot `species` field is the only place the toggle gets
  applied; `slotSpecies` (panel display) stays raw.
- **IV Breakpoints** (`IvBreakpointsView.tsx` + `IvBreakpointsAssumptionPanel.tsx`):
  single field `isShadow: boolean` (one shared species/moveset across both
  IV spreads, so one toggle, not two) on both `IvBreakpointsAssumptions` and
  `IvBreakpointsScenario` (this one's genuinely web-owned, no extension-type
  trick needed). New `attackerForCalc` memo feeds BOTH `compareIvSpreads`
  call sites (single-target `result` AND the all-active-bosses
  `sweepAggregate` loop) — both needed an added `!attackerForCalc` guard
  clause alongside the pre-existing `!species` guard, since TS can't narrow
  a separately-memoized derived value just because the source was checked.
- **Attack/Defense Breakpoints** (`AttackDefenseBreakpointsView.tsx`, no
  separate panel file, all inline): single field `isShadow: boolean`. New
  `adjustedBaseStats` memo (`shadowToggledBaseStats(species, isShadow)`) feeds
  BOTH `attackDamageGrid` calls (Attack mode, `.baseAttack`) AND both
  `defenseDamageGrid` calls (Defense mode, `.baseDefense`) — same one toggle,
  same one species, just whichever of the two adjusted numbers the active
  mode needs. Checkbox rendered unconditionally (not gated to either mode)
  since it affects both.

**`noUncheckedIndexedAccess: true`** (tsconfig.base.json, project-wide) bit
twice: `species.candidates.map((c, i) => applyShadowToggle(c,
assumptions.candidateShadow[i]))` — indexing a `[boolean, boolean]` tuple
with a generic (non-literal) loop variable `i: number` widens to
`boolean | undefined`, not `boolean`, even though a literal `value.candidateShadow[1]`
elsewhere in the same session compiled fine (literal-index tuple access stays
exact). Fixed both sites with `assumptions.candidateShadow[i] ?? false`. Worth
remembering as a recurring gotcha whenever mapping over a per-candidate tuple
with an index variable rather than two hand-written `[0]`/`[1]` accesses.

**Verification this session**: full ladder — `npm run test:engine` 147/147
green (zero engine files touched, confirmed via `git status --porcelain
packages/engine` showing only the pre-existing unrelated `raidBoss.ts`/
`raidBossTier.test.ts` changes from earlier in-progress work). `npx tsc
--noEmit` clean in both packages. `npm run build --workspace=packages/web`
succeeded (same pre-existing >500kB chunk warning only). No browser-preview
tool in this session's grant (Read/Write/Edit/Bash/Grep/Glob only, per
[[verification-without-browser-tool]]) — ran `vite preview`, discovered (new
gotcha) that `vite preview`'s served HTML references `/assets/...` at ROOT,
NOT under the `/PokemonGoCalculator/` base path some earlier session's memory
implied — curling the base-prefixed asset path returns the index.html SPA
fallback (200 OK, but `Content-Type: text/html`, not JS), which
`node --check` correctly rejects as invalid JS. Fetch assets from bare `/`
when using `vite preview` locally; the `/PokemonGoCalculator/` base only
matters for the real GitHub Pages deploy path, not local `vite preview`.
`node --check`ed the real JS bundle successfully once fetched from the
correct path, and grepped it (using `grep -o ... | wc -l`, NOT `grep -c` —
the whole minified bundle is 1-3 physical lines, so `grep -c` undercounts to
"1" regardless of true occurrence count) for the shipped UI strings (all 4
tabs' Shadow checkbox labels/titles) — all found. Proved the actual math
numerically with two scratch `.mts` scripts in `packages/engine/src/`
(deleted after, `git status --porcelain packages/engine` reconfirmed clean):
(1) `effectiveStatsAtLevel` with `isShadow: true` vs `false` on an identical
fixture species — attack rose 157→186, defense fell 142→120 at level 30/15
IVs, matching the 1.2x/5-6 multipliers through the floor pipeline, plus
confirmed `shadowAdjustedBaseStats` really does throw when both `isShadow`
and `boost` are set on the same object; (2) the `ComparatorScenario`
extension-type round-trip proof described above. Did NOT click through the
live rendered tabs in an actual browser — same real gap as every prior
tab-build session in this project's history.
