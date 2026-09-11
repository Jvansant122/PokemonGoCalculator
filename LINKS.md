# LINKS.md — things this project needs that I can't reach

A working queue. I add rows; you fetch them; I record the answer in `MECHANICS.md` and delete the
row. Nothing here is a nice-to-have — every entry is blocking a number this tool either can't
compute or computes at low confidence.

**How to use it.** Each row says exactly what's needed, so you don't have to read a whole page and
guess what mattered. Paste the relevant text (or a screenshot) into the chat — quoting is fine,
I don't need the whole article. **A negative answer is just as useful as a positive one**: "the
page is gone" or "it doesn't say" lets me close a question permanently rather than re-chase it,
and this project has already wasted multiple research rounds re-deriving the same dead ends.

## Why these are blocked

| Domain | Status |
| :--- | :--- |
| `reddit.com`, `thesilphroad.com` | **Hard-blocked to this tooling.** A ceiling, not a search-effort gap — retrying costs budget and always fails. |
| `gamepress.gg`, `community.gamepress.gg` | **Dead.** DNS failure, confirmed repeatedly. Archive copies may exist. |
| `poke-info.com` | Dead. |
| In-game screens | I can't play the game. Anything only visible in the client needs you. |

---

## Open requests

### 1. A "+" move's displayed damage, from the game itself — HIGHEST VALUE

**Not a link — a screenshot.** The single most valuable thing outstanding.

Open a Pokémon with a "+" charged move (e.g. Mega Mewtwo X with **Dynamic Punch+**) on its
**move-detail screen** — the one that prints a damage number next to the move, *not* the combat
HUD. Note **which Mega Level that Pokémon is at**.

- **Why:** this project scales "+" move power by `+10% per Mega Level tier` (Base 1.0 / High 1.1 /
  Max 1.2 / Super Max 1.3). That curve is `[unverified]` and has failed to source across **four**
  research rounds. Two community sites publish it with *verbatim-identical* self-labelled-guess
  disclaimers — one shared guess wearing two names.
- **One clean reading of (move name, Mega Level, displayed damage) retires the estimate outright.**
- Combat footage can't supply it: the battle HUD renders no numeric damage for any move and shows
  no Mega Level badge. Established 2026-09-10 from your own raid recording, so please don't send
  gameplay video for this one.

### 2. The Silph Road dodge-damage observation

Search `thesilphroad.com` / r/TheSilphRoad for the report of a player **surviving 8 dodged Paybacks
where 4-5 was expected**, suggesting dodge damage may scale with remaining HP.

- **What I need:** whether anyone ever produced a **formula**, or whether it stayed an anomaly.
- **Why:** currently unmodelled with no formula to model. It's been removed from `IDEAS.md` as
  unbuildable; a formula would put it back.

### 3. GamePress: "Are Charged TMs Truly Random?"

A page with that title existed; the whole `gamepress.gg` family is now dead. Try the **Wayback
Machine**.

- **What I need:** whether the TM reroll is **uniform** over the remaining movepool, or weighted.
- **Why:** this tool would have to model a regular TM as a distribution. "Uniform minus the current
  move" is the standard assumption every calculator uses and **nobody has confirmed it.** We
  deliberately did *not* build regular-TM ranking partly because of this.

### 4. The boss charged-move roll denominator

The engine models the raid boss deciding to throw a charged move as a **50% roll**, but the
*denominator* — what that roll happens per, and how often it's checked — is this project's own
reasoned inference, not sourced.

- **What I need:** any Silph Road / GamePress analysis of raid-boss AI charged-move timing.
- **Why:** it's the **highest-leverage unknown in the engine** — it drives the whole randomized
  cadence model, which in turn drives every survivability number. There's a built, shipped
  energy-driven cadence mode sitting behind a toggle that we won't turn on by default until this
  is sourced.
- ⚠️ A web-search summary once **fabricated** an answer here and attributed it to a real
  pokemongohub article that doesn't contain it. Please quote the actual page text.

### 5. The Silph Road damage-formula analysis

An analysis finding that **CPM values don't overlap the way the published damage formula implies**,
suggesting the formula is incomplete. No mirror or secondary citation exists anywhere reachable.

- **What I need:** the analysis itself, or confirmation it was retracted/superseded.
- **Why:** `MECHANICS.md` records this as the honest accuracy ceiling of every number this tool
  produces. Worth knowing whether that ceiling is real.

---

## Closed

Kept briefly so they aren't re-requested. Delete once stale.

- **Raid-context energy cost of "+" moves** — you supplied the full 15-row table off
  `db.pokemongohub.net` (2026-09-09). All 15 cost 100 energy; 13 of 15 base moves don't, which
  ruled out the "template default" worry. Three prior research rounds had recorded this as
  unpublished.
- **Whether the 1.0s swap cost applies to a faint-triggered swap** — your stopwatch recording
  settled it (2026-09-10). It does, it runs from HP-zero, and it subsumes the death and spawn
  animations.
