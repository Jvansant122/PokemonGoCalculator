---
name: six-agent-split
description: 2026-09-05 audit of the 4-to-6 agent split (engine-developer + web-developer added, site-builder narrowed to build/deploy) and CLAUDE.md's rewrite into an overseer/router role. Routing and content-fidelity verified; two real findings, otherwise a clean net win.
metadata:
  type: project
---

The main thread split the project's agents from 4 to 6 in one pass: added `engine-developer`
(implements `packages/engine/src`, absorbed CLAUDE.md's old Architecture/Fixtures sections) and
`web-developer` (implements `packages/web/src` features, absorbed `site-builder`'s old UI-feature
section), narrowed `site-builder` to build/deploy only, and rewrote CLAUDE.md around a new "Your
role" (overseer/project-designer) + "Standing decisions" (product-level calls only) + a one-line-
per-agent routing table. Audited same day; verdict: no routing overlap, real context win, two
findings below (one Broken, resolved two prior findings). See [[project-config-shape]] for
current file-by-file sizes.

**Routing — clean.** `engine-developer` (implement) vs `engine-verifier` (read-only diagnose,
hook-aware) and `web-developer` (feature) vs `site-builder` (build/deploy) each cross-reference
the other explicitly in both `description` and body ("Not for X — see Y"). No description overlap
Claude would have to guess between.

**Context cost — net win despite 2 more agents.** CLAUDE.md dropped from 17,803 bytes (~4,450
tokens, see [[project-config-shape]]) to 6,772 bytes (~1,693 tokens) — a ~62% cut — while every
non-Explore/Plan subagent still loads it, so more agents now pay a much smaller bill each.
Description-field sum across all 6 agents: 2,276 chars (~569 tokens, up from 709/~177 chars for
4 agents) — still trivial against the 15k-token warning, not a lever worth pulling. Individual
agent-body sizes are on-demand cost only: `engine-developer.md` 14,044 bytes is the largest
(absorbed the most content) but only loads when that agent actually runs.

**Content fidelity — spot-checked and accurate, with one real gap.** Verified against current
source: `DODGE_COST_SECONDS = 0.5` (breakpoints.ts:78), the `ownFastMoveDamage`/
`ownChargedDamage`/`ownTotalDamage` split (comparison.ts), `perfectlyDodgeable`/`moveIsDodgeable`
(types.ts:48, breakpoints.ts:101), the chart's dashed-past-death-point convention with
`secondsSurvivedCutoff` fed by `representativeRun.faintedAtSeconds` at the `App.tsx` call site
(not the distribution mean), and `MoveSelect`'s explicit `kind: "fast" | "charged"` prop — all
correct in `engine-developer.md`/`web-developer.md`, none garbled in the move. One thing *was*
dropped, not garbled: see [[sprite-mechanism-dropped]].

**Tool grants — sane, with one instruction/grant mismatch.** `engine-developer` and
`web-developer` both got `Read, Write, Edit, Bash, Grep, Glob`, `model: sonnet`, matching the
`data-sync`/`site-builder` precedent exactly; each grant is justified by what the body actually
does (implement + run `npm run test:engine` / implement + run the production build). One
exception: see [[web-developer-tool-mismatch]].

**Previously-flagged items resolved in this same pass** (not by request — the main thread's
rewrite happened to fix both): [[data-sync-normalize-gap]] (data-sync.md now has a "## Normalize"
section) and [[engine-verifier-hook-overlap]] (description retargeted to the hook-aware framing
recommended). [[site-builder-push-guardrail]] is untouched and still open.
