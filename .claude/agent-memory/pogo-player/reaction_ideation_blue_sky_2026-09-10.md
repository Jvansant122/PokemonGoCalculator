---
name: reaction-ideation-blue-sky-2026-09-10
description: 2026-09-10 blue-sky ideation pass (not an audit) — three ranked feature ideas grounded in real-users' documented hand-calc behavior, verified against actual code/docs before proposing
metadata:
  type: project
---

2026-09-10, ideation round (distinct from the three prior audit/forward-looking reactions —
see MEMORY.md). Question: "what do you want to know that no tool tells you," blue sky, not
confined to the existing six tabs or the round-3 accepted list (reverse export, Species
Report link, multi-raid single-boss picker, single-trainer lineup builder — all already
accepted/building, not re-argued here).

Three ideas given, ranked, each checked against actual code (not just archetype memory) before
being proposed:

1. **Party-size ranking-flip breakpoint on the Comparator.** `partySize` in
   `packages/engine/src/scenario.ts` is a fixed assumption; `packages/web/src/rankingFlip.ts`'s
   `computeRankingFlip` sweeps TIME to find a crossing at a fixed party size but nothing sweeps
   PARTY SIZE itself. This player did exactly that by hand before the tool existed (the
   2026-09-04 log's "for FOUR teammates specifically... group size of 5" reasoning, already in
   `archetype-real-users.md`). Reusing the same crossing-detection shape on a different axis is
   the pitch — same UI pattern, new axis, no new modeling.

2. **Surface the own-charged-move-cast vulnerability cost as its own displayed line**, not
   folded into the aggregate survivability number. `MECHANICS.md`'s "OPEN QUESTION: how much of
   the attacker's own time is lost dodging around their own charged-move cast" (~line 921)
   confirms the engine ALREADY computes this
   (`HOLD_CHARGED_MOVE_DODGE_ATTEMPTS * DODGE_COST_SECONDS`, labelled an unsourced placeholder)
   but never exposes it as a distinct stat. This player already named this exact gap unprompted
   in 2026-09-04 ("self Morgana Q eternal snare prison self cc") and explicitly excluded it from
   their own hand-calc. Caution given: only worth building if clearly labeled as the unsourced
   placeholder it is, not dressed up as a confident headline number — this player distrusts
   numbers whose error-bias direction they can't judge.

3. **Dodge-execution-error sensitivity** — a swept "what if I miss N% of dodges" range, separate
   from `dodgeModel`/`dodgeFastAttacks` (which choose WHICH attacks to attempt, confirmed
   deterministic-given-strategy in `scenario.ts`, no miss-chance modeled at all). Grounded in the
   2026-09-04 "lord save me if you have to dodge every fast attack from kyogre just choose a
   different mega" quote plus the precedent this same player set choosing a nonzero
   wipe-and-rejoin default "to allow user error."

Explicitly rejected as different-product / out-of-scope rather than proposed: an
event-worth-attending calculator (needs calendar/event data this tool doesn't ingest) and any
multi-trainer lobby composition question (Teambuilding Analyzer, already ruled out in
CLAUDE.md).

`casual-optimizer` take: STRUCTURAL rejection of all three (too deep for a <1-minute session),
one line, not argued further per [[rule-never-propose-removing-a-tab]].
`hardcore-spender` ranks #1 highest too (organized groups think in headcount) but doesn't care
about #3 (group clears regardless of individual dodge misses).

No new game-mechanics beliefs asserted — leaned only on MECHANICS.md's own documented
open-question placeholder and this player's own prior quoted statements.
