# Plan: multi-raid, whole-roster Power-Up Optimizer

Self-contained implementation plan for a fresh Claude Code session. Read `CLAUDE.md` in full
first, then this file top to bottom before touching code — several decisions here deliberately
override what the current tab does, and one of them is a **documented exception to a standing
decision** (see §3.2).

**Status:** planned 2026-09-08, not yet implemented. Delete this file when the feature ships and
record the outcome in `HANDOFF.md`.

---

## 1. What is being built

Three expansions to the existing **Power-Up Optimizer** tab (`view=power-up-optimizer`), all of
which the user asked for together:

1. **Multi-raid.** Rank power-ups by their value across a *set* of raid bosses (default cap 30,
   configurable), not against one chosen boss.
2. **Whole-roster import.** Accept a **Poke Genie CSV export** as the pool of Pokémon to reason
   over — 164 rows in the user's actual export, versus the current tab's 6 hand-entered slots.
3. **Bench-aware candidates.** Do *not* restrict candidates to the 6 Pokémon that would already
   be fielded. Explicitly evaluate whether a currently-benched Pokémon would beat a fielded one
   *if powered up*. This is the headline new question, and it is the one the current tab
   structurally cannot ask.

This stays **one tab with a mode switch**, not a seventh tab — see §4.1.

### The thesis, restated for this feature

`CLAUDE.md`'s product thesis is that the interesting output is *where the ranking flips*, not
who is on top. That generalizes cleanly here: the multi-raid answer's most valuable output is
**which power-up is best depends on which bosses you actually fight**, surfaced as a per-boss
breakdown under every ranked row, not collapsed into a single number. Build the per-boss
breakdown as a first-class output, not as a debug view.

---

## 2. Measured facts this plan is built on

Gathered 2026-09-08 by direct measurement, not estimated. Re-measure before trusting any of
these if the engine's simulator changes.

### 2.1 Engine cost (the compute budget)

| Primitive | Measured |
| :--- | :--- |
| `runSustainedComparison`, 1 attacker vs 1 boss, 5 iterations | **0.46 ms** |
| `runTeamRaid`, one 6-slot roster, one seed | **0.25 ms** |

Consequences, worked through in the "Compute budget" subsection of §5: a full 164-mon × 30-boss cheap screen is ~2.3 s, and a
shortlist of ~40 candidates × 30 bosses × 5 paired seeds is ~1.5 s. Both are affordable **only
off the main thread** — see §4.4.

### 2.2 The user's actual Poke Genie export (164 rows)

Probed directly against `data/normalized/species.json`:

| Fact | Count | Consequence |
| :--- | :--- | :--- |
| Rows | 164 | |
| Matched to a registered species by dex + form | **162 / 164** | Matcher design in §4.2 |
| Unmatched | 2 (`Sawsbuck`, `Toxtricity`) | Poke Genie writes a bare name; `species.json` only has `sawsbuck-spring` / `toxtricity-amped`. Fix with a single-dex-candidate fallback. |
| Blank Atk/Def/Sta IV (appraisal-only) | **70 (43%)** | §3.3 |
| Blank fast move | **91 (55%)** | §3.3 |
| Blank charged move | **98 (60%)** | §3.3 |
| `Level Min` ≠ `Level Max` (level uncertain) | 4 | Use `Level Min`, badge approximate |
| Has a second charged move | 2 | **Not modelled** — the engine simulates one charged move per attacker. Record it, surface it as a caveat, do not silently drop it. |
| Shadow / Purified / Lucky | 6 / 2 / 1 | Maps onto existing `PowerUpCostModifiers` |
| Mega forms | 2 (Delphox, Blaziken) | At most one mega may be fielded — engine already enforces |
| Species appearing more than once | **27** (12× Houndour, 11× Inkay, 4× Mewtwo/Charizard/Vaporeon/Totodile) | **Breaks the current per-slot candy model** — see §3.4 |
| **Not fully evolved** | **69 (42%)** | Measured via the proxy "Poke Genie's own `Name (G/U/L)` rank columns name a *different* species than `Name`" — e.g. `Houndour → Houndoom`, `Beldum → Metang/Metagross`, `Inkay → Malamar`. A close proxy, not an exact evolution graph; the real filter needs Phase 0's data. **Recommending a power-up on any of these is wrong advice** — see §3.6 |

Distinct `Form` values seen: `Normal`, `` (empty), `Mega`, `Alola`, `Hisui`, `Galar`, `Male`.
Note `species.json` suffixes are **not** uniform (`raichu-alola`, `sneasel-hisuian`,
`stunfisk-galarian`, `indeedee-male`) — the matcher must not assume one suffix convention.

### 2.3 Roster serialization size

Measured on the real 164-row export, with a compact slot shape:

- Raw JSON: **12,022 bytes** → base64url **16,030 chars** (unusable in a URL)
- `deflate-raw` + base64url: **2,325 bytes** → **3,100 chars** (viable, but see §3.2 — the user
  chose not to take this route)

### 2.4 Raid-boss recency is not sourceable

`raidHistory.json` has 764 rows. Only **19** (`live-feed`, and the same 19 as
`activeRaids.json`) carry real dates; the other 745 (`pogoapi-previous` 490,
`pokebattler-legacy` 161, `bulbapedia-archive` 78, `researched-tier` 16) all stamp the sync
run's own placeholder timestamp — `registry.ts` already documents this explicitly. The
Bulbapedia archive's newest page is `Season_11` = **June–August 2023**.

