---
name: proposal-shadow-raid-enrage-simulation
description: proposed 2026-09-10 (ideation pass) — model the Shadow Raid 60%-to-15%-HP enrage window as a boss-side, HP-triggered stat escalation, since Shadow bosses today are simulated at flat tier-normal stats for the whole fight
metadata:
  type: project
---

Status: proposed 2026-09-10. Not built. Confirmed via grep of `packages/engine/src`
(2026-09-10) that no enrage/subdue logic exists anywhere in the engine today — this is a
genuine gap, not a partially-built feature.

**The mechanic** (MECHANICS.md "Shadow raids" section, `[community-consensus]`,
Bulbapedia `Shadow_Raid` + corroborating guides, 2026-09-09; re-examined 2026-09-09 in
"Known bugs" section, 4 independent sources): a Shadow raid boss enrages at **60%
remaining HP** (`attack = 1.81 * baseAttack + 15`, `defense = 3 * baseDefense + 15`,
two independently-converging community sources) and **auto-subdues at 15% HP**,
reverting to normal tier stats — this happens automatically regardless of Purified
Gems, so it is NOT gated behind multi-trainer coordination (only the *early* subdue via
gems is — correctly already ruled out as Teambuilding-Analyzer-adjacent). Shadow bosses
already correctly get the baseline 1.2 attack / 5-6 defense shadow multiplier at all
times (`bossEffectiveStats()` calls `shadowAdjustedBaseStats(boss)` — verified positive,
not a gap); enrage would stack an *additional*, HP-triggered override on top for the
60%-15% band specifically.

**What it would show:** for any Shadow raid boss in the roster (108 recorded shadow
species per prior research), the Species Report / Team Raid Simulator / Power-Up
Optimizer currently simulate the entire fight at flat tier-normal stats. In reality a
substantial mid-fight band runs with defense ~3x higher (raw damage output drops
sharply) and attack ~1.8x higher (incoming damage spikes, faint risk rises). This is a
genuine survivability-as-team-DPS ranking-flip candidate: a team that wins on raw
team-DPS against a tier-normal boss may not be the team that best survives the enraged
attack spike, and the tool currently cannot show this distinction for Shadow bosses at
all.

**Compatibility with standing decisions:** explicitly does NOT touch "no
user-selectable combat phase" — enrage is boss-HP-triggered, a computed fact of the
fight exactly like whether the boss has thrown a charged move yet, never a player
choice. No new `Scenario` field implied (driven by `isShadow` + live HP, both already
known).

**Roughly what it would take:** `engine-developer`, `simulate.ts` boss-stepping logic —
track HP fraction, apply/revert the enraged multiplier at the 60%/15% thresholds. Needs
one open sub-question resolved first (or flagged as an assumption): stacking order
between the enrage formula and the baseline shadow 1.2/0.83 multiplier — MECHANICS.md
does not resolve which applies to which base. Output should follow the existing
"surface a structural fact" precedent (`dodgeFastAttacksLockout`,
`bossChargedMoveCadenceClamped`) rather than hiding the transition.

**Worth it:** yes — real, multiply-sourced mechanic, non-trivial fraction of a real
Shadow raid boss's total HP fought at radically different stats, and a genuine
survivability-vs-raw-DPS ranking-flip case. Medium engine effort (new boss HP-state
machine, contained to `simulate.ts`/`raidBoss.ts`). Rated the strongest of this pass's
three proposals.

**Not yet routed to engine-developer** — this is a proposal only, per role boundary.
