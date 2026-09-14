---
name: preToolUse-scratch-guard
description: 2026-09-14 — added the project's first PreToolUse hook (blocks scratch Writes under packages/engine/test/) plus a docs-drift branch in post-edit.mjs; records the deny-form choice, the Write-not-Edit scoping, and the harness trap that nearly faked a test pass
metadata:
  type: project
---

Implemented `meta-researcher`'s three second-pass proposals (its report:
`.claude/agent-memory/meta-researcher/pass_2026-09-14.md`). Config now has **three** hooks.

## Decisions worth not relitigating

- **Deny form = JSON `permissionDecision: "deny"` on stdout with exit 0**, not exit code 2.
  Verified against `code.claude.com/docs/en/hooks` myself ("PreToolUse decision control",
  page `dateModified` 2026-09-10): `permissionDecisionReason` is *shown to Claude* for a deny,
  and exit 2 "routes the same way as deny" via stderr — so both deliver the message, but exit 2
  would make an intentional block indistinguishable from the script crashing. Anything the hook
  can't parse exits 0 (a broken guard must never wedge a session).
- **`Write` only, deliberately not `Edit`.** Write is the only tool that creates a file at a new
  path, which is the actual incident vector. `Edit` needs the file to exist already, so it can't
  introduce a scratch file — matching it would only ever fire on one that already slipped in,
  obstructing cleanup instead of preventing the mess. Documented in the hook header so the next
  reviewer doesn't "fix" it by adding Edit.
- **Path matching in JS, not the frontmatter `if: "Write(glob)"` shorthand.** The `if` field is
  real (I confirmed it in the doc's hook-config table), but keeping the match in the script is
  what lets the denial name the specific allowed shapes. Accepted cost: a node spawn on every
  `Write` repo-wide (~140 ms measured) on top of the PostToolUse spawn that already happened.
- **Fodder-boss trap went into `engine-developer.md`'s body prose, not a new skill** — same
  reasoning as [[skills-frontmatter-preload]]'s engine-verifier OOM precedent. It was in that
  agent's own memory twice and still got rediscovered, because at 67 entries an index is flat
  enough to skim. Body cost 20,551 -> 22,280 chars (+8.4%), paid only when that agent runs.

## Known limits (stated in the code, don't let anyone oversell them)

- The scratch guard cannot see a file made by a shell redirect (`cat > ... <<EOF`) or
  `git checkout`. It closes the tool path, not every path.
- `check-docs-drift` parses structured things (tab counts, params, command names, agent/skill
  mentions, the skill's Step-0 table), **not free prose** — so the new post-edit branch would NOT
  have caught the stale `add-scenario-assumption` prose line that motivated it. Wiring it up is a
  free win for what it does check. A prose-count regex in `scripts/check-docs-drift.mjs` is the
  actual fix and is product-script territory, not `.claude/`.

## Harness trap that nearly produced a false PASS

A bash heredoc with a quoted `<<'EOF'` still collapsed `\\` to `\` in my test fixture, so a
"Windows absolute path" case silently became a mangled string and the hook *correctly* ignored it
— reading as a FAIL that looked like a hook bug, and which would have read as a PASS had I only
tested the allow direction. **Build hook-payload fixtures with the Write tool or
`String.fromCharCode(92)`, never a heredoc.** Extends the CRLF/heredoc lesson in
[[skills-and-gates-2026-09-08]].
