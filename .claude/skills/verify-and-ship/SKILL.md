---
name: verify-and-ship
description: Runs this repo's full verification pipeline (engine tests, type-checks, web build) before committing/pushing a change to the Pokémon GO Scenario Comparator, then watches the GitHub Pages deploy through to completion. Use this whenever you're about to commit and push a change to this repo, whenever the user asks to "verify", "ship", "deploy", or "make sure everything passes" before pushing, or as the last step after any code change the user has approved for commit — don't invent a different ad-hoc sequence of test/build commands when this one already exists.
---

# Verify and ship

This is the exact sequence that's been run by hand after every commit in this repo so far. Each
step gates the next — don't skip ahead on a failure, and don't declare success until the deploy
workflow itself reports `success`. A green local build with a red deploy is not "shipped."

## Why this order matters

Type-checking catches interface drift the tests won't (e.g. a field renamed in one package but
not updated at a call site in the other, since `packages/web` imports `packages/engine` straight
from its TS source). The production build is a separate, stricter pass from either (Vite/Rollup
can fail on things `tsc --noEmit` alone doesn't catch, and it's the actual artifact GitHub Pages
serves). Pushing before any of these are clean just moves the failure to CI, where it's slower to
diagnose and — worse — is live-deployed if it happens to pass a step you skipped locally.

## Steps

1. **Node on PATH.** Fresh shell processes in this environment often don't have Node/npm on PATH.
   Bash: `export PATH="/c/Program Files/nodejs:$PATH"`. PowerShell:
   `$env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")`.
   If `node -v` or `npm -v` fails after this, stop and report it — don't guess at another fix.

2. **Engine tests** — from the repo root: `npm run test:engine`. This is the fast, deterministic
   gate; if anything here is red, stop. Do not proceed to type-checking or the build with failing
   tests, and do not weaken an assertion to make it pass without understanding *why* it broke —
   see CLAUDE.md's "single most important invariant" framing for how easy it is to introduce a
   subtle regression here that looks like an unrelated failure elsewhere.

3. **Type-check both packages** — `npx tsc --noEmit -p tsconfig.json` from inside
   `packages/engine`, then again from inside `packages/web`. Both must be silent (no output). A
   type error in `packages/web` referencing an `@pogo-analyzer/engine` export is usually a sign
   `packages/engine`'s public surface changed without updating every consumer — grep for the
   symbol across `packages/web/src` rather than just patching the one error tsc points at first.

4. **Production build** — `npm run build --workspace=packages/web`. This must succeed (a chunk
   size warning is fine and expected; an actual build error is not). This is the step that
   verifies the Vite `base` path and the `data/normalized/*.json` imports resolve correctly for
   the real GitHub Pages deploy, not just local dev.

5. **Commit** — only if the user has actually asked for a commit (never assume). Follow the
   project's own git conventions (see the top-level Claude Code instructions for commit message
   / attribution format) rather than this skill's.

6. **Push** — `git push origin main`. Again, only with explicit user go-ahead for a push, same as
   any other git-safety rule already in force for this session — this skill doesn't grant new
   permission to push, it just describes what to do once permission exists.

7. **Watch the deploy.** This repo has no `gh` CLI installed, but it's a public repo so the
   GitHub REST API works unauthenticated:
   ```bash
   curl -s "https://api.github.com/repos/Jvansant122/PokemonGoCalculator/actions/runs?per_page=1"
   ```
   Poll this every ~15s (a short `sleep 15` loop, or the `Monitor`/`ScheduleWakeup` tooling if
   available) until the run whose `head_sha` matches your just-pushed commit shows
   `"status": "completed"`, then report its `"conclusion"`. A run can sit at `queued` for a bit
   before moving to `in_progress` — that's normal, keep polling rather than assuming it's stuck.
   If `conclusion` isn't `"success"`, say so plainly; don't report "pushed" as if that means
   "deployed."

## What "done" looks like

Report the outcome of each of the four local gates (tests/typecheck×2/build) and the final deploy
conclusion — not just "all good." If you skipped a step because it wasn't applicable (e.g. no
commit was requested), say so explicitly rather than silently omitting it.