**There is therefore no data source in this repo for "the 30 most recent raids."** Do not
invent one by sorting on `firstSeenAt`/`lastSeenAt`; that would silently order 745 rows by a
tie. See §3.1 for what was decided instead.

---

## 3. Decisions already made

The user was asked and answered on 2026-09-08. These are settled — implement them, don't
re-litigate. Where a decision has a known cost, the cost is stated so a future session doesn't
"discover" it as a bug.

### 3.1 Boss set: active raids + optionally tier-filtered past bosses

Default to the **19 currently-active bosses** from `activeRaids.json`, plus an opt-in "include
past bosses" checkbox with per-tier filters — i.e. reuse the **Species Report tab's existing
model exactly** (`registry.ts`'s `activeRaidBossOptions()` / `pastRaidBossOptions()`, including
its `eraHp` handling and its `source` badges). A configurable **max boss count, default 30**,
trims the resulting list.

Rejected: sorting by date (no dates — §2.4), and sweeping all 764 (≈40× the compute, and leans
entirely on undated archive rows).

**Cost of this decision:** the default boss set changes every raid rotation, so a result is not
reproducible across rotations. Mitigate by encoding the **resolved boss id list** into the
scenario, not the phrase "active raids" — a shared link must reproduce the sweep that was
actually run. This is non-negotiable; a link that silently re-resolves to a different boss set
is the same bug class `check-scenario-roundtrip` exists to prevent.

### 3.2 Roster lives in `localStorage`; only settings go in the URL

**This is a deliberate, user-chosen exception to `CLAUDE.md`'s standing decision that every
user-facing assumption round-trips through `Scenario`.** It was flagged as breaking that rule
and chosen anyway, with the tradeoff stated. Record it in `CLAUDE.md` as an exception rather
than leaving it as a silent hole.

Implementation consequences, all mandatory:

- **Keep the roster pool out of `PowerUpOptimizerAssumptions` entirely.** It becomes separate
  state (`rosterPool.ts`), not a field on the assumptions interface. This is not a workaround —
  it makes the exception *structural and visible* rather than a field quietly missing from the
  round-trip, and it means `check-scenario-roundtrip` keeps passing honestly instead of being
  exempted.
- The URL still carries every *setting*: mode, boss set (resolved ids — §3.1), boss/dodge/
  weather/cadence/timer/swap/revive assumptions, budgets, rank-by, and the boss-count cap.
- **The UI must say so, visibly**, wherever a share link is produced: *"the imported roster is
  stored in this browser only — this link carries the settings, not the roster."* A recipient
  opening the link with no roster gets an explicit empty-state that says what's missing and
  offers CSV import, never a silently-empty result.
- Add **"export roster as CSV / JSON"** alongside import, so a roster is transferable by file
  even though it isn't by link. This is the honest substitute for shareability.
- `PLAN_login_and_roster_persistence.md` remains the real long-term answer and already
  anticipates this ("should support both, not choose one"). Do not implement it here.

### 3.3 Missing data: use what's recorded, fall back to the first move

Consistent with every other tab. Specifically:

- **Missing moves** (55% fast / 60% charged): fall back to `species.fastMoves[0]` /
  `chargedMoves[0]`, the engine's existing convention everywhere.
- **Missing IVs** (43%): derive an even split from Poke Genie's `IV Avg` column
  (`IV Avg/100 × 45`, distributed as evenly as possible across attack/defense/stamina) and
  badge the entry **approximate**.
- **Uncertain level** (`Level Min` ≠ `Level Max`, 4 rows): use `Level Min`, badge approximate.
- Every approximate entry must be visibly badged in the roster table **and** in any
  recommendation that names it. Reuse the existing `isApproximate` visual convention.

