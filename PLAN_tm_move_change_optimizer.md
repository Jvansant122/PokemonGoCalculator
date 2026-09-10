# PLAN: move changes as Power-Up Optimizer candidates

Self-contained plan for a fresh session. Researched and scoped 2026-09-10; **not built**.
Delete this file when it ships and record the outcome in `HANDOFF.md`.

The user's original ask:

> *"there are ways to change a pokemons moves. we need to incorporate a finite amount of TMs into
> the optimizer. for pokemon without any move data in the csv, treat them as needing a tm for both
> their fast move and charge move. pokemon can also receive a second charge move... we will need to
> allow the user to input the amount of each TM they have. then, we can incorporate changing the
> moves of pokemon into the optimizer alongside powering up pokemon."*

## The one clause that was overridden, and why

**"Treat a Pokémon with no move data in the CSV as needing a TM for both moves" is NOT implemented,
deliberately.** The user delegated this call on 2026-09-10 after two independent passes said it was
wrong:

- **Definitional** (`pogo-researcher`): every Pokémon in storage has one fast move and one-or-two
  charged moves *at all times* — assigned on capture, hatch, evolution, trade. No state exists in
  which a Pokémon holds none. A blank cell can therefore only mean *the export didn't capture the
  field*.
- **Empirical** (`pogo-player`, driving the real sample): blank does not track "untouched", either.
  Of 23 sample rows, 8 are blank — mostly level-1-13 mules, but also a **kept Rayquaza at 82.2% IV**
  and a kept Hisuian Sneasel.

Adopting the rule would have invented a purchase cost across roughly half a roster *and* aimed a
random reroll at the entries a player is least willing to gamble on. See MECHANICS.md,
"A blank move column means 'not captured', never 'has no move'".

**Instead: three states, kept structurally distinct.** Already shipped as badges on every row that
recommends a spend (`rosterMovesetBadge.ts`):

| State | Detection | Meaning |
| :--- | :--- | :--- |
| known | both moves resolved | act on it |
| **unknown** | blank cell, `unmatchedMoveNames` empty | *verify in game* — never price a TM against it |
| **unrecognised** | name recorded, didn't match our data | **our** data gap, not the player's problem |

A TM candidate may only be generated for a **known** moveset. Recommending a single-digit-supply
Elite TM against a moveset the tool never observed spends a real, irreplaceable item on a guess.

## The four actions are not one feature

