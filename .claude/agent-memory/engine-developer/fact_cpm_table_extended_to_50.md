---
name: fact-cpm-table-extended-to-50
description: cpm.ts's CPM_TABLE now covers levels 1-50 (was 1-40) — where the levels 41-50 values came from and why 50.5+ is deliberately excluded
metadata:
  type: project
---

Extended `packages/engine/src/cpm.ts`'s `CPM_TABLE` from max level 40 to max level 50 (2026-09-06),
requested directly by the overseer to unblock an upcoming "IV Breakpoints" level-range restriction
(35-50).

**Source of the new values**: not derived by this agent — the overseer had already had
`pogo-researcher` verify them against the live `PokeMiners/game_masters` `latest.json`
GAME_MASTER dump (whole levels 41-50 read directly via curl+JSON.parse; half-levels computed via
`CPM(n+0.5) = sqrt((CPM(n)^2 + CPM(n+1)^2)/2)`, validated by reproducing the table's own existing
pinned `39.5` entry to 8 sig figs). Full derivation:
`.claude/agent-memory/pogo-researcher/fact_cpm_table_levels_41_50.md`. Task explicitly said "don't
re-derive or re-research — just add these," so I added the literal values as given rather than
re-verifying independently.

**Levels 50.5+ deliberately excluded** even though the raw GAME_MASTER array technically continues
with distinct (non-flatlined) values through level 54 — Niantic's Oct 2025 blog post confirms the
trainer-level-cap raise to 80 "only affects Trainer level and not Pokémon"; the real Pokémon
power-up cap has stayed 50 since Nov 2020. If a future request asks to extend further (51+), point
back to that same blog post before adding anything — the raw data existing isn't sufficient
justification, since it's a known padding artifact.

**Only additions, no changes to existing 1-40 entries** — full suite (136 tests, 20 files) passed
unchanged after the extension, confirming nothing implicitly depended on level 40 being the max
(e.g. no code was iterating "all keys" in a way sensitive to the new entries appearing).

New test file: `packages/engine/test/cpm.test.ts` (previously levels/cpm had no dedicated test
file — assertions lived inline in `stats.test.ts`). Covers level 45/50 whole-level values, a new
half-level (45.5), an effective-stat computation at level 50, and that `cpmForLevel` rejects 50.5/51/0.