**Known understatement, accept and document:** a Pokémon whose recorded moveset is bad (or
absent, defaulting to move #0) will be under-ranked even when a cheap TM would fix it. This is
the *correct* behavior for "what should I power up", but it is not the answer to "what should I
invest in". Add an `IDEAS.md` entry for a future "best-moveset" toggle; do not build it now.

### 3.4 Candy is per species, not per slot — and Poke Genie doesn't export it

Two independent problems, both newly load-bearing because the pool has duplicates (§2.2):

1. **Poke Genie's CSV contains no candy-on-hand column at all.** Its `Candy Cost (G/U/L)`
   columns are the cost to reach a PvP rank — a different number entirely. Do not read them as
   candy on hand; that would fabricate a budget.
2. **27 species appear more than once.** The current `PowerUpSlotInput.candyOnHand` is
   per-slot, which would let the planner spend the same Houndour candy twelve times.

Resolution for v1:

- Model candy as a **per-species pool** (`candyBySpeciesId`), shared across every pool entry of
  that species, never per-entry.
- Every entry starts with candy **unknown**, not zero. An unknown-candy candidate is **ranked
  normally** in the "what's best" table (its cost is displayed as a required spend) but is
  **excluded from the fixed-budget plan**, which needs real numbers. Mark this on the candidate
  as `costUnverified`.
- The UI lets you fill candy in **inline, per species, for the rows you actually care about** —
  entering 164 numbers is not a real workflow. Filling one in promotes that candidate into the
  budget plan.
- **Stardust and the two shared Rare Candy pools stay exactly as they are** — account-wide,
  known, already modelled correctly.

**UPDATE 2026-09-09 — this gap is closed, pool per FAMILY.** Phase 0 landed `candyFamilyId` on
every real species (`FAMILY_BELDUM` etc.), so the "v1 pools per species id" compromise is no
longer needed and should not be built. Pool on `candyFamilyId`.

This turned out to matter more than estimated. On the user's real roster, **25 candy families
have more than one entry** — `FAMILY_HOUNDOUR` has **14** (12 Houndour + 2 Houndoom),
`FAMILY_INKAY` 11, `FAMILY_EEVEE` 9, `FAMILY_CHARMANDER` 9 (spanning Charmander, Charmeleon and
four Charizard). Pooling per species id would have let a planner spend the same Houndoom candy
on entries that in reality share one pot.

**Megas carry no `candyFamilyId`** (all 61 are `undefined`, including the roster's
`delphox-mega`/`blaziken-mega`) — resolve a mega entry's candy against its **base species'**
family, since that is whose candy a real power-up spends. Mega Energy is a separate currency
this tool does not model at all (§6.3).

### 3.5 Parallel-session file partition

The user is making **simulator / team-raid engine changes** (`simulate.ts`, `teamRaid.ts`) in
another session concurrently. Therefore:

- **Treat `packages/engine/src/simulate.ts` and `teamRaid.ts` as read-only.** Wrap, never
  modify. If this feature genuinely needs a change in either, stop and hand it to the other
  session rather than editing.
- All new engine code goes in **new files** (§4.3). The only shared line touched in
  `packages/engine` is a small export block appended to `index.ts`.
- **Pin the dependency.** Add a test asserting the exact `runTeamRaid` input fields and result
  fields this feature consumes, so a signature change in the other session surfaces as a named
  test failure rather than silent behavioral drift.

---

### 3.6 Unevolved Pokémon are not power-up candidates

Added after `pogo-researcher`'s findings (§6.2), not part of the original four questions —
but it follows directly from them and from the shape of the user's own export.

An unevolved Pokémon should **never** be recommended for a power-up as-is. Evolution costs candy
only (no stardust), preserves level and IVs exactly, and raises base stats — so every stardust
spent before evolving buys strictly less than the same stardust spent after. The export contains
12 Houndour, 11 Inkay, 4 Totodile, plus Beldum, Machop, Charmander and others; ranking them as-is
would be actively wrong advice, not merely imprecise.

**v1 behavior:** an entry whose species has an available evolution is **excluded from candidate
generation** and reported in `neverCompetitive` with the reason `"evolve first"`, naming the
evolution. It is *reported*, never silently hidden — the whole point is that the user sees
"evolve this, don't power it up."

> **The filter must test `isFullyEvolved === false`, never `!== true`.** Phase 0 landed the field
> as optional, and it is `undefined` for all 61 mega/primal species — which on the user's own
> roster is **exactly and only `delphox-mega` and `blaziken-mega`**. A mega form is by definition
> a temporary evolution of an already-fully-evolved species, so excluding on "not `true`" would
> silently drop Mega Blaziken, plausibly the roster's strongest attacker, while looking like the
> filter was working. `undefined` means "no evolution data" (megas, hand-authored fixtures) and
> must be treated as eligible.

**Measured on the real roster after Phase 0** (exact evolution graph, superseding §2.2's
proxy): **74 of 164 excluded**, 2 undefined-and-kept, **90 eligible candidates**. The largest
exclusions are Houndour ×12, Inkay ×11, Totodile ×4, Squirtle ×4.

**v2 (not now, record in `IDEAS.md`):** reframe the candidate as *"evolve, then power up to L"*,
priced as evolution candy + power-up cost, which would let a cheap unevolved Pokémon legitimately
win. That needs per-species evolution *costs*, not just the evolution graph.

This makes **Phase 0 required, not optional** — the engine has no evolution data today.

## 4. Architecture

### 4.1 One tab, two modes

Add a **mode switch** inside the existing Power-Up Optimizer tab:

- `mode: "single-raid"` — today's behavior, byte-for-byte unchanged. Existing share links must
  keep working; decode a link with no `mode` field as `"single-raid"`.
- `mode: "multi-raid"` — the new pool + boss-set path.

Rejected: a seventh tab. The two modes share ~80% of their settings (boss assumptions, dodge,
weather, cadence, timer, swap/revive, budgets), the user framed this as an expansion of the
existing tab, and a new tab would trigger the `new-tab` skill's eleven parallel touch points for
no gain.

`mode` is a new user-facing setting → it **must** round-trip. Follow the
`add-scenario-assumption` skill; `check-scenario-roundtrip` will fail otherwise.

### 4.2 CSV import (`packages/web/src/import/`)

Two pure modules, both fully unit-testable with no DOM and no I/O:

**`pokeGenieCsv.ts`** — `parsePokeGenieCsv(text: string): PokeGenieParseResult`

- Proper RFC-4180 quoted-field handling (the export contains quoted values with commas, e.g.
  `"2026-09-08 16:19"`).
- Header-name indexed, never positional — Poke Genie's column set varies by app version.
- Returns `{ rows, skipped: {lineNumber, reason}[], unknownColumns: string[] }`. Never throws on
  a bad row; never silently drops one.
- Validate it is actually a Poke Genie export (required headers present) and say so clearly if
  not, rather than producing 0 rows.

**`pokeGenieMatch.ts`** — `matchPokeGenieRows(rows, registry): RosterImportResult`

Matching ladder, in order (162/164 confirmed by the first three; the fourth closes the last 2):

1. Dex number (from `Pokemon` column) + exact species-name match, when `Form` is `Normal`/empty.
2. Dex number + `Mega` form → the `Mega ...` named species for that dex.
3. Dex number + regional form token (`Alola`/`Hisui`/`Galar`/`Male`) → fuzzy suffix match
   against that dex's candidates. **Do not assume a suffix convention** (§2.2).
4. Dex number with exactly one registered candidate → that candidate (fixes `Sawsbuck` →
   `sawsbuck-spring`, `Toxtricity` → `toxtricity-amped`).
5. Bare name lookup as a last resort.
6. Otherwise **unmatched** — reported by name/form/dex with the candidates that were considered,
   never dropped silently.

Dex number is currently recoverable only by parsing `imageUrl` (`.../pokemon/134.png`). That is
a hack; prefer adding a real `dexNumber` to `species.json` (§7, `data-sync`), and read
`imageUrl` only as a fallback until it lands.

Move matching is by normalized display name (`"Water Gun"` → `WATER_GUN_FAST`) — verified to
work on this export. Unmatched move name → fall back per §3.3 **and report it**, since an
unmatched move usually means the data layer is stale, not that the user's data is wrong.

### 4.3 Engine: one new module, `packages/engine/src/rosterPlanner.ts`

Pure, no I/O, caller supplies all data — the same contract `speciesReport.ts` follows. Reuses
`runTeamRaid`, `runSustainedComparison`, and `powerUp.ts`'s existing cost/ladder/useful-level
primitives (`powerUpCost`, `usefulPowerUpLevelsAbove`, `powerUpDamageLadder`,
`PowerUpResourceCost`, `PowerUpCostModifiers`, `teamDamageAtRaidSeconds`, `RARE_CANDY_*`). **No
new combat math.** If you find yourself writing damage or energy arithmetic here, stop — it
belongs in the engine modules that already own it, which this feature is not allowed to edit
(§3.5).

Inputs, sketched:

```ts
export interface RosterEntry {
  entryId: string;            // unique per POOL ENTRY (duplicates are real) — not a species id
  species: SpeciesDefinition;
  fastMoveId: string | null;
  chargedMoveId: string | null;
  level: number;
  ivs: IVSpread;
  costModifiers: PowerUpCostModifiers;   // shadow / purified / lucky
  canMega: boolean;
  ivsAreApproximate: boolean;            // §3.3 — carried through to every output row
  levelIsApproximate: boolean;
  movesetIsDefaulted: boolean;
}

export interface WeightedRaidTarget extends SpeciesReportBossTarget {
  weight?: number;            // defaults to 1; the per-boss aggregation weight
}

export interface RosterPlannerInputs {
  pool: RosterEntry[];
  targets: WeightedRaidTarget[];
  costTable: PowerUpCostTable;
  stardustOnHand: number;
  rareCandyOnHand?: number;
  rareCandyXlOnHand?: number;
  candyBySpeciesId: Record<string, { candy: number; xlCandy: number } | undefined>;  // §3.4
  // ...every shared combat assumption the single-raid path already threads
}
```

#### The algorithm, in four stages

**Stage 1 — cheap screen.** For each (pool entry, boss), one `runSustainedComparison` at low
iterations (3–5). Screen score:

```
score = sustained.meanTotalDamage / (sustained.meanSecondsSurvived + swapCostSeconds)
```

i.e. **damage per second of raid clock consumed**, which is the right proxy for a *sequential*
team-raid objective — plain `meanTotalDamage` would over-reward a bulky low-DPS Pokémon that
eats the timer. Memoize by `(entryId, level, boss)`; a candidate's screen is recomputed only for
its *changed* level.

**Stage 2 — team selection per boss.** `T(b)` = top 6 by screen score against `b`, subject to at
most one `canMega` entry (`runTeamRaid` enforces this anyway — respect it in selection so the
call never throws). Duplicate species are allowed: real raids permit them.

**Stage 3 — candidate generation.** For each pool entry `m`:

- **Skip `m` entirely if it is not fully evolved** (§3.6), emitting a `neverCompetitive` row with
  reason `"evolve first"` naming the evolution. Needs Phase 0's `isFullyEvolved`.
- Levels come from the existing `usefulPowerUpLevelsAbove` (already excludes levels with no
  detectable stat/damage/survival change), bounded by `maxLevel` and by stardust affordability.
- **Relevance filter — this is the part-3 answer.** Keep a level only if, at that level, `m`
  enters `T(b)` for at least one boss, *or* `m` is already in some `T(b)`. If powering `m` up
  never changes any team, its delta is **exactly 0 and no simulation is run** — a real answer
  ("this changes nothing you would actually field"), not a skipped one.
- Rank the surviving candidates by a cheap proxy (summed weighted screen-score improvement per
  1000 stardust) and cap at `maxCandidates`, default 60.

**Read `PowerUpBudgetInputs.candidateLevelsPerSlotPerRound`'s REGRESSION HISTORY comment in
`powerUp.ts` before tuning any cap here.** The identical bug is available in this design: if
each individual half-level step sits below the noise floor, a real multi-level gain is only ever
found by offering the multi-level jump *itself* as a single candidate. Offer jumps, not chains.

**Stage 4 — paired evaluation.** Per boss: simulate the baseline team once (`iterations` paired
seeds, common random numbers), then each candidate's team. Key optimizations, both required to
hit the budget in the "Compute budget" subsection of §5:

- **Memoize on team composition**, not on candidate — most candidates leave most bosses' teams
  identical, and an identical team over an identical seed set is an identical result.
- **Skip bosses a candidate doesn't touch**, contributing a true 0.

Aggregate to a weighted mean `deltaTeamDps` across bosses, and **keep the full per-boss
breakdown on every row** (§1).

Reuse `powerUp.ts`'s existing noise-floor derivation verbatim
(`2 × stdDev × sqrt(2/iterations)`, deliberately treating runs as unpaired). Do not invent a
second one.

> **Combine per-boss floors in QUADRATURE — never pool raw teamDps across bosses.** Phase 2
> shipped this wrong once and it made the whole feature inert, so Phase 4's `planRosterBudget`
> must not repeat it. Compute `floorᵦ = noiseFloorFor(baselinePerBossᵦ.summary, iterations)` per
> boss, then `sqrt(Σ (wᵦ·floorᵦ)²)` with normalized weights.
>
> The trap: pooling every boss's `teamDpsPerSeed` into one sample and taking its stdDev measures
> **between-boss spread**, not seed noise. Measured on the real roster, baseline team DPS ranges
> **8.26 (Regirock) to 92.31 (Shadow Grubbin)** — a 1-star shadow and a legendary are simply
> different fights, and that difference **cancels exactly** in a paired per-boss delta. The
> pooled floor came out at 4.14 (25 iterations) against a best candidate delta of 0.10, so
> **0 of 60 candidates were ever significant** at any iteration count. The quadrature floor on
> the same data is **0.2549**, and 6 of 60 candidates clear it.

**Significance must also be per-boss, not only aggregate.** `meanDeltaTeamDps` averages over
targets a candidate never touches, so a real gain gets buried: a benched Kyurem entering the team
against Shadow Giratina is **+1.294 on that boss** but **0.109 averaged over 13**. Carry
`bestBossDeltaTeamDps`, `bestBossId` and `significantBossCount` (bosses clearing *their own*
floor) alongside the mean, and make `exceedsNoise` true when the candidate clears the aggregate
floor **OR** is significant on at least one boss. Using the diluted mean as the sole test
manufactures false negatives and works directly against the ranking-flip thesis.

**Cap candidates per entry before the global cap.** Without it the global cap is consumed by
adjacent half-level rows of a few entries — the first real run returned only **8 distinct
species** across 60 rows while 90 entries were eligible. `maxLevelsPerEntry` (default 3) fixed
it: 19-21 distinct species across the same 60 rows.

#### Outputs

```ts
export interface RosterPowerUpCandidate {
  entryId; speciesId; speciesName;
  fromLevel; toLevel;
  cost: PowerUpResourceCost;
  costUnverified: boolean;          // §3.4 — candy on hand unknown for this species
  meanDeltaTeamDps: number;         // weighted across targets
  perBoss: {
    bossId; bossName;
    deltaTeamDps: number;
    rankBefore: number | null;      // null = not fielded
    rankAfter: number | null;
  }[];
  bossesNewlyFielded: string[];     // the explicit part-3 surface
  deltaPer1000Stardust: number | null;
  deltaPerCandy: number | null;     // NEVER blended with stardust — standing decision
  deltaPerXlCandy: number | null;
  exceedsNoise: boolean;
}

export interface RosterPlanResult {
  baselinePerBoss: { bossId; bossName; team: string[]; summary: PowerUpEncounterSummary }[];
  noiseFloorTeamDps: number;
  iterations: number;
  candidates: RosterPowerUpCandidate[];
  /** Pool entries in NO baseline team, with the cheapest power-up that would field them and what it is worth. */
  benchedButPromising: RosterPowerUpCandidate[];
  /** Pool entries that can never be fielded at any affordable level — reported, not hidden. */
  neverCompetitive: { entryId; speciesName; reason: string }[];
}
```

`benchedButPromising` and `neverCompetitive` are not extras — together they *are* the answer to
part 3, and the second one is what stops the tab from silently ignoring 150 of 164 Pokémon.

**Fixed-budget planner.** Generalize `planPowerUpBudget`'s greedy round loop over the pool and
boss set as `planRosterBudget`, in the same new module. Preserve its two hard-won properties:
the **per-round** (not fixed) noise floor, and `bestBlockedCandidate`'s "blocked, not done"
distinction. Keep the two questions separate exactly as `CLAUDE.md` requires — the ranked table
prices each candidate as if it were the only purchase; the plan is the joint allocation. Do not
merge them.

### 4.4 Web: run layer + worker

- `packages/web/src/run/runRosterPlanner.ts` — the pure `run<Tab>Scenario`-shaped function, same
  convention as the other six. `scripts/run-scenario.ts` calls it too, so CLI == UI by
  construction.
- `packages/web/src/rosterPlanner.worker.ts` — a Web Worker calling that same pure function.
  **Required, not optional:** ~2–4 s of synchronous work would freeze the tab, and the existing
  400 ms debounce does not help with a long single computation. Post progress (`stage`,
  `bossesDone/total`) so the UI shows real progress rather than a spinner. Keep the worker a
  thin shell — all logic stays in the pure function so it remains testable and CLI-runnable.
- `packages/web/src/rosterPool.ts` — pool types, `localStorage` persistence, schema version
  field, and quota-failure handling (a 164-row pool is ~12 KB; wrap every read/write in
  try/catch and degrade to in-memory).

New components: `RosterImportPanel.tsx` (file picker + paste, match report, roster table with
approximate badges and inline per-species candy), `BossSetPanel.tsx` (active/past selection,
tier filters, count cap), and results sections inside `PowerUpOptimizerView.tsx`.

---

## 5. Phases

Each phase ends green on `npm run verify`, and is independently shippable. Do not start a phase
before the previous one is committed.

### Phase 0 — data prerequisites (REQUIRED)

Delegate to **`data-sync`**. Add three fields to `species.json` from GAME_MASTER, all currently
absent:

| Field | Needed by | Without it |
| :--- | :--- | :--- |
| `evolvesToIds` / `isFullyEvolved` | §3.6 evolution filter | **Blocks Phase 2.** Cannot tell an unevolved Pokémon from a fully-evolved one, so the optimizer gives actively wrong advice on 69 of 164 rows (measured, §2.2) |
| `dexNumber` | §4.2 matcher | Falls back to parsing `imageUrl` (`.../pokemon/134.png`) — a hack that works today but is silently coupled to a sprite URL format |
| `candyFamilyId` | §3.4 candy pooling | Candy pools per species instead of per family; a documented v1 gap |

Only the first is genuinely blocking; do all three in one pass since they come from the same
source and cost one sentinel update between them.

**This will break `scripts/sync-data/test/`'s golden sentinels — update them deliberately**, per
those tests' own instructions, and run `npm run diff-normalized` to confirm nothing else moved.

The **Elite Raid question is resolved** — no work needed, see §6.1. Still add the **Max Battle
exclusion filter** unconditionally at the boss-selection layer.

### Phase 1 — CSV import, standalone

Owner: **`web-developer`**. `pokeGenieCsv.ts` + `pokeGenieMatch.ts` + `rosterPool.ts` +
`RosterImportPanel.tsx`, with unit tests against the real export checked in as a fixture.

**Acceptance:** import the user's 164-row export; 164 rows accounted for (matched + explicitly
reported unmatched, zero silently dropped); ≥162 matched; approximate badges on the 70 blank-IV
and 4 uncertain-level rows; roster survives a page reload; export-to-file round-trips.

