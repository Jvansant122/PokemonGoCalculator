---
name: verification-without-browser-tool
description: What "verify it actually works" looks like in a session with no browser-preview tool available — build+serve+node-level checks, plus scratch scripts against engine functions
metadata:
  type: project
---

This agent's declared tool grant is Read/Write/Edit/Bash/Grep/Glob — no browser tool, despite a
`PostToolUse` hook message mentioning `preview_start`/a "Browser pane" after edits. That hook
message is generic environment boilerplate, not a real available tool — check the actual function
list given at the start of the conversation before assuming a preview tool exists.

**Verification ladder used absent a browser tool** (2026-09-05, wiring
[[wiring-persists-through-faint]]):
1. `npx tsc --noEmit` in `packages/web` (catches shape mismatches immediately).
2. `npm run build --workspace=packages/web` (real production build, not just typecheck).
3. `npm run test:engine` (confirms untouched engine still green — useful even when the task is
   UI-only, since it's cheap and rules out any accidental engine edit).
4. `npx vite preview` served in background (write its log to the scratchpad dir, not `/tmp` —
   `/tmp` write failed with a permission error on this Windows/Git-Bash setup), then `curl` the
   root and the built JS/CSS asset paths for 200s, and `node --check` the built JS bundle for
   syntax validity. This confirms the app *loads* without a 404/error but does NOT confirm no
   runtime console error — say that limitation explicitly in the report rather than implying full
   verification.
5. For logic that's hard to eyeball (a formula combining two optional params in a non-obvious
   way), write a tiny throwaway `.ts` script mirroring the exact call shape from the component,
   copy it briefly into the relevant package's `src/` dir (so relative imports work) and run it
   with `node --experimental-strip-types` (Node 24 supports this) — then delete it and confirm via
   `git status` that no trace remains. This is a legitimate way to numerically prove a formula's
   behavior when you can't click through the actual chart.

Always kill the background `vite preview` process before finishing (find it via
`Get-NetTCPConnection -LocalPort <port>` in PowerShell) — don't leave it running.
