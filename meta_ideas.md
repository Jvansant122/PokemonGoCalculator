# meta_ideas.md — proposed tooling and setup ideas, awaiting a decision

Ideas about the **machinery** this project is built with — subagents, skills, hooks, `CLAUDE.md`,
`.claude/settings.json`, the checkers in `scripts/` — not about the product. Produced by the
`scout-meta-ideas` skill, which runs a `meta-researcher` pass and writes the result here.

Nothing in this file is committed work, and nothing here should be built because it is written
down. An entry is a proposal until the user says otherwise.

## How this file differs from its neighbours

`CLAUDE.md`'s "For session continuity" is emphatic about keeping the root docs in their lanes, and
a fourth idea-shaped file is exactly the kind of thing that blurs them. So, precisely:

| File | What lives there |
| :--- | :--- |
| `IDEAS.md` "Open" | **Product** features we would build, unscheduled. What the app does. |
| `IDEAS.md` "Unmodelled real mechanics" | Product features blocked on evidence that does not exist. |
| **`meta_ideas.md`** (this file) | **Tooling/setup** ideas, proposed and **awaiting a decision**. The tooling analogue of `IDEAS.md` "Open". |
| `REJECTED_IDEAS.md` | Declined, product or tooling, with the reasoning that killed it. Its "Tooling and process rejections" section (#15-22) is where an entry here goes when it is declined. |

The axis is **product vs machinery**; the axis between this file and `REJECTED_IDEAS.md` is
**undecided vs decided-no**. An item never sits in two of them at once.

This file is also the **exclusion ledger**: `scout-meta-ideas` reads it, plus
`REJECTED_IDEAS.md`, and passes both into the next `meta-researcher` prompt so a pass mines new
ground. That is why declined and zero-result entries stay here as stubs rather than being deleted.

## Status vocabulary

- **Proposed** — returned by a pass, no decision yet. The default.
- **Accepted** — the user said build it; not built yet. `meta-architect` owns the edit.
- **Implemented** — shipped. The entry shrinks to a line with its date; the detail lives in git
  history and `HANDOFF.md`. It stays so a later pass doesn't re-propose it.
- **Declined** — moved to `REJECTED_IDEAS.md`'s "Tooling and process rejections" with its
  reasoning. Leave a one-line stub here pointing at the entry number.
- **Zero-result pass** — not an idea. A dated record that a pass found nothing, so the next
  invocation doesn't re-mine an exhausted seam.

Entries are newest first and cited by date + title. Unlike `IDEAS.md`, they are not numbered —
a declined one gets its permanent number when it lands in `REJECTED_IDEAS.md`.

---

## 2026-09-14 — Prose count-word regex for `check-docs-drift`, plus a `new-tab` checklist line

- **Evidence:** `scripts/check-docs-drift.mjs` has count-word regexes for `CLAUDE.md`'s
  `has **N** project-specific subagents` / `skills` phrases, and it parses the
  `add-scenario-assumption` Step-0 **table**, but nothing checks a skill's own **prose** count
  words. Two live ones sit in `add-scenario-assumption/SKILL.md` today: "There are **seven** tabs"
  and "It covers **all seven** tabs". A prose line of exactly this shape went stale once — a
  "covers only six tabs" claim that the table check could not see and that, per `HANDOFF.md`
  2026-09-12, "went unnoticed until a human read it". Paired with it: a line in `new-tab`'s Docs
  checklist (currently step 11, which covers the Step-0 table but not the prose around it) telling
  whoever ships a tab to bump the skill prose count words too.
- **Ongoing context cost:** none. It is script-internal, runs inside `npm run check`, and loads
  into no agent's context. The carrying cost is one more regex to keep honest.
- **Owner:** not `meta-researcher` (out of its remit, and it said so), and arguably not
  `meta-architect` either, since `scripts/` is product code rather than `.claude/` config. Needs
  an explicit assignment — most likely the user directly.
- **Status:** Accepted (2026-09-14), not yet implemented.

## 2026-09-14 — Zero-result pass

The fourth pass of the manual 2026-09-12 → 2026-09-14 loop returned no recommendations. The three
passes before it produced `REJECTED_IDEAS.md` #15-22 and the accepted item above, so that seam —
platform CHANGELOG through 2.1.270, plus evidence-mining two days of `HANDOFF.md` and agent memory
— is worked out. A later pass should start from fresh evidence (new incidents, a newer CHANGELOG)
rather than re-reading the same surface.

- **Status:** Zero-result pass.