### Phase 2 — engine planner

Owner: **`engine-developer`** (writes its own tests in the same pass). `rosterPlanner.ts`,
stages 1–4, plus the `runTeamRaid` signature-pinning test from §3.5.

**Acceptance:** a pinned test where a benched Pokémon provably enters the team after a power-up
and its `bossesNewlyFielded` is non-empty; a pinned test where a candidate that changes no team
returns exactly 0 without simulating; a pinned multi-level-jump test mirroring `powerUp.ts`'s
own regression case; per-boss deltas sum to the weighted mean.

### Phase 3 — multi-raid sweep in the UI

Owner: **`web-developer`**. Mode switch, boss-set panel, worker, results table with the per-boss
breakdown, scenario round-trip for every new setting (use the **`add-scenario-assumption`**
skill — do not skip it), and the §3.2 share-link warning + empty state.

**Acceptance:** `npm run check-scenario-roundtrip` passes; a share link opened in a clean browser
profile reproduces the settings, states plainly that the roster is missing, and offers import;
the sweep runs off the main thread with visible progress.

### Phase 4 — fixed-budget plan across the pool

Owner: **`engine-developer`** then **`web-developer`**. `planRosterBudget` + its UI, with
`costUnverified` candidates excluded and *shown* as excluded with the reason.

