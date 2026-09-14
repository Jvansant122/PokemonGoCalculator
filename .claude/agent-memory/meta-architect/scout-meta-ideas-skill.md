---
name: scout-meta-ideas-skill
description: 2026-09-14 — 8th skill added, the user-invocable loop that runs meta-researcher and accumulates proposals in root-level meta_ideas.md; why a skill not a script, the "up to three" wording, and the lane argument for a 4th idea-file.
metadata:
  type: project
---

`.claude/skills/scout-meta-ideas/` (4.0 KB body, 458-char description — below the 511-char mean of
the other seven) + root-level `meta_ideas.md`. Built at the user's direction, not proposed by me.

**Why a skill and not a script, settled — don't relitigate.** A shell script cannot launch a
subagent; the Agent tool is the model's, not the shell's. This is the case `REJECTED_IDEAS.md` #22
was rewritten on 2026-09-14 to explicitly endorse: single-purpose is fine when the user invokes it
by name. #22 only rejects a SHORT fact relevant on essentially every run of one agent.

**Two wordings that are load-bearing, both the user's call:**
- "**Up to three** proposals — never exactly three." `meta-researcher.md` caps at three and names
  padding as its characteristic failure mode, so a prompt asking for three manufactures three.
- **Zero is a valid outcome and must be logged with its date.** Without a zero-result entry the
  next invocation re-mines an exhausted seam at the cost of a full agent pass. The 4th manual pass
  of 2026-09-12 → 09-14 correctly returned zero; that is seeded in `meta_ideas.md`.

**`meta_ideas.md` is a 4th idea-file, deliberately.** Lane: product vs machinery against
`IDEAS.md`; undecided vs decided-no against `REJECTED_IDEAS.md`. It doubles as the exclusion
ledger the skill reads back in, which is why declined/zero-result entries stay as stubs. Both the
file and `CLAUDE.md`'s "For session continuity" bullet state this — if a future pass proposes
merging it into `IDEAS.md`, the ledger role is the reason not to.

Seeded with one Accepted-but-unbuilt item: a prose count-word regex for
`scripts/check-docs-drift.mjs` (it checks CLAUDE.md count words and the skill's Step-0 *table*,
but no skill's own *prose* count word — two live "seven" claims sit in
`add-scenario-assumption/SKILL.md`) plus a `new-tab` checklist line. **Owner unassigned:**
`scripts/` is product code, outside both `meta-researcher`'s remit and my config-only boundary.

Confirmed this session: `post-edit.mjs` now DOES fire `check-docs-drift` on `.claude/`+CLAUDE.md
edits (pass 2's recommendation #3 landed) — it caught the missing CLAUDE.md mention mid-edit.
`check-docs-drift` counts skills by directory and requires the `has **N** project-specific skills`
count word plus a backticked mention of every skill name; both updated to eight.
