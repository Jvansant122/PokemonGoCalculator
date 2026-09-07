# Future ideas

Not-yet-scheduled feature ideas, kept separate from `HANDOFF.md` (in-progress session state)
and `CLAUDE.md` (standing decisions). Barebones step lists only — expand into a real plan
before starting implementation.

## Power-Up Optimizer

_Fleshed out by `pogo-researcher`, 2026-09-07 — see that agent's memory
(`.claude/agent-memory/pogo-researcher/fact_powerup_cost_data_source.md`,
`proposal_powerup_optimizer_flesh_out.md`) for full source citations._

Given a user's own 6-Pokémon roster (or 5 + a hypothetical 6th), recommend the most
stardust/candy-efficient power-ups (or new additions) for raid performance, ranked by
**team-DPS gained per resource spent** — not raw CP or raw ATK — reusing this project's
existing survivability/team-DPS math.

**Why raw CP/ATK is the wrong metric here (not just philosophically, mechanically):**
Pokémon GO's real damage formula truncates per-hit damage to an integer
(`Math.floor(fullDamage * multiplier)` — already implemented in
`packages/engine/src/breakpoints.ts`). A stardust/candy spend that raises a Pokémon's
effective ATK can produce a literal zero change in damage-per-hit against a specific
boss's real Defense stat until enough small increases stack to cross the next integer
threshold. This is the exact same "breakpoint" concept the IV Breakpoints tab already
surfaces for IV/level choices (`packages/engine/src/breakpoints.ts`,
`packages/web/src/IvBreakpointsView.tsx`) — the Optimizer's headline metric should be
**"stardust/candy to reach the next real damage breakpoint against this boss,"** not a
naive linear $-per-level number. This is also where the project's core thesis applies
directly: the *team*-DPS delta (via `teamRaid.ts`'s sequential-roster math, which already
folds in uptime/downtime/revive cost) is the right numerator, not the power-up's own
solo-DPS delta, since a power-up on a low-uptime slot may barely move team output even
if it moves that slot's own DPS a lot.

**Real cost data**: pogoapi.net exposes a dedicated
`GET /api/v1/pokemon_powerup_requirements.json` endpoint (levels 1-50, separate
`candy_to_upgrade`/`xl_candy_to_upgrade`/`stardust_to_upgrade` fields, universal across
species) — confirmed to exist via its own documentation, 2026-09-07. **Not currently
fetched by `scripts/sync-data.ts`** — this needs new `data-sync` work, not a
hand-authored table (matches this project's stated aversion to hand-typed data since
the `baseAttack` incident). On top of that base table, real per-Pokémon modifiers apply
at the cost layer only (no combat-math change): Lucky = 50% Stardust; Shadow = 1.2x
both; Purified = 90% of both; these stack multiplicatively. [community-consensus —
Bulbapedia percentages agree across two independent fetches; exact cumulative totals
from wiki-page summarization did NOT agree across fetches and should not be trusted —
only the structured API endpoint should be used for real numbers.] Shadow-vs-not is
already representable via this engine's existing `isShadow` flag
(`packages/engine/src/shadow.ts`); Lucky/Purified need no new combat flag, only a
cost-side multiplier — they don't change a Pokémon's battle stats.

**Scope decision — RESOLVED 2026-09-07**: the original outline assumed real login +
persistent server-side storage had to come first; `pogo-researcher` flagged a no-login,
`Scenario`-URL-only alternative as a cheaper v1. The user decided: **build real login.**
Full architecture spec written to
[`PLAN_login_and_roster_persistence.md`](PLAN_login_and_roster_persistence.md) (Firebase
Auth + Firestore, no server/hosting change, no password handling — Google Sign-In only).
That plan is standalone infrastructure work, sequenced **before** this Optimizer's own
step 3 below — read it first if picking this idea up. It keeps the existing
`Scenario`+query-param share-link pattern too (auth adds "remember my stuff," it doesn't
replace "share a link"), so nothing about the CLAUDE.md Scenario-round-trip rule changes.

**Not a Teambuilding-Analyzer conflict**: this is one trainer optimizing their own
roster's power-ups, the same single-trainer framing CLAUDE.md already blesses for the
Team Raid Simulator (added 2026-09-06). No multi-trainer mega staggering is implied by
anything here — flagging explicitly per CLAUDE.md's instruction to surface this rather
than quietly assume it's fine.

Revised steps:

1. **Data**: `data-sync` fetches/normalizes pogoapi.net's
   `pokemon_powerup_requirements.json` (levels 1-50, candy/xl_candy/stardust) into
   `data/normalized/` — a small, likely rarely-changing static table, not a live feed.
2. **Login + persistence infrastructure** — see
   [`PLAN_login_and_roster_persistence.md`](PLAN_login_and_roster_persistence.md), a
   standalone plan (Firebase Auth + Firestore). Land and verify that plan's minimal
   vertical slice before starting step 3 below.
3. Roster data model: per-slot species id, IVs, current level, candy/candy-XL on hand,
   stardust on hand, and Lucky/Shadow/Purified flags (cost-multiplier-only, per above)
   — persisted via the new `useRoster()` hook from step 2, *and* still round-tripped
   through a `Scenario`-family type + its own query param for the separate "share a
   link" feature, following the existing per-tab convention.
4. Engine: extend `breakpoints.ts`'s per-hit-damage-truncation logic to compute, per
   candidate power-up step (or step-range), the resulting real damage-per-hit
   breakpoint crossings against a chosen boss — reuses `compareIvSpreads`'s existing
   level/IV stat math (`ivComparison.ts`), doesn't reinvent it.
5. Engine: reuse `runTeamRaid`/`TeamRaidInputs` (`teamRaid.ts`) unchanged to compute
   the **team-DPS delta** (not solo-DPS delta) of a given power-up or roster swap
   against the user's real other 5 slots and a chosen boss.
6. Optimizer layer: for each affordable power-up (or swap) candidate, compute
   (team-DPS delta) / (stardust spent) and (team-DPS delta) / (candy-or-XL-candy
   spent, weighted for scarcity) as two separate efficiency numbers — stardust and
   candy are not fungible resources for a real player, don't collapse them into one
   score. Group zero-delta intermediate steps under "cost to next real breakpoint."
7. UI: new tab, its own query param, roster entry UI, ranked efficiency table.
8. *(Only if step 2 resolves toward real auth)* sign-in flow, roster persistence UI.
9. Testing: engine tests for the new breakpoint-crossing-cost math and the
   stardust/candy efficiency ranking, plus this project's usual
   test → typecheck → build → ship pipeline.