### Phase 5 — docs and ship

- **`MECHANICS.md`** — every finding in §6, via the **`record-mechanic`** skill, each with
  source, date, and engine status. At minimum: Elite Raid tier stats, Max Battles as a separate
  system, evolution preserving level/IVs, second-move unlock costs *including the Purified ×0.8
  vs ×0.9 trap*, Mega Level / Super Max, Shadow enrage at 60% HP, and the Feb-2026 confirmation
  that `1.3` and the "other trainers only" scoping are unchanged.
- **`CLAUDE.md`** — the §3.2 `localStorage` exception, the new mode, the per-species candy pool,
  and the boss-set resolution rule. Keep it to the *rules*; the narrative belongs in `HANDOFF.md`.
- **`IDEAS.md`** — the best-moveset toggle (§3.3), evolution/second-move/Elite-TM as competing
  sinks (§6), candy families (§3.4).
- **`check-docs-drift`** will need the new command/skill/agent mentions to agree.
- Run **`verify-and-ship`**, then **`skeptic`** over the live tab, then **`code-simplifier`**
  over the batch.

### Compute budget (derived from §2.1)

| Stage | Work | Cost |
| :--- | :--- | :--- |
| Screen | 164 × 30 × 0.46 ms | ~2.3 s (memoized; recomputed only for changed levels) |
| Baseline | 30 bosses × 5 seeds × 0.25 ms | ~40 ms |
| Candidates | 60 × 30 × 5 × 0.25 ms, minus skipped bosses and memoized teams | ~1.5 s worst case, much less in practice |

