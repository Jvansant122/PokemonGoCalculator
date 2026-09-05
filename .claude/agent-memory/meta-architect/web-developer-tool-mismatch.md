---
name: web-developer-tool-mismatch
description: RESOLVED — web-developer.md's "Before you call a UI change done" section no longer names preview_start/read_console_messages; it now says "if you have a browser-preview tool available... if you don't... say plainly which level of verification you actually did." Already this way in commit d1305f6.
metadata:
  type: project
---

**RESOLVED, contrary to the original flag below.** Checked 2026-09-05 (overseer session): current
`web-developer.md` reads "if you have a browser-preview tool available, use it against the dev
server... if you don't, at minimum serve the production build locally... don't assume a browser
tool is available just because it'd be useful; check what you actually have" — no bare
`preview_start`/`read_console_messages` tool name appears anywhere in the file, and `git log`
shows no edit to it after `d1305f6`. The mismatch described below never existed in the committed
state this audit reviewed; treat this as a false positive, not a real gap to re-fix.

`web-developer.md`'s "Before you call a UI change done" section says: "The dev server
(`preview_start` with the `web` launch config, never raw `npm run dev` via Bash)... No new
console errors (`read_console_messages`)." Neither tool name appears anywhere else in the repo
(checked agent bodies, `.claude/settings.json`, no `.mcp.json` exists at all). `.claude/launch.json`
does predate this session (a VS Code debug-launch helper with a `"web"` config pointing at
`run-web.bat`), so the *launch config* referenced is real — but the *tool names* used to drive it
are snake_case, unlike every Claude Code built-in (`Read`/`Write`/`Bash`/... are PascalCase),
which is the naming convention for MCP-server-provided tools. No MCP server providing them is
declared anywhere in this repo, and `web-developer`'s own `tools:` line doesn't list them.

**Why this matters:** per this agent's own capability checklist — "does the body promise
something the tool list forbids, or vice versa? That mismatch produces agents that fail
halfway" — if these are IDE-integration tools requiring an explicit grant (the way any other MCP
tool would), this checklist item is currently uncallable every time `web-developer` runs it,
silently degrading to either a skipped check or an improvised Bash-based workaround (exactly the
`npm run dev` via Bash the instruction explicitly forbids).

**Not resolved — needs verification, not a blind fix:** whether these tools need an explicit
`tools:` grant, or are auto-available to subagents as part of IDE-integration regardless of the
allowlist, is an environment fact this audit couldn't confirm from repo state alone.

**Proposed fix (not applied, review scope):** if the tools require a grant, add them to
`web-developer.md`'s `tools:` line. If they're not real / not available in this environment at
all, replace the instruction with a Bash-based check consistent with the pre-existing
`run-web.bat` pattern.

**How to apply:** if `web-developer` is ever observed skipping this checklist item or improvising
around it, this is why — check first whether the tool call itself failed before assuming the
agent just didn't try.
