---
name: record-mechanic
description: Adds or updates an entry in MECHANICS.md — this project's dated, sourced record of how the REAL Pokémon GO game behaves and what the engine does about each mechanic. Use whenever research (by pogo-researcher, skeptic, the user, or a web lookup mid-task) establishes, corrects, or casts doubt on a real game mechanic, constant, or real-game bug — before or alongside any engine change it implies, never "later". An undocumented mechanic gets rediscovered as a bug.
---

# Record a mechanic

MECHANICS.md exists because this project has repeatedly re-derived the same real-game facts —
and once deleted four hand-authored fixtures over invented data. A mechanic that lives only in a
chat summary, a commit message, or HANDOFF.md is not recorded: it will be questioned again, and
the engine's divergence from it will surface as a "bug" someone tries to fix.

## Checklist

1. **Pick the section.** `## Combat formulas` (damage / effective stats / modifiers),
   `## Raid boss behaviour` (cycle, energy, charged-move timing), `## Dodging`, `## Move data`,
   `## Power-up (level-up) costs`. A bug in the real game goes under
   `## Known bugs in the real game` — recorded so we neither reproduce it nor mistake it for
   ours. Something contested or half-established goes in as an `### OPEN QUESTION:` or
   `### Unconfirmed:` heading, matching the ones already there. Read the neighbouring entries
   first and match their shape; don't add a new top-level section without a reason.

2. **Cite, don't assert.** Every figure carries a source and a date. Tag reliability with the
   file's own convention: `[first-party]` (Niantic), `[community-consensus]` (several
   independent community sources agreeing), `[unverified]` (single source, or contested).
   Official Niantic > Bulbapedia/GamePress/LeekDuck/Silph Road research > forum speculation.
   If the user supplied the source, say so and date it.

3. **End with the engine status, in bold, and the file.** One of
   `**Engine: implemented** (file.ts)`, `**Engine: diverges.**` (say how, and whether that's an
   accepted precision limit or a gap), or `**Engine: not modelled.**` (say why, and what it
   would take). This line is the whole point of the file — an entry without it is a wiki
   paragraph, not a record.

4. **If the entry changes what the engine should do,** hand that to `engine-developer` as a
   separate step with the MECHANICS.md entry as its citation — this skill records; it does not
   implement. If a load-bearing constant is involved (mega/primal `1.3`), re-read CLAUDE.md's
   "Standing decisions" before proposing any change.

5. **Correcting an existing entry:** edit it in place and update its date; don't append a
   contradicting entry below it. If the old value was wrong and the engine used it, say so in
   the entry and route the fix.

## Finish

Mention the entry by heading in your report so the overseer can find it. If the same research
touched HANDOFF.md or CLAUDE.md, `npm run check-docs-drift` catches the side effects (it does
not read MECHANICS.md itself).