Target **< 4 s** end to end in the worker for a 164-mon pool over 30 bosses. If it exceeds that,
lower `iterations` before lowering `maxCandidates` — the per-boss averaging already provides
variance reduction (§4.3), whereas cutting candidates silently hides answers.

---

## 6. Real-game mechanics research (`pogo-researcher`, 2026-09-08)

Findings are summarized here rather than in a separate report file. Every one of these goes into
`MECHANICS.md` via the **`record-mechanic`** skill in Phase 5, with its source and date; anything
marked *not modelled* must appear as a **visible UI caveat**, not be left implicit.

Sourcing note: most of these are **community-consensus**, not first-party Niantic statements.
Two are first-party (`pokemongo.com`). Treat the numbers accordingly and cite honestly — this
repo's discipline is a source per fact.

### 6.1 Correctness fixes this expansion makes mandatory

**Elite Raids — RESOLVED 2026-09-09, no action needed. An earlier draft of this section was
wrong; the correction is kept here so it isn't re-derived.**

It is true that `packages/engine/src/types.ts:45` declares seven `RaidTier` values and none is
Elite. The earlier claim built on that — that an Elite Raid boss "entering the pool is silently
simulated at 15,000 HP / 0.79" — **does not hold**, because no Elite Raid boss can enter the pool
at all. Verified directly: `scripts/sync-data/pokebattlerRaids.ts:170` puts
`RAID_LEVEL_ELITE_LEGACY` in `POKEBATTLER_LEGACY_EXCLUDED_TIERS`, alongside
`RAID_LEVEL_ULTRA_BEAST_LEGACY` and the 2/4/6/4.5-star legacy tiers, under this project's
existing "never fabricate a tier" rule. Zero rows mentioning Elite exist in either
`activeRaids.json` (19 rows) or `raidHistory.json` (764).

