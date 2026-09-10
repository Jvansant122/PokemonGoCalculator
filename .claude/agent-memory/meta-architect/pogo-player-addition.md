---
name: pogo-player-addition
description: 2026-09-10 — added pogo-player as the 10th agent (user-proxy/product critic), how it was separated from pogo-researcher and skeptic, and the deliberate tool/write restrictions.
metadata:
  type: project
---

**Added 2026-09-10** at the user's direct request: `.claude/agents/pogo-player.md`, a user-proxy /
product critic. It answers "would a player want this?" — the one question no other agent covers
(the rest all answer some form of "is this correct?"). Remit: new feature ideas, existing tab
output, wording/framing, and prioritisation among candidates.

**Why:** the tool is built by agents that verify truth and correctness; nothing checked
desirability. See [[project-config-shape]] for the wider config shape.

**How to apply / decisions made, don't relitigate:**

- **Routing separation is the whole risk here.** Both neighbours overlap on mechanism:
  - vs `pogo-researcher`: researcher establishes what is TRUE with citations; pogo-player only
    reacts and must label any mechanic it leans on as "a player's belief, to be verified" and hand
    it back. **It has no `WebFetch`/`WebSearch` on purpose** — that's the structural guard against
    it becoming a second researcher and inventing plausible mechanics (the hand-authored-fixture
    failure mode wearing a friendlier face).
  - vs `skeptic`: both drive the live app, neither fixes. `skeptic` = is the number **wrong**;
    `pogo-player` = is a **right** number **useful**. Correctness vs desirability.
  - I added a reciprocal clause to `pogo-researcher`'s and `skeptic`'s own descriptions
    (+169 chars combined) so the boundary is symmetric rather than only asserted from one side.
- **Tools:** the browser subset `skeptic` has, MINUS `javascript_tool`,
  `read_console_messages`, `read_network_requests` — "if a player can't see it, neither can you."
  No `Bash` (would drift into verification). `Read/Grep/Glob` for orienting only.
  `Write` for `.claude/agent-memory/pogo-player/` only, `disallowedTools: Edit`, matching the
  house pattern used by `skeptic`/`code-simplifier`/`pogo-researcher`.
- **It must not edit `IDEAS.md`.** Prioritisation is opinion and IDEAS.md is shared state — it
  proposes a reordering in its report instead. Same reasoning as the memory-only `Write` grant.
- **Four archetypes**, differentiated by the four axes that actually change an answer for this
  tool (dust/candy bank, raid access, session length, model trust) rather than flavour text.
  `real-users` is the only evidence-backed one; every bullet carries a `[sourced: ...]` or
  `[inference]` tag and the composites are labelled "COMPOSITE. Not an observed user."
- **Archetype growth goes to memory, not the body.** The user is sending more message logs.
  `.claude/agent-memory/pogo-player/archetype-real-users.md` is the designated growth surface
  because **memory is read at run time while an agent body only reloads on session restart**.
  Don't let enrichment turn into agent-body edits.
- **Avoided fossilization** ([[agent-doc-fossilization]]): the "15s wipe-and-rejoin" preference is
  written as a *user choice*, not a code default — `packages/engine/src/teamRaid.ts` actually
  defaults `reviveCostSeconds`/`swapCostSeconds` to `0` on purpose (honest placeholder).

**Costs measured 2026-09-10:** body 14.8 KB (~3.7k tokens, on-demand only). Description 585 chars,
tied with `code-simplifier` for longest. All 10 descriptions total 4,853 chars (~1.2k tokens) —
still far under the ~15k-token warning, so descriptions remain the wrong lever here.

**Docs kept in sync:** CLAUDE.md "nine" → "ten" and a 5-line routing bullet placed between
`pogo-researcher` and `skeptic` (deliberately adjacent to the two it must be told apart from).
`npm run check-docs-drift` passes: "all 10 agents are routed in CLAUDE.md".

Heredoc failed again on a ~15 KB single file (`unexpected EOF`) — the lesson in
[[skills-and-gates-2026-09-08]] holds: use the Write tool for a whole agent/skill file, and a
Node script with explicit CRLF preservation for surgical edits to existing docs.
