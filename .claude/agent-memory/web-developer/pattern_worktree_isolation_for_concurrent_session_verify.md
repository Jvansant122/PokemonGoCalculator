---
name: pattern_worktree_isolation_for_concurrent_session_verify
description: How to run a clean npm run verify/build when a concurrent, unrelated engine-developer session has left packages/engine transiently broken in the shared worktree — a real working technique, plus a junction pitfall that silently defeats it.
metadata:
  type: project
---

This repo runs multiple agent sessions against ONE shared git worktree (see
`feedback_concurrent_sessions_shared_worktree` memory). 2026-09-10/11: while doing a `packages/web`-only task, a
concurrent engine-developer session had `packages/engine/src/{teamScenario,teamRaid,simulate,types,rosterPlanner}.ts`
mid-edit and uncommitted — `npm run typecheck`/`lint`/`build` all failed with errors in files I never touched
(`rosterPlanner.ts` missing a property, an unused var, etc.), transiently, as their session progressed through
several intermediate states before landing on a coherent one.

**The fix that actually worked** — an isolated `git worktree` checked out at `HEAD` (the last COMMIT, unaffected
by anyone's uncommitted changes), with only MY OWN modified/new files copied in on top:

```bash
git worktree add <scratch-dir> HEAD
# then copy only the files I actually changed into <scratch-dir>, same relative paths
```

**Pitfall: do NOT junction the root `node_modules`.** My first attempt used `cmd.exe /c mklink /J` (directory
junction, no admin needed on Windows) to point the worktree's `node_modules` at the real repo's — fast, but
this repo's npm-workspace `node_modules/@pogo-analyzer/{engine,web}` entries are themselves SYMLINKS pointing at
the absolute path of the REAL repo's `packages/engine`/`packages/web` — so `tsc` silently resolved straight
through the junction back into the live, dirty original directory, completely defeating the isolation (the
error paths literally showed `../../../../Documents/PokemonGoCalculator/packages/engine/...`). Worse: since a
junction makes the target directory's CONTENTS live at the junction point, `rm -rf` (not `rmdir`) on it would
have deleted files in the ORIGINAL repo's `node_modules` — I avoided this by removing junctions with
`cmd.exe /c rmdir <path>` (removes only the reparse point) instead of `rm -rf`. **Undo any accidental junction
with `rmdir`, never `rm -rf`.**

**What actually worked**: a real `npm install --prefer-offline --no-audit --no-fund` inside the throwaway
worktree — took ~5 seconds (local npm cache, no network), and correctly created workspace symlinks pointing at
the WORKTREE's own `packages/*`, fully isolating it from the live repo. From there, `npm run typecheck` / `lint`
/ `test` / `build` all ran clean against a state containing ONLY my own changes plus the last real commit —
proving my changes were correct independent of whatever state the concurrent session's file was in at that
moment.

One extra step needed when MY change genuinely depends on the concurrent session's in-flight work (here:
`TeamRaidView.tsx` needed the engine's newly-added `TeamScenario.showDetailedAssumptions: boolean` field to
exist) — reviewed their diff first (`git diff packages/engine/src/teamScenario.ts`), confirmed it was a clean,
purely-additive field with no other side effects, then copied JUST that one file (and its matching test file)
into the isolated worktree too, rather than the whole dirty `packages/engine`. Don't blindly copy everything —
copy only the specific file(s) your own change actually requires, after checking the diff is safe to lift.

Afterward: `git worktree remove --force <scratch-dir>` can fail with "Filename too long" on Windows for a deep
`node_modules` tree — `cmd.exe /c rmdir /s /q <path>` (Windows long-path-aware) deletes it, then
`git worktree prune` clears git's own stale registration.

Once the concurrent session settled (committed or reached a stable intermediate state — checked periodically
via `git status --porcelain`), a plain `npm run verify` in the SHARED worktree went green on its own; the
isolated-worktree run was what let me confirm correctness WHILE their session was still mid-flight, without
waiting idle or (worse) trying to fix their in-progress file myself.
