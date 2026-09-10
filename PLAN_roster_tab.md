# PLAN: Roster tab — hand-entry, and a self-contained save code

Self-contained plan for a fresh session. Approved 2026-09-10; **not built**.
Delete this file when it ships and record the outcome in `HANDOFF.md`.

> *"remove login from the plan and implement a way to add pokemon by hand. maybe another tab for
> roster. have it saveable using some generated hash key"*

## This replaces the login plan, which is deleted

`PLAN_login_and_roster_persistence.md` (Firebase Auth + Cloud Firestore) was **deleted
2026-09-10** on the user's instruction. It existed to give the roster real cross-device
persistence behind a Google sign-in, and was the single documented exception to this project's
"no backend" rule.

**There is no exception any more.** This app stays a static site on GitHub Pages, with no
backend, no accounts, and no stored user data. CLAUDE.md's "No backend in v1" line is now
unconditional. Do not reintroduce auth or a hosted datastore to solve a roster problem.

## Two decisions the user made, so don't re-litigate them

1. **The save key is a self-contained code, not a short server-backed handle.** The roster
   compresses into a string the user copies and pastes back — the same idea as a share link, but
   for the roster. A genuinely short code (`A7K2-9XQ4`) was offered and **rejected**, because it
   requires storing rosters somewhere, which is the backend that removing login was meant to
   avoid. Accept that the code is a long blob.
2. **It gets its own tab — the seventh.** A dedicated Roster tab owns the roster outright:
   hand-entry, CSV import, editing, and save/load. Extending the Power-Up Optimizer's existing
   panel was offered and rejected.

## Why the tab is the right call beyond preference

The roster is no longer a Power-Up Optimizer implementation detail. As of 2026-09-10 it is read
by the **lineup builder** (Team Raid) and, through that, reaches the Team Raid → Power-Up export.
It lives in `rosterPool.ts` (`localStorage`) but is *owned* by one tab's UI. A Roster tab makes
ownership match reality.

## Use the `new-tab` skill

A seventh tab has **eleven parallel touch points** (App.tsx, codec, view, `run/` function,
round-trip checker, CLI, three test files, docs). Missing one is the drift this repo's docs
checker exists to catch. **Invoke that skill; don't hand-roll the wiring.**

## Hand-entry

Per entry, mirroring what the Poke Genie import already produces (`pokeGenieMatch.ts`'s
`RosterEntry`): species, fast move, charged move, level, three IVs, Shadow/Purified/Lucky flags,
candy and XL candy on hand, and whether it can Mega.

- Reuse `SpeciesPicker`, `MoveSelect` and `NumberField` — all three already exist and carry
  behaviour (type-effectiveness chips, select-all-on-focus, blur clamping) that a hand-rolled
  form would silently lose.
- A hand-added entry must be **indistinguishable downstream** from an imported one — same
  `RosterEntry` shape, same `entryId` uniqueness rule (duplicates of a species are legitimate and
  common).
- **Moveset honesty applies.** `rosterMovesetBadge.ts` distinguishes known / unknown / unrecognised.
  A hand-entered Pokémon has a *known* moveset by definition — the user just typed it — so it must
  not inherit the "default moveset" badge that a blank CSV column earns.

## The save code

- **Compress.** A 164-entry roster is ~16 KB of base64 today. Compression matters a lot here for
  the code to be usable at all; measure and report the real ratio. A hand-entered roster will
  typically be far smaller than a full CSV export.
- **Never put it in the URL.** Standing decision, unchanged: the roster stays out of share links.
  This code is copied and pasted deliberately by the user, not embedded in a scenario.
- **Validate on load, and fail legibly.** A truncated or edited code must produce a clear error,
  never a half-loaded roster or a crash. Say how many entries were restored.
- **Version the format.** Backward compatibility with *old share links* was dropped 2026-09-10,
  but this is different: a user may keep a saved code for months and paste it back. A version
  prefix costs nothing now and makes a future format change diagnosable rather than mysterious.
- Loading a code should be **additive-or-replace by explicit choice**, not a silent overwrite of
  a roster someone spent time entering.

## Constraints

- Any new *setting* on this tab round-trips through `Scenario` (`add-scenario-assumption`); the
  roster **contents** deliberately do not.
- `check-scenario-roundtrip` now recurses into `slots[]`-style array members and reports **137**
  fields across six tabs — a seventh tab adds to that count.
- Every other tab that reads the roster must keep working when it's empty, and when it changes
  underneath them.