Determinism differs per action, and that decides everything about how each can be ranked. Full
mechanics with sourcing are in MECHANICS.md ("Changing a move: the four TM items…", "Frustration is
event-gated…").

| Action | Outcome | Cost | Build? |
| :--- | :--- | :--- | :--- |
| **Second charged move** | deterministic | dust + candy | **first** |
| **Elite TM** | deterministic (player picks) | 1 item, 0-3 held | second |
| **Regular TM** | **random** | 1 item, plentiful | last, or not at all |
| **Frustration removal** | random *and* calendar-gated | 1 item + a "Taken Over" event | informational only |

### Build order (from `pogo-player`, endorsed)

1. **Second charged move.** Not a TM at all — no new typed inventory, and it competes in the
   stardust/candy budget already tracked. Costs are in MECHANICS.md (buddy-distance tiers,
   10k/25 → 100k/100; 16 species can't learn one unless Shadow/Purified).
   ⚠️ **Purified is ×0.8 here, not the ×0.9 the power-up table uses.** Do not reuse
   `PowerUpCostModifiers`.
   ⚠️ Not first-party-sourceable: `data/raw/game_master.json` carries only `pokemon`, `moves`,
   `upgradeSettings`, and `fetchCache.ts` discards everything else before caching. Pricing this
   first-party means new sync-pipeline work, and the upstream template name is unconfirmed.
2. **Elite TM** — deterministic once a target is picked, so it reuses the existing candidate
   machinery with no probabilistic layer. Present as "your N Elite TMs, best N targets", not folded
   into the main ranked table.
3. **Regular TM** — see the modelling problem below.

`IDEAS.md` #9 (evolve-then-power-up) should probably beat all of this: **6 of 8 "never competitive"
entries in the sample are blocked on "evolve first", none on moveset.**

## Why regular TMs may not be rankable at all

- A regular TM yields a **random, guaranteed-different** move from the non-legacy pool. So the
  outcome is a distribution over movesets, not a value — and pool size varies per species, so
  "chance of landing the best move" isn't a roster-wide constant.
- **The distribution isn't confirmed uniform.** Niantic has never stated it; community suspicion is
  real. Uniform-minus-current is the only practical model, and any EV number inherits that
  uncertainty. It **must be labelled an assumption on screen.**
- It is **destructive and irreversible**: a Pokémon holding a legacy/event move loses it, and no
  regular TM can return it. Only an Elite TM can.

`f2p-constrained` would not build this at all. `hardcore-spender` wants the EV math. If built:
show a **[worst, expected, best] band**, never one blended number — the same
"don't collapse a distribution" discipline the comparator already runs on.

## Both modes, not just single-raid

Requested explicitly by the user 2026-09-10: *"can the power up optimizer for the roster also use
the same TM technique?"* — yes. Move-change candidates apply to the **multi-raid / roster mode**
(`rosterPlanner.ts`: `runRosterPlanner` + `planRosterBudget`) on the same terms as single-raid
(`powerUp.ts`: `optimizePowerUps` + `planPowerUpBudget`), so build the shared shape once rather
than bolting it onto one mode.

What differs in roster mode, and matters:

- **Candidates are not limited to the six already fielded.** A benched entry whose *moveset* is the
  only thing keeping it off the team is precisely the `benchedButPromising` question this mode
  exists to answer — arguably a better fit for a move change than for a power-up, since a TM is
  cheap in stardust terms and a power-up is not.
- **Scale.** A ~164-entry roster against ~13 bosses is already the expensive sweep. Adding a
  move-change candidate per entry multiplies that — and for a *regular* TM, honestly modelling the
  outcome means simulating every reachable move in the pool, not one. Budget for this before
  building: it may be the reason regular-TM candidates are infeasible in roster mode even if they
  are affordable in single-raid mode.
- **TM inventory is account-wide**, exactly like `rareCandyOnHand`/`rareCandyXlOnHand` — not
  per-entry, and not per-`candyFamilyId`. A joint allocation (`planRosterBudget`) must draw all
  entries' TM spend from the one pool, the same way the shared Rare Candy pools already work.
- **The moveset-unknown rule above binds hardest here.** Roughly a third of a real import has a
  blank move column, so in roster mode the "never price a TM against a moveset we never observed"
  rule excludes a large, visible fraction of entries. That exclusion must be *shown* (the
  `rosterMovesetBadge.ts` badges already do this) rather than silently shrinking the candidate set.

## The Roster tab changes this plan's central constraint (added 2026-09-10)

`PLAN_roster_tab.md` adds **hand-entry** of Pokémon. That interacts with this plan's most
important rule, and mostly in this plan's favour.

**A hand-entered Pokémon has a KNOWN moveset by definition** — the user typed it. It must never
carry the "default moveset" badge, and it is therefore **eligible for TM candidates** under the
rule above, unlike a blank CSV row.

More usefully: **hand-entry is the fix for the unknown-moveset problem, not a complication of
it.** The blocking constraint here has been that roughly a third of a real Poke Genie export has
a blank move column, and a TM must never be priced against a moveset the tool never observed.
Once a user can correct an entry by hand, that exclusion stops being permanent — it becomes a
prompt:

> *"12 entries have unknown movesets and can't be considered for a TM. Fill them in on the Roster
> tab to include them."*

That turns a silent exclusion into an action, and it is worth building **before** the TM
candidates themselves — otherwise the feature ships with a third of the roster invisibly
ineligible and no way for the user to do anything about it.

**Ordering consequence:** `PLAN_roster_tab.md` should land before this plan's step 1, not after.

## Hard constraints

- **TM counts are a new user-facing setting → they MUST round-trip through `Scenario`.** Use the
  `add-scenario-assumption` skill. Shape them like the existing account-wide
  `rareCandyOnHand`/`rareCandyXlOnHand` pools in `PowerUpOptimizerAssumptions`.
- **TM candidates need their own axis — do not merge them into the stardust-per-1000 sort.**
  CLAUDE.md ranks stardust and candy separately, never blended, because they aren't fungible.
  Fast TM / Charged TM / Elite Fast / Elite Charged are a third through sixth non-fungible
  currency; one sorted list over one score would violate the principle that rule exists to protect.
- **Don't gate the sweep on four more typed numbers.** The candy grid already solved this by
  defaulting unfilled families to "unknown, not zero" — reuse that. `real-users` would have to
  alt-tab into the game to check TM counts.
- **Frustration**: no TM removes it outside a ~quarterly "Taken Over" event. Surface such candidates
  with a **static** "only actionable during a Taken Over event" label — never a live is-an-event-on
  check, which would make a share link's answer depend on when it's opened.
- **Megas have no movepool of their own** (first-party). A TM on the base form is a TM on the mega;
  nothing to reconcile between this project's separate mega species entries and their bases.
- **Never TM-able**: Frustration/Return (outside events), the signature moves (Behemoth Bash/Blade,
  Dynamax Cannon, Secret Sword), Smeargle, and Super Max "+" moves.
