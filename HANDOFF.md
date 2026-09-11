# Handoff

Last updated: 2026-09-11 (repo and docs cleanup — no product behaviour changed). Read `CLAUDE.md`
first for durable project architecture/conventions — this file is the point-in-time "what's done,
what's next."

## 2026-09-11 (latest): repo and docs cleanup — no product behaviour changed

Housekeeping pass, no feature work. Every number the app shows is unchanged.

**HANDOFF.md cut from 1,747 lines to ~430.** Every section older than 2026-09-10, the
mid-file "THE IMPORTANT PART FOR A FRESH SESSION" and "Next" sections, and the bottom "Not yet
done" list were removed — all were stale: the "engine inputs not reachable from the UI" list
(friendship, Best Buddy, `bossMaxHpOverride`) was fully wired 2026-09-10, every IDEAS item in its
lanes table has since shipped, and the bottom list still pointed at the deleted login plan and
called `findCrossoverPartySize` unwired (it drives the party-size flip since IDEAS #19). Full
history: `git show 00b5a23:HANDOFF.md`. The still-true gotchas moved to "Durable gotchas" at the
bottom of this file.

**CLAUDE.md trimmed.** Incident narrative cut wherever the rule stood on its own (the
meta-architect's test: does the sentence still do work without "an earlier version…"). The note
that `showDetailedAssumptions` / `multiRaidSignificanceMode` "may be simplified" was removed —
both already decode to a plain default. Three references to the deleted `PLAN_roster_tab.md` were
removed as well.

**Code — dead exports and one lint warning.** Every `npm run unused-exports` hit that was a
*value* used only inside its own file lost its `export` (the five per-tab `encode*`/`decode*`
codec functions, `emptyHypotheticalCatch`, `rosterBlockedCandidateSentence`, `canHaveMegaLevel`,
`summarizeRoster`/`sortRosterEntries`, `buildStepwiseParamsForCandidate`, `recordFetchMeta`,
`BULBAPEDIA_SHADOW_RAID_ARCHIVE_PAGE`). Five symbols with zero references anywhere were deleted
outright: `plusMoveOptionTag`, `plusMoveScalingCaveat`, `DEFAULT_BOSS_CHARGED_MOVE_CADENCE`,
`DEFAULT_MEGA_LEVEL`, and `fetchCache.ts`'s `readJson`. The 37 remaining hits are all exported
*types* (JSX prop types, result types on exported functions) — prior `code-simplifier` passes
recorded those as not worth chasing, and that still holds. The one lint warning
(`SpeciesPicker.tsx`, setState inside an effect) was fixed with React's render-time
"adjust state when a prop changes" pattern; the pick-then-type select-all fix from the previous
session is untouched. Two stale comments corrected: `sensitivity.ts` still said
`findCrossoverPartySize` had zero call sites, and engine `scenario.ts` still described the retired
"absent decodes `true`" rule for `showDetailedAssumptions`.

**Left alone, deliberately.** `AUDIT_2026-09-08.md` stays at the root — its CLOSED banner explains
that six code comments cite its defect numbers. `MECHANICS.md` (1,876 lines) is an archive by
design. `.claude/agent-memory/` belongs to the agents; only one factually wrong line
(`code-simplifier`'s "`findCrossoverPartySize` unwired") was corrected.

**Not done / next.** Unchanged from the previous section: `IDEAS.md` #5 (Best Buddy roster mode —
measure before scheduling; single-raid gains were all inside the noise floor) and #24 (Frustration
notice — needs a user call between the three options listed there). No `PLAN_*.md` pending.

**Uncommitted as of writing.** This whole cleanup (16 code/comment files, `CLAUDE.md`, this file, one
corrected line in `.claude/agent-memory/code-simplifier/MEMORY.md`) is in the working tree, not
committed and not pushed. `npm run verify` and `npm run test:e2e` both passed locally on it.


## 2026-09-11 (later): the full moveset sweep, and an audit that found three real bugs

Shipped in `6d850e1`, deployed green (`deploy.yml` run #63, `success` in 2m41s). Working tree
clean, nothing uncommitted. Session was an audit (`pogo-researcher` + `pogo-player`) that turned
into fixes, plus one user-requested feature.

**The sweep now covers every fast × charged combination, not charged alone.** A real raid instance
rolls BOTH moves, and the boss's fast move drives incoming chip damage AND its energy gain (so its
charged-move cadence) — pinning it at `fastMoves[0]` hid a live axis. Reproduced directly before
building: Mega Tyranitar, charged move held at Fire Blast, varying only the fast move moves
Machamp's damage 207 → 283. The old sweep reported Bite's 235 as *the* answer for that charged move.
`compareAcrossBossChargedMoves` → `compareAcrossBossMovesets`, fast-major/charged-minor as a
documented stable contract; `bossFastMoveId` is now ignored by the sweep exactly as
`bossChargedMoveId` already was, and still governs the main non-sweep result.

Three things about this that are worth carrying forward:

1. **There were TWO sweeps, and the second didn't call the engine.** `runTeamRaid.ts` had its own
   hand-rolled loop, and its `buildTeamRaidInputs` took no fast-move parameter at all — so widening
   the loop alone would have compiled clean, passed, and simulated the identical fast move on all
   16 rows. A widened loop over an input the simulation never receives is a silent no-op.
2. **The gate was `chargedMoves.length >= 2`**, so a boss with 2 fast × 1 charged got no sweep at
   all despite having two genuinely different rollable movesets. Now the product.
3. **Perf was measured before building, and no cap was added.** Worst real boss is `starmie-mega`
   (4×9, highest combo count across all 771 rows of `raidHistory.json`) at 157ms/36 variants vs
   64ms/9. Team Raid runs one deterministic sim per variant. Don't add a guard on speculation.

**Three bugs the audit found, all fixed.**

- **Roster `canMega` was only ever forced OFF, never derived.** Picking "Mega Mewtwo X" produced a
  mega that silently never mega evolved — in the Lineup Builder and the Optimizer's multi-raid mode
  both. Now defaults from `species.boost`. **Deliberately NOT harmonised** with `TeamAssumptions` /
  `PowerUpOptimizerAssumptions`'s `isMega`: that field is *exclusive selection* (setting it clears
  every other slot), `canMega` is *eligibility*. Defaulting `isMega` on would fight its invariant.
  A comment at the derivation says so; don't merge them.
