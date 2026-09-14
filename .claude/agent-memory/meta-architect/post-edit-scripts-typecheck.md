---
name: post-edit-scripts-typecheck
description: 2026-09-14 — post-edit.mjs's web branch now runs typecheck:scripts as well as typecheck:web; records why the scope stayed narrow and the two-direction verification rig (stub-npm routing matrix, worktree+junction incident repro) that proved it
metadata:
  type: project
---

Implemented the `meta_ideas.md` 2026-09-14 proposal. `post-edit.mjs`'s `isWebSrc` branch pushes
**two** checks now: `npm run typecheck:web` then `npm run typecheck:scripts`.

## Why, and why only that one

`packages/web/tsconfig.json` never includes `scripts/` as an entry point, so `typecheck:web` is
structurally blind to `scripts/run-scenario.ts`'s ~25 imports out of `packages/web/src` (incl.
`.tsx` views — `tsconfig.scripts.json`'s header says it sets `jsx` *for exactly that*). A rename
on the web side therefore type-checks clean and lints clean, and only surfaces as an ESM runtime
error under `test:scripts` (the `blockedCandidateSentence` incident, `ef4256e`).

**Not** the full `npm run typecheck`: `typecheck:engine`/`:engine-test` cover `packages/engine`,
which a `packages/web/src` edit cannot break — `tsc` runtime for zero marginal detection. Don't
widen it later without a new incident.

Measured cost: `typecheck:scripts` 5.7 s, `typecheck:web` 6.4 s, so the web branch is ~12 s against
the hook's 120 s timeout. Not close.

**Known limit, stated honestly:** editing `scripts/run-scenario.ts` ITSELF still triggers no check
(`scripts/` matches no branch). The guard covers the direction the incident came from, not both.

## The verification rig — reuse it

1. **Routing matrix without running the real checks.** Put a stub `npm.cmd` on PATH that echoes
   its args and `exit /b 1`; the hook then collects every selected check into its stderr report, so
   exit code + stderr *is* the branch-selection readout. 12 payloads in ~1 s instead of minutes of
   real `tsc`. Payload JSON must be built by `JSON.stringify` in a `.mjs` file, never a heredoc —
   see [[preToolUse-scratch-guard]] for the backslash trap that nearly faked a pass.
2. **Incident repro in an isolated worktree.** `git worktree add --detach <scratch> HEAD` gives a
   clean baseline free of a concurrent agent's in-flight edits. It has no `node_modules`: create
   **junctions** with PowerShell `New-Item -ItemType Junction` (bash `cmd //c mklink /J` fails —
   MSYS mangles `/J`). Tear down by `cmd /c rmdir` on each junction FIRST (unlinks without
   following), then `git worktree remove --force`; deleting the worktree with junctions live would
   walk into the real `node_modules`. Note `packages/*/node_modules` here contain only a hidden
   `.vite` dir, so a bare `ls | wc -l` of 0 is normal, not evidence of damage.
3. Prove the **before** half too: run `git show HEAD:.claude/hooks/post-edit.mjs` against the same
   break. It exited 0 where the edited hook exits 2 — that contrast is the whole claim.

## Docs touched in the same pass

`CLAUDE.md:406` now names both `npm run typecheck:web` **and** `npm run typecheck:scripts` (the
per-file-class enumeration would otherwise have become the exact drift its own fourth hook branch
exists to catch), and `settings.json`'s `PostToolUse` `statusMessage` says "web+scripts tsc".
`check-docs-drift` green after both.