So the sweep is already correct on this point, by an intentional prior policy rather than by
luck. Two things follow, and both matter:

- **Report it as "excluded by policy today," never as "Elite Raids can't happen."** The silence
  in the data is a deliberate exclusion, not proof the content doesn't exist — Elite Raids are
  live content, and Pokebattler's feed really does carry 4 of them each run.
- **The `~1.00` multiplier this section previously carried is debunked, not merely unconfirmed.**
  Re-checking found the sources behind it either state no number at all or garble the tier
  progression. Bulbapedia's raw wikitext puts Elite Raids in a `rowspan="8" | 0.79` cell shared
  with Mega / 5-Star / Primal / Legendary Mega / Super Mega — the same 0.79 plateau five of the
  six existing `RAID_TIER_TABLE` rows already sit on. Do not carry 1.00 forward as an
  alternative.

If a future session ever does close the `RaidTier` gap (the sync script's own comments already
anticipate it), the numbers are **HP 20,000** — two independent sources, Bulbapedia's raid page
plus this repo's own pre-existing `sync-data.ts` citation — and **multiplier 0.79**, which rests
on one strong internally-consistent source rather than two. That is out of scope here.

**Max Battles (Dynamax/Gigantamax) must be excluded, never approximated.** Real, live content
since Oct 2024 [first-party: `pokemongo.com/max-pokemon-battle`], but a *structurally different
battle system*: Power Spots rather than Gyms, a Max Particles entry cost, Max Moves, and no
tier-shaped HP/multiplier table at all. Add an explicit exclusion filter at the boss-selection
layer. A Max Battle boss must never reach this engine's standard raid sim.

### 6.2 Evolution — this changes the candidate set (see §3.6)

Evolution costs **candy only, no stardust** (~12 to ~400, typically ~50), and **never changes
level or IVs** — base stats swap at the same level/IVs. No case was found where powering up
*before* evolving is correct: the power-up cost table is species-agnostic and level/IV progress
carries through exactly, while the evolved form's higher base stats mean the same step buys
strictly more team DPS afterward.

The user's export is full of unevolved Pokémon (12× Houndour, 11× Inkay, 4× Totodile, plus
Beldum, Machop, Charmander, Squirtle, Caterpie…). Ranking their power-ups as-is is not a
refinement gap — it is **advice that is actively wrong**, and only at pool scale does it become
unavoidable. Hence §3.6.

### 6.3 Competing sinks for the same stardust and candy — caveat, don't model

**Second charged move unlock** draws on the *same* stardust+candy pool this planner allocates,
and is currently invisible to it. Tiered by buddy-walk distance: 1 km → 10,000 dust/25 candy,
3 km → 50,000/50, 5 km → 75,000/75, 20 km → 100,000/100; starters/babies flat 10,000/25. It is
often a better team-DPS-per-stardust purchase than several power-up half-levels.

> **Trap:** Purified is **×0.8** for a second-move unlock, *not* the **×0.9** this project's
> power-up cost table correctly uses. Do not reuse `PowerUpCostModifiers` for second-move costs
> if this is ever built. Shadow is ×1.2 for both.

Sixteen species (Caterpie, Metapod, Weedle, Kakuna, Magikarp, Ditto, Wynaut, Wobbuffet, Smeargle,
Wurmple, Silcoon, Cascoon, Taillow, Feebas, Beldum, Kricketot) cannot learn a second charged move
at all unless Shadow/Purified.

**Elite TM does NOT compete for this pool** — earned via GO Battle League milestones, Community
Day boxes, or Special Research, never bought with stardust or candy. Regular TMs are free once
owned. So the "what should my stardust buy" framing is not distorted by TMs.

**Mega Energy** is entirely unmodelled (`isMega` is a bare boolean with zero cost and zero
cooldown). Mega Levels (Base → High → Max, since 2022-04-28) reduce **energy cost and rest
period only — they do not change the mega's combat stats**. **Super Max** (2026-02-28, Kalos
Tour) is first-party-documented as granting "greatly enhanced CP" with no stated mechanism;
a circulating "+2 effective levels" figure has **no primary citation — treat as unverified** and
do not implement it.

> Directly relevant to two standing decisions: the Feb 2026 mega update **confirms unchanged**
> both the `1.3` boost value and the "boosts other trainers only, never the boosting trainer's
> own party" rule. Cite this so a future session doesn't read the update as grounds to revisit
> either.

**Best Buddy** (+1 effective level, one Pokémon account-wide) is **already recorded** in
`MECHANICS.md` and is `IDEAS.md`'s Power-Up Optimizer item 5. Nothing new to add — except that
at 164-Pokémon scale this free lever is higher-leverage than at 6-slot scale, so surface it as a
UI caveat when this ships.

### 6.4 Boss-model gaps to caveat

