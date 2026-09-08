# Future ideas

Not-yet-scheduled feature ideas, kept separate from `HANDOFF.md` (in-progress session state)
and `CLAUDE.md` (standing decisions). Barebones step lists only — expand into a real plan
before starting implementation. An idea promoted to a `PLAN_*.md` is a plan, not an idea:
leave the pointer here, but the plan file owns the detail from then on, and gets deleted once
the feature ships (see `CLAUDE.md`'s "For session continuity").

## Power-Up Optimizer — v1 SHIPPED 2026-09-08 (no login); what remains

_Researched by `pogo-researcher` 2026-09-07 (see that agent's memory,
`.claude/agent-memory/pogo-researcher/fact_powerup_cost_data_source.md` and
`proposal_powerup_optimizer_flesh_out.md`, for the original citations). The thesis it
established is now the sixth tab — see `CLAUDE.md`'s repo layout, `MECHANICS.md`'s
"Power-up (level-up) costs", and `HANDOFF.md`'s 2026-09-08 entry for what was built._

What v1 does: a 6-slot roster where every slot carries its OWN level/IVs, candy and XL on
hand, and Shadow/Purified/Lucky cost flags, plus one stardust budget. Every single-slot
power-up to every half-level up to 50 is re-simulated as a full Team Raid (paired seeds), and
ranked by **team-DPS gained per 1000 stardust and per candy as separate numbers** — resources
are not fungible for a real player, so they are never blended into one score. Each slot's
headline is the stardust/candy to its next floored per-hit damage breakpoint against the
chosen boss (`powerUpDamageLadder`), because a power-up that crosses no breakpoint buys
nothing. The cost table comes from GAME_MASTER's own `POKEMON_UPGRADE_SETTINGS` +
`LUCKY_POKEMON_SETTINGS` templates (pogoapi's endpoint turned out to be unnecessary),
interpreted only by the engine's `powerUpCostTableFromGameMaster`.

**Scope decision, restated:** the user chose to prototype WITHOUT login first (2026-09-08),
reversing the 2026-09-07 "login before the optimizer" sequencing. The roster round-trips
through the `pu` query param like every other tab. Real persistence is still
[`PLAN_login_and_roster_persistence.md`](PLAN_login_and_roster_persistence.md) — unchanged,
still pending, and now purely additive on top of a working tab ("remember my roster" rather
than "share a link").

**Not a Teambuilding-Analyzer conflict**: one trainer's own roster, same single-trainer framing
as the Team Raid Simulator. Nothing here staggers megas across trainers.

Remaining ideas, in rough value order (none scheduled):

1. **Login + roster persistence** — the plan above. Signed-out must stay fully functional.
2. **Multi-step plans.** v1 ranks single-slot power-ups only. A greedy "spend this whole budget"
   plan (repeatedly take the best affordable candidate, re-baseline, repeat) is the obvious
   next step and needs no new engine primitive — `optimizePowerUps` already returns the
   re-baselined summary per candidate.
3. **"Add a 7th" candidates.** Compare powering up an owned slot against replacing it with a
   hypothetical new catch at level 20/25 (raid catch levels) — the original idea's "5 + a
   hypothetical 6th" framing. Needs a roster-swap candidate type alongside the level-up one.
4. **Per-species cost overrides.** GAME_MASTER carries an Eternatus-only 30× candy override
   (`POKEMON_UPGRADE_OVERRIDE_SETTINGS_V0890_POKEMON_ETERNATUS`); v1 ignores it, so Eternatus
   candy costs are understated 30×. Small data-sync + engine change once a second such
   override appears or someone actually optimizes an Eternatus.
5. **Best Buddy +1 level** (`defaultCpBoostAdditionalLevel`) as a free, cost-less candidate.
6. **More iterations / a Web Worker.** 3 paired seeds keep the tab responsive but small deltas
   are still noisy; the Species Report's rejected-for-now worker idea applies here too.

## Unmodelled real mechanics

Each of these is a real, recorded game mechanic this engine does **not** model. They live in
`MECHANICS.md` with sourcing and a "not modelled" note; this is the scheduling view of the same
list. None is a bug — each is a deliberate, dated gap.

Ordered by how much they'd change results, not by effort.

1. **Turn the energy-driven boss cadence on by default.** Already built and shipped behind a
   toggle (`bossChargedMoveCadence`), off by default. Flipping it costs nothing to implement —
   the blocker is evidential, not technical. What would need to be true first: the denominator of
   the boss's 50% charged-move roll established from a source (ours is a reasoned inference), and
   ideally the ~15-34% survival impact sanity-checked against a real raid log. See
   `MECHANICS.md`'s "OPEN QUESTION" section. Do not flip it just because it is more faithful in
   principle — that silently re-baselines every number and every previously-shared link.

2. **Asymmetric move delay.** Fast moves apply their 1s/1.5s delay at the END of the animation;
   charged moves apply it at the BEGINNING. So the fast move following a boss's charged move
   arrives quickly. Currently all move durations are treated uniformly. This shifts the fine
   structure of when damage lands, which matters most for dodge timing.

3. **The 0.7s dodge window.** We model dodge damage (0.25) and its 0.5s cost, but not the window
   itself. Related and harder: per-move windup-to-flash delay reportedly varies by move
   (Flamethrower ~1.0s vs Fire Blast ~2.9s) rather than being flat — but that is `[unverified]`,
   and pogoapi exposes no per-move windup field, so it is not derivable from current data sources.

4. **Dodge damage may scale with remaining HP.** Silph Road observed a player surviving 8 dodged
   Paybacks where 4-5 was expected. They flag it as needing confirmation and have no formula.
   **Do not implement until confirmed** — it is recorded so anomalous survivability reports are
   recognised rather than re-investigated from scratch.

5. **The 0.5s combat cycle.** Since the Sept 2024 rework the real game runs on 0.5s cycles; our
   simulator uses a finer 0.1s tick. Nothing is mis-timed (0.5 is representable at 0.1), but the
   engine permits event boundaries the real game would snap. No known error from this today.

Standing caveat for all of the above: the sourcing is ~2 years old and Niantic re-tunes raid
internals without notice. Re-verify before building on any of it.