- **`SpeciesPicker` appended instead of selecting-all on re-pick.** The audit reported this as a
  Roster-tab regression of a fix older tabs already had. That was wrong — `web-developer`
  reproduced it on the Comparator first and found it in the shared component: picking keeps the
  input focused by design, so `onFocus`'s select-all never re-fires. Fixed once, for every tab.
- **`planRosterBudget` claimed "every fielded slot has already reached level 50" on an all-level-20
  roster.** `[].every()` is vacuously true, and an empty `eligiblePool` (every entry excluded for
  unknown candy) reached it. New `"no-eligible-entries"` stop reason, guarded *before* the vacuous
  check. `powerUp.ts`'s structurally identical check was confirmed not exposed — `validateRoster`
  throws first — and the asymmetry is documented on the new variant.

**Audit findings that did NOT survive checking.** Both agents were reproduced before their claims
drove any change, and two claims failed:

- `pogo-player` said the Roster tab was *inconsistent* with the other panels, which auto-select the
  mega flag. Source says all three leave it as-is. The fix went in on the eligibility argument
  alone, not the inconsistency one.
- The select-all bug's "already fixed elsewhere" framing was false (above), which is why the fix
  landed in `SpeciesPicker` rather than in one tab.

**`pogo-researcher`: the load-bearing check holds.** Mega/primal `1.3`/`1.1` verified unchanged
against fresh sources, matching `uptime.ts`. No content gaps — 59 Mega + 2 Primal matches the
independently-sourced released count; all 12 `RELEASED_MEGA_PRIMAL_ALLOWLIST` entries still
justified; Mega Staraptor correctly still excluded (debut 2026-09-19, future). No new feature
proposals, deliberately — it read `IDEAS.md`/`REJECTED_IDEAS.md` first and found the recent
ideation cycle had already shipped the candidates.

**MECHANICS.md corrected.** The shadow-synthesis entry cited Shadow Alolan **Sandslash** as the
grunt-only never-raided example; it became a live 3-Star Shadow Raid boss two days later, which
`raidHistory.json` had already caught on its own (`live-feed`, `firstSeenAt 2026-09-09T23:05Z`).
Corrected to Shadow Alolan **Sandshrew** — first-party anchored, zero raid rows, so it cannot
expire the same way. `CLAUDE.md` had it right all along. This is the pipeline working, not failing:
the species was synthesized off the GAME_MASTER `shadow` anchor before it ever raided.