**Shadow raid bosses enrage at 60% HP** (attack *and* defense both rise substantially) — distinct
from, and in addition to, the "defense collapses at 15% HP, suspected real-game bug" already in
`MECHANICS.md`. `comparison.ts`'s `isShadow` applies one flat multiplier for the whole fight, so
a mid-fight state change is **structurally unrepresentable** by this engine's constant-stat boss
model. Caveat it; do not attempt a partial fix inside this feature.

**Rotation cadence is not a calendar window.** 5-star/Shadow rotate ~Tuesdays 10pm local, Mega
~Wednesdays 6am local, legendaries typically last 1–2 weeks. So even with real dates, "the 30
most recent" would need defining by *rotation event*, not by days — further support for §3.1's
decision to encode a resolved boss id list.

**Weather: the single global toggle is the only honest choice.** Real weather is a function of
the trainer's location and the moment (a remote raid uses the *gym's* weather, locked at entry),
not of the boss species or a calendar. There is no principled per-boss "expected weather", and
inventing one would fabricate data. Keep `Scenario.weather` exactly as-is and applied uniformly
across the sweep — but say in the UI that one shared assumption is now doing much more work.

### 6.5 A genuinely new question, deferred

At 6 slots, wipe-and-continue necessarily reuses the same six. With a 164-Pokémon pool, a real
trainer who wipes returns to the lobby, heals, and **selects a different six** — and there is no
documented cap on repeating that within the timer. `runTeamRaid` models the wipe/revive cost but
always re-fields the same roster.

**Defer this** (record in `IDEAS.md`), and note explicitly why it is safe to consider later:
it is **not** the ruled-out Teambuilding Analyzer, which is *multi-trainer* mega staggering
across a lobby. This is one trainer sequentially re-selecting from their own roster — the same
single-trainer framing the Team Raid Simulator already uses and that `CLAUDE.md` calls
explicitly in scope. A skim will conflate the two; this paragraph exists so it doesn't.

---

## 7. Explicitly out of scope

- **Second-move unlocks, Mega Energy, Best Buddy** as *modelled* purchases. Surface them as
  caveats (§6.3); do not build a general "investment optimizer" here. Elite TM genuinely doesn't
  compete for this budget (§6.3), so it needs no caveat at all.
- **Evolution as a priced candidate** ("evolve, then power up to L"). v1 only *excludes and
  explains* (§3.6); pricing it needs per-species evolution candy costs.
- **Second charged move** in simulation — the engine models one. 2 rows in the export have one.
- **Shadow boss enrage at 60% HP** (§6.4) — structurally unrepresentable by a constant-stat boss
  model. Caveat only; do not attempt a partial fix inside this feature.
- **Re-selecting a different six after a wipe** (§6.5) — real, newly relevant at pool scale,
  deferred to `IDEAS.md`. Not the ruled-out Teambuilding Analyzer; read §6.5 before dismissing it.
- ~~**Candy families**~~ — no longer out of scope: Phase 0 landed `candyFamilyId`, so pool per
  family (§3.4).
- **Two known `isFullyEvolved` inaccuracies from Phase 0**, both erring toward *not* excluding
  (the safe direction), both to be surfaced rather than fixed here:
  - **Zygarde (Complete)** is marked `false` because Zygarde's 10%/50% forms carry evolution
    branches under the same enum and `isFullyEvolved` unions across the enum. It is actually
    final, so it gets wrongly excluded from candidates.
  - **Farfetch'd, Mr. Mime, Qwilfish, Corsola, Linoone** are marked `false` (a Galarian/Hisuian
    sibling template carries the branch) but resolve to an empty `evolvesToIds`, so the UI must
    not promise "evolve into X" when it has no X to name.
- **A "Teambuilding Analyzer"** (multi-trainer mega staggering). `CLAUDE.md` rules this out and
  it is *adjacent* to this feature's team-selection code. Do not drift into it: this tab models
  **one trainer's own sequential roster**, and the mega boost still never reaches the boosting
  trainer's own party.
- **Server-side roster persistence** — `PLAN_login_and_roster_persistence.md` owns it.
- **Editing `simulate.ts` / `teamRaid.ts`** — another session owns them (§3.5).

---

## 8. Risks

| Risk | Mitigation |
| :--- | :--- |
| Merge conflict with the parallel engine session | New files only; `index.ts` append is the sole shared line; signature-pinning test (§3.5) |
| Screen metric mis-ranks, so the "best" team is wrong and every delta is measured against a bad baseline | Pin a test comparing screen-selected teams against exhaustively-simulated best-6 on a small pool; report the screen's disagreement rate |
| Compute blows past budget on a bigger pool | Worker + progress + the tuning order in the "Compute budget" subsection of §5; cap pool size with an explicit message, never a silent truncation |
| `localStorage` roster lost (cleared, private window, quota) | try/catch everywhere, schema version, file export as the durable path, explicit empty state |
| The multi-level-jump regression from `powerUp.ts` reproduced here | §4.3 calls it out; Phase 2 acceptance includes a mirrored test |
| Boss set drifts between sharer and recipient | Encode resolved boss ids, never the phrase "active raids" (§3.1) |
| ~~Elite Raid boss swept at 5-Star stats~~ | **Resolved 2026-09-09, risk does not exist**: `RAID_LEVEL_ELITE_LEGACY` is already excluded by `POKEBATTLER_LEGACY_EXCLUDED_TIERS`, so no Elite boss reaches the pool (§6.1) |
| A Max Battle boss reaches the standard raid sim | Unconditional exclusion filter at boss selection (§6.1) |
| Unevolved Pokémon recommended for power-ups — actively wrong advice on 69 of 164 rows (measured, §2.2) | §3.6 filter, blocked on Phase 0's `isFullyEvolved` |
