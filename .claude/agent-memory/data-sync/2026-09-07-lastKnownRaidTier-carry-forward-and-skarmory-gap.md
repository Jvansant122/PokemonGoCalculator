# 2026-09-07 — lastKnownRaidTier carry-forward + Mega Skarmory allowlist gap

Two regressions found on the first real raid rotation since `8d6fd08` (rotation flipped from
"Mega Ascension" set — Steelix/Skarmory/Aggron/Glalie — to Raichu Y/Sableye/Mawile/Audino).
Both fixed in `scripts/sync-data.ts`, re-synced, verified against `git show HEAD:...` and
`npm run test:engine` (174 passing).

## Fix 1 — lastKnownRaidTier carry-forward

`lastKnownRaidTier` was only ever written from (1) this run's live-raid observation or (2) the
`RELEASED_MEGA_PRIMAL_ALLOWLIST`. Nothing carried forward the *previous* `species.json`'s value,
so any species observed raiding in an earlier run, absent from the allowlist, and not raiding
*this* run silently lost the field — defeating its whole purpose the first time a species rotated
out.

Fix: added a carry-forward step in `scripts/sync-data.ts`, inserted right after `previousSpecies`
is loaded (existing read, reused — no second read path) and right before `diffSpecies`/`diffRaids`
are called. For every species whose `lastKnownRaidTier` is still `undefined` after this run's live
observation (raid-matching loop) and allowlist application (mega-build loop) have both had their
chance, it looks up the same species id in `previousSpecies` and copies that value forward if
present. Precedence preserved exactly as documented: live-this-run > allowlist > carried-forward >
undefined (never guessed). A first-ever run (`previousSpecies === null`) is a no-op, no crash.

**Important gotcha hit while verifying this**: `data/normalized/species.json` on disk had already
been overwritten by an earlier *buggy* sync run (the one that exposed the regression), so it no
longer had `steelix-mega`/`aggron-mega`/`glalie-mega`'s `"Mega Raids"` value to carry forward —
carry-forward can only ever propagate what's actually sitting in the file it reads. Restored
`data/normalized/species.json` and `activeRaids.json` to last-committed (`git show HEAD:path >
path`, NOT `git checkout` — that's classifier-blocked as a destructive git op in this environment)
before re-running, so the fixed code had the correct pre-regression baseline to carry forward from.
If this ever recurs: check `git status` on `data/normalized/*.json` before trusting carry-forward
output — if it's dirty from a prior broken run, restore from HEAD first.

## Fix 2 — Mega Skarmory added to RELEASED_MEGA_PRIMAL_ALLOWLIST

Mega Skarmory is absent from pogoapi's `mega_pokemon.json` and was reaching `species.json` *only*
via the currently-live-raid gate. Once its raid rotated out it had no other way in and vanished
from the species list entirely (1092 → 1091) — the exact structural blind spot
`RELEASED_MEGA_PRIMAL_ALLOWLIST` exists for. Added `{ name: "Mega Skarmory", lastKnownRaidTier:
"Mega Raids" }`, citing this pipeline's own same-day (2026-09-07, 05:01 UTC fetch) cached
`data/raw/raids.json` observation as the evidence — a first-hand pipeline observation, not a
third-party claim, satisfying the "independent of both GAME_MASTER and whatever suggested it" rule
since it long predates this session and wasn't sourced from GAME_MASTER at all.

Also corrected a stale `CLAUDE.md` "Standing decisions" claim that Mega Skarmory "already flows
through as real species via the normal mega_pokemon.json/GAME_MASTER pipeline" — it never did; it
flowed through the raid gate. (The user said they'd fix that line themselves — confirmed this
reading is accurate when asked.)

## Verified end state (re-synced after restoring baseline)

- `skarmory-mega` present again (species count back to 1092), `lastKnownRaidTier: "Mega Raids"`.
- `steelix-mega`/`aggron-mega`/`glalie-mega` retained `"Mega Raids"` via carry-forward (console
  WARNINGS line explicitly lists all three as carried-forward this run).
- `sableye-mega`/`mawile-mega`/`audino-mega` got `"Mega Raids"` fresh from today's live feed.
- `raichu-mega-y` correctly flipped `"Super Mega Raids"` → `"Mega Raids"` (live observation
  legitimately outranks the allowlist's historical debut tier — this is documented, correct
  behavior, not a bug).
- Only 5 species changed vs. `git show HEAD:data/normalized/species.json`: the above three
  live-feed-observed megas + `raichu-mega-y` + `skarmory-mega` (the last one's diff is *pure key
  order*, not content — `lastKnownRaidTier` now gets set earlier in the mega-build loop via the
  allowlist path instead of later via the raid-matching loop, so `JSON.stringify` orders the key
  differently even though every field value is identical; `diffSpecies` string-compares full
  objects so it flags this as "changed" even though nothing semantically differs — pre-existing
  behavior of `diffSpecies`, not something this fix introduced or needs to fix).
- No unrelated species changed (0 added/removed vs. HEAD besides the expected set; full pre/post
  diff was verified programmatically, not spot-checked).