**Not done / next.** No `PLAN_*.md` pending. `IDEAS.md` has exactly **two** Open items:

1. **#5 Best Buddy — roster/multi-raid mode.** Single-raid shipped 2026-09-11; roster mode needs
   an `isBestBuddy` field on `RosterEntry` plus the aggregate-across-bosses pricing machinery, so
   it is not a copy of the single-raid path. ⚠️ **Measure before scheduling**: every single-raid
   Best Buddy candidate came back *inside* the noise floor (±0.73 team DPS; best gain +0.49). The
   roster build may buy very little.
2. **#24 Frustration notice — built, but unreachable with real data.** Engine and UI both ship and
   are tested, but zero of 1750 species carry `FRUSTRATION`/`RETURN` in `chargedMoves`, because the
   real game assigns Frustration dynamically rather than via a static movepool. **Needs a user call**
   between three options in `IDEAS.md`. Worth confirming first whether a real Poke Genie export of
   an unpurified Shadow says "Frustration" and so earns the "unrecognised" badge — if it does, this
   is an already-visible defect, not a hypothetical.

`IDEAS.md`'s "Unmodelled real mechanics" table holds five further items that are **blocked on
evidence, not scheduled** — each names what would unblock it; `LINKS.md` #2 and #4 are the live
ones. `REJECTED_IDEAS.md` owns everything declined on the merits.

✅ **Closed 2026-09-11 — the two "still open from the 2026-09-10 concurrent-session split" items
were already done.** Both `scripts/run-scenario.ts`'s `roster` case and `check-scenario-roundtrip`'s
Roster row exist and work; verified by running both (the checker reports 152 fields across 7 tabs,
and the CLI renders a roster link). CLAUDE.md still described both as missing and was corrected in
the same pass. Nearly cost two subagent spawns to rebuild existing work — check the claim before
routing from it.

## 2026-09-11 (earlier): move changes, gated evolutions, and two bugs that passing gates hid

Shipped in `983ca15` and `ddd47e9`, across four concurrent lanes split by file ownership.
`PLAN_tm_move_change_optimizer.md` is **deleted** — see "the one clause not shipped" below.

**Features.** Friendship level and Best Buddy on the Comparator (per-candidate) and Team Raid
(per-slot); a dodge-execution-error band across 50-100% accuracy; the own-charged-move-cast cost
surfaced on the Comparator (badged as the unsourced placeholder it is); `bossMaxHpOverride` wired
to a real recorded `eraHp`; post-wipe reselection; per-stage sweep progress; hypothetical catches;
gated evolutions end to end; and the roster-mode move-change sweep (second charged move + Elite
TM, fielded and benched).

**Two bugs that every gate reported green on.** Both are worth remembering as a pattern, not as
incidents:

1. **The Eternatus per-species cost override was read by nothing.** The raw records were
   extracted, normalized, committed, and pinned by a passing golden test a day earlier —
   `sync-data.ts` simply never passed the engine's new third argument. Now wired: level 30→50 goes
   from 182 to 6,320 candy. *Presence of a field in `data/normalized/` is not evidence anything
   reads it, and a sentinel over a raw field proves only that the field exists.* Guards added: a
   sentinel over the INTERPRETED table, and `diff-normalized` now reports unrecognized top-level
   keys — which immediately exposed that `luckyStardustMultiplier` had never been in its diffed
   list either.
2. **`rosterMoveChange.ts` could field two Mega Evolutions and throw.** Every fixture set
   `canMega: false`, so 12 passing tests never ran a mega through the benched-substitution path.
   The trigger is the ordinary shape of a real roster, since the planner fields your best mega and
   benches the rest. Fixed by displacing the FIELDED MEGA rather than the weakest slot — which
   changes what the row means, so `displacedFieldedMega` is now shown on screen.

**The one clause not shipped.** The plan asked for a static "only actionable during a Taken Over
event" label on Frustration. The engine instead excludes Frustration/Return from TM candidates
unconditionally — correct, and deliberately documented, since a live is-an-event-on check would
make a share link's answer depend on when it is opened. But nothing yet *tells* the user a
Frustration holder is stuck. Moved to `IDEAS.md` #24 rather than left in a plan file, because one
informational label is an idea, not a plan.

**Measured and deliberately NOT changed.** Optimizer iterations were already 20, not the 3
`IDEAS.md` claimed; 20→100 costs ~553ms→~2643ms to move a marginal candidate's stdev 0.107→0.026,
which the existing noise floor already absorbs. The stale line had already cost an agent its
budget — `IDEAS.md` was rewritten (244→140 lines) and now carries that warning at the top.

**Not done / next.** `IDEAS.md` Open: #5 Best Buddy as an optimizer *candidate* (needs its own
presentation — it costs nothing, so it ranks on neither axis, and it is one-at-a-time per account);
#15 shadow grunt forms (**needs a user scope call**); #17b enrage timings, read by no tab; #23 the
Team Raid own-cast cost, which needs an engine field first; #24 above.

## 2026-09-10: Roster tab — the seventh tab, hand-entry + gzip save code

`web-developer` built the roster-tab plan (self-contained implementation plan, root of the repo —
not yet deleted, see "Not yet done" below). Replaces the deleted Firebase/login plan: this app
still has no backend. The roster (hand-entry, the pre-existing Poke Genie CSV import — moved here
from the Power-Up Optimizer tab — editing, and a self-contained save code) now has its own tab
(`view=roster`, param `rt`) instead of living inside the Power-Up Optimizer.

- **New**: `RosterView.tsx` (the tab), `RosterEntryForm.tsx` (hand-entry/edit form, reuses
  `SpeciesPicker`/`MoveSelect`/`NumberField`), `rosterEntryDraft.ts` (draft <-> `RosterEntry`
  conversion — a hand-entered/edited entry's moveset/IVs/level are always marked fully KNOWN, never
  the "default moveset" badge a blank CSV column earns), `rosterSaveCode.ts` (versioned,
  gzip-compressed save code via the platform's `CompressionStream`, no dependency added — ~90%
  smaller than the raw roster JSON on a realistic 164-entry roster), `rosterScenario.ts` (the
  tab's own `RosterScenario`, carrying ONLY a display setting — table sort order — never the
  roster's contents, per the standing "no backend" decision), `run/runRoster.ts`.
- **Changed**: `rosterPool.ts` gained `mergeRosterPools` (additive load, re-keys an `entryId`
  collision rather than overwriting). `PowerUpOptimizerView.tsx`/`LineupBuilderPanel.tsx` updated
  to point at the Roster tab instead of hosting/describing the import panel themselves — both keep
  working unchanged, reading the same `rosterPool.ts` localStorage pool fresh on mount.
- **Real bug found and fixed during live verification**: `RosterImportPanel.tsx` used to render
  its own bottom roster table with a coarse, generic "default moveset" flag; kept alongside
  `RosterView.tsx`'s new, more precise per-slot badge (`rosterMovesetBadge.ts`), the SAME row could
  show two DISAGREEING badge texts depending on which table you looked at. Deleted the old table
  entirely — see `web-developer`'s own memory for the full story.
- **Verified live**: Playwright against the built `dist` (real Chromium) — hand-add a Pokémon
  (badge-free, reaches Power-Up Optimizer and Team Raid's Lineup Builder identically to an
  imported entry), editing an imported blank-moveset entry clears its badge, a save code
  round-trips exactly and a truncated code fails legibly, and a share link restores the display
  setting only, never the roster. `npm run test:web` (284 tests), full e2e suite (26 specs, up
  from 21), and `npm run verify`'s every step EXCEPT ONE (below) are green.
- **`scripts/` touch points finished in a follow-up session (2026-09-10, `data-sync`)**:
  `scripts/check-scenario-roundtrip.mjs` gained the Roster tab's `TABS` row — it contributes
  exactly one field (`sortBy`; the roster's contents deliberately never round-trip, per the
  standing localStorage-only decision), bringing the total from 137 to 138 fields across 7 tabs.
  `scripts/run-scenario.ts` gained a `"roster"` CLI case (`rt` param), which reports the restored
  `sortBy` setting and an honest zero-entries roster (the CLI structurally cannot see
  localStorage), same shape as the Power-Up Optimizer's multi-raid "no roster" branch. Covered by
  a new `scripts/run-scenario-roster.test.ts`. `npm run check-docs-drift` and `npm run verify` are
  both fully green; `PLAN_roster_tab.md` is deleted — the Roster tab is shipped in full.

## 2026-09-10: feedback batch, `pogo-player` agent, two audit rounds — SHIPPED

Driven by three message logs from the project's real second user, then by two rounds of a new
`pogo-player` audit agent. Everything below is verified: `npm run verify` green, `test:e2e` 14/14.

### Data corrections

- **All 15 Super Max "+" moves** (was 8). The user supplied the complete pokemongohub table; the 7
  that had been deliberately excluded for want of a raid-context power figure are now in. Two
  assumptions got *stronger*, not weaker: **15/15 durations** match the base move exactly, and all
  15 cost **100 energy** while their base moves span 33/50/100 — which rules out the "uniform 100
  is a template default" worry that had blocked them.
- **Six signature moves recovered.** Behemoth Blade/Bash, Moongeist Beam, Sunsteel Strike, Freeze
  Shock, Ice Burn were absent because the sync discarded `pokemonSettings.formChange`, where the
  grant actually lives. Now read generically. **Kyurem Black/White were the real cost** — Kyurem is
  a live optimizer recommendation on the user's own roster and was being simulated without its
  signature move.
- **21 form names** lost stray underscores (`Zacian (Crowned_sword)`). Species **ids unchanged**,
  proven mechanically via `diff-normalized --json`.

### Engine

- **Super Max is now gated** to the 15 megas with a "+" move. Before, any mega could take the +2
  effective-level CP bump — three existing tests were passing *because of* that bug.
- **Mega Level is per-INDIVIDUAL, not per-species.** MECHANICS.md said the opposite, citing a
  Bulbapedia paraphrase; the user corrected it from their own account. Two slots holding the same
  species may legitimately differ — that is correct behaviour to preserve, not an inconsistency.
- **Dodge lockout diagnosed as correct arithmetic**, not a bug: `DODGE_COST_SECONDS` is 0.5, so a
  boss fast move at ≤0.5s (Bite is exactly 500ms) pushes the attacker's next attack at least as fast
  as time passes — zero damage, forever. Detection added (`fastMoveCadenceTooFastToDodge`,
  `dodgeFastAttacksLockout` on four result types); the numbers were deliberately left alone.

### UI

- All six **Assumptions panels collapsed by default**; caveat prose moved into per-topic
  sub-disclosures (Comparator's opened caveats: **2286px → 222px**).
- **Move pickers** show type-effectiveness chips instead of damage/energy when collapsed; one chip
  per candidate/slot, never averaged.
- **Comparator** advanced-options gate + dodge-override checkbox.
- **Guessed-moveset badges** on every row that recommends a spend — this was a live trust bug
  (191k stardust recommended on a fully-guessed Rayquaza, unflagged).
- **Default roster now clears** (was an unwinnable Dragon/Flying/Psychic team into Dark/Fire), and a
  *failed* raid now reports HP % reached / DPS shortfall / time left instead of six `n/a`s.
- **Budget plan reports clear rate**, and says "0% — still doesn't clear" when a plan buys DPS but
  not a win.
- **Level cap lifted to 50** on the three tabs still stuck at 40, using the engine's own constant.
- **`NumberField`** — one component behind all 50 numeric inputs: select-all on focus (candy `100`
  + typing `50` silently became `10050`), blur clamp where a real ceiling exists, and a
  non-blocking warning where none does.

### Tooling

`npm run typecheck` **never checked a single engine test** — `tsconfig.json` sets `rootDir: "src"`,
and vitest strips types without checking them. A stale mock slipped through both gates. New
`packages/engine/tsconfig.test.json`, wired in as `typecheck:engine-test`.

### New agent

**`pogo-player`** (`.claude/agents/`) — a user-proxy that drives the live app and judges whether a
right number is *useful*, as one of four archetypes. No web access by design, so it can't drift into
being a second `pogo-researcher`; it routes unverified mechanics out instead of asserting them.
Its `casual-optimizer` archetype rejects four tabs on premise — per a standing decision added this
session, that is **never** a reason to change the product.

### Later the same day: export button, significance toggle, and a corrected measurement

- **Team Raid → Power-Up Optimizer export.** One button carries the six slots, boss, both boss
  moves and every shared assumption; the shared level/IV spread fans out per-slot. Resource fields
  Team Raid has no concept of (stardust, per-slot candy/XL, Rare Candy pools, Purified/Lucky) land
  on the destination's resting state, with a one-line note saying so. Needed **no** new Scenario
  field — it just builds a URL for the Power-Up Optimizer's existing shape.
- **Significance-mode toggle** on the multi-raid optimizer (`multiRaidSignificanceMode`, 115 fields
  now round-trip). Ranking was *already* mean-based; the only thing "best boss" still decided was
  the significance gate. Default is now `aggregate-only`; an absent field decodes to
  `aggregate-or-per-boss` so existing links are unchanged — same inverted-default split as
  `showDetailedAssumptions`. Live: 36 → 51 qualifying candidates when toggled, matching the
  hidden-count line exactly. The "Best boss Δ" column stays — the mode changes what *qualifies*,
  never what's *reported*.

> ⚠️ **A measurement in this file's earlier section was wrong, and the way it was wrong is worth
> keeping.** Two agents reported Mega Tyranitar "isn't clearable" (~25% short at L40, then
> "27.15 vs 30.00 DPS, ~9.5% short" at L50), and the default boss was set to plain Tyranitar on
> that basis. **It does not reproduce.** Both rosters clear it at 9,000 HP, at L35 *and* L50, under
> `perfect` / `none` / `50% missed` dodging:
>
> | Team | L35 | L50 |
> | :--- | :--- | :--- |
> | Mega Mewtwo X / Machamp / Terrakion / Lucario ×2 / empty | cleared 280.4s | cleared 256.1s |
> | Mega Lucario / Machamp / Terrakion / Excadrill / Conkeldurr / Heracross | cleared 287.5s | cleared 272.1s |
>
> **The trap:** a *mean team-DPS statistic* was compared against a *9000 HP ÷ 300 s = 30 DPS*
> threshold. Those are different quantities — that ratio assumes zero downtime, while the
> simulation's clear time already absorbs swap costs, faints and wipe-and-revive loops. Clearing at
> 272 s is ~33 effective DPS while a mean-DPS readout of the same run says 27. **Never conclude
> "can't clear" from a DPS figure against an HP/timer ratio — run it and read `outcome`.**
>
> The default is now `tyranitar-mega` with the user's own team, and `TeamRaidView.tsx`'s comment
> records the error rather than hiding it. Second-order lesson: the two agents did not
> independently corroborate — the second inherited the first's roster and varied only *level*.
>
> One more correction from the same chase: `DYNAMIC_PUNCH` is **not** in Mega Mewtwo X's movepool
> (only `DYNAMIC_PUNCH_PLUS` is), so passing that id silently falls back to `chargedMoves[0]`
> (Psychic) with no error. A "base vs plus move" comparison built that way measures the fallback,
> not the move.

### Later still: lineup builder, Shadow enrage, and six ideation items — SHIPPED

`PLAN_lineup_builder.md` is **complete and deleted**. Driven by two `pogo-player` audit rounds,
two ideation passes (player + researcher), and the user's own raid footage.

**Accuracy**

- **Shadow Raid enrage is now modelled.** A Shadow boss enrages at 60% HP
  (`attack = 1.81×base+15`, `defense = 3×base+15`) and auto-subdues at 15%. Before this, all 108
  recorded shadow species simulated at flat stats through a band where the real boss runs at ~3×
  defence. A computed fact from boss HP, never a mode — it does not reintroduce combat-phase
  selection.
- **Swap cost: the open question is closed by video.** `swapDurationMs: 1000` was already
  `[first-party]`; what was unknown was whether it applies to a *faint-triggered* swap. The user's
  recording settles it — HP hits 0, and the 1.0s **runs from that moment and subsumes the death and
  spawn animations**. One frame shows the field holding only a spawn sparkle while the HUD still
  names the *fainted* Pokémon and the boss is already taking damage. Do not model animations as
  extra time. Approved to move the default 0.5s → **1.0s**.

**Features**

- **Single-trainer lineup builder** — `runLineupBuilder`, an order-aware beam search (width 2, so a
  genuine runner-up exists), validated against brute force on a fixture where order swings clear
  time >2x. ~146ms on a 164-entry roster, so no worker. UI on Team Raid; the existing Team Raid →
  Power-Up export carries it onward.
- **Party-size ranking-flip** on the Comparator — `findCrossoverPartySize` already existed in
  `uptime.ts`, fully written and **entirely unused**.
- **Boss-moveset sweep** on Team Raid. It immediately found that the shipped default "clears
  against Crunch, Stone Edge, Brutal Swing but **fails against Fire Blast**" — a conditional the
  headline had been hiding.
- **Multi-raid single-boss picker** (`multiRaidBossIds` already stored resolved ids, so UI-only).
- Reverse **Power-Up plan → Team Raid** export, and **Species Report → Team Raid** link.

**Tooling — a real hole in the gate**

`check-scenario-roundtrip` only ever inspected *top-level* `Assumptions` fields. `slots: T[]`
counted as one. **20 per-slot fields had never been checked** — 6 on Team Raid, **14** on the
Power-Up Optimizer including `level`, all three IVs, `candyOnHand` and `xlCandyOnHand`. None
actually failed, but nothing was verifying them. Now recurses; **137 fields**. It also found the
same failure shape in itself: a CRLF file silently zeroed one tab's count.

Separately, `runTeamRaid.ts` never passed per-slot `level`/`ivs` to the engine — those fields would
have round-tripped perfectly and been **ignored at simulation time**. Fixed.

**Two corrections worth keeping**

- **"Mega Tyranitar can't be cleared" was wrong**, and I relayed it. Both rosters clear at 9,000 HP
  at L35 *and* L50. The error was comparing a *mean team-DPS statistic* against a *9000/300 = 30
  DPS* threshold — different quantities, since the ratio assumes zero downtime while the sim's
  clear time already absorbs swaps, faints and revives. **Never conclude "can't clear" from a DPS
  figure against an HP/timer ratio.** Two agents agreeing wasn't corroboration: the second
  inherited the first's roster and varied only level.
- **The "+" move multiplier cannot be closed from gameplay footage.** The combat HUD renders no
  numeric damage for any move, and shows no Mega Level badge. The needed evidence is a still of the
  **move-detail screen** for a Pokémon of known Mega Level.

### Session end 2026-09-10: Roster tab, TM candidates, IDEAS backlog — and what's left

The Roster tab plan is complete, and its file has been removed.

`PLAN_tm_move_change_optimizer.md` is **still pending**: its single-raid half is built, multi-raid
is not yet done, so the file deliberately stays at the root.

**Shipped this batch:** Roster tab (7th, `view=roster`/`rt`) with hand-entry, CSV import moved
there, and a gzip save code (164-entry roster → 8,313 chars, 89.8% smaller, versioned, fails
legibly when truncated). TM/second-charged-move candidates for single-raid. `kmBuddyDistance`
synced. Best-available-moveset toggle. Shadow enrage, lineup builder, party-size flip, Team Raid
boss-moveset sweep, multi-raid boss picker, four cross-tab links. Swap cost → **1.0s**,
`bossMaxHpOverride`, the friendship attack bonus, Best Buddy +1.

**143 assumption fields across 7 tabs**, 22 nested in per-slot arrays. Engine 534 / web 289 /
scripts 227 tests, 26 e2e specs.

## Durable gotchas

Carried forward from older sections because they are still true and not recorded anywhere else.

- **Best Buddy's +1 stacking with Super Max is single-source** — one GitHub gist comment, the
  *same* source already cited for Super Max's own +2, so it is not independent corroboration of
  the stacking claim.
- **The 1.0s swap-cost change (2026-09-10) moved pinned numbers in three tests.** Each was
  isolated with an explicit `swapCostSeconds: 0` because none of those tests is *about* swap cost
  — the numbers were not re-derived. If one of them later looks wrong, that is why.
- **When a user-visible number looks wrong** ("why does X show 0", "why is X so high"), check
  whether the metric's *definition* is narrower than what's displayed, or whether a data value is
  the culprit — and verify with real numbers before concluding either way. Three real bugs were
  found exactly this way (missing fast-move damage; a charged move using the fast move's type
  effectiveness; an 8x-outlier attack stat).
- **Changing dodge semantics or a fixture stat** means re-running the FULL suite immediately and
  expecting some tests' *setup* (not their claims) to need re-deriving. Re-derive the
  window/threshold values empirically; don't weaken the assertions.

## Older history

Sections from 2026-09-04 through 2026-09-09 were removed 2026-09-11 as stale point-in-time
narrative. `git show 00b5a23:HANDOFF.md` has the full text; `IDEAS.md`'s Shipped table and
`MECHANICS.md` carry everything durable from them.

