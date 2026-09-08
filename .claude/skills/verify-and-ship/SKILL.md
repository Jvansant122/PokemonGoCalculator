---
name: verify-and-ship
description: Runs this repo's single local gate (`npm run verify` — all three vitest suites, type-checks, lint, every checker, production build) before committing/pushing a change to the Pokémon GO Scenario Comparator, then watches the GitHub Pages deploy through to completion. Use whenever you're about to commit and push, whenever the user asks to "verify", "ship", "deploy", or "make sure everything passes", or as the last step after any code change the user has approved for commit — don't invent an ad-hoc subset of test/build commands when this one already exists.
---

# Verify and ship

Each step gates the next — don't skip ahead on a failure, and don't declare success until the
deploy workflow itself reports `success`. A green local build with a red deploy is not "shipped."

## Steps

1. **`npm run verify`** from the repo root. It runs `test` (engine + web + scripts vitest) →
   `typecheck` (engine, web, scripts) → `lint` → `check` (scenario round-trip, raid-history
   sources, mega gates, docs drift) → the production web build, stopping at the first failure.
   CI's `verify` job runs the identical command on every push and pull request, so a local pass
   is a real prediction of a green deploy. Node is on PATH via the SessionStart hook; if `npm -v`
   fails anyway, `export PATH="/c/Program Files/nodejs:$PATH"` and retry once, then stop and
   report.

   If a step is red, fix the cause rather than routing around it. Don't weaken an assertion to
   make a test pass without understanding why it broke — engine pins are regression gates. A type
   error in `packages/web` naming an `@pogo-analyzer/engine` export usually means the engine's
   surface changed and every consumer needs the update, not just the one `tsc` pointed at. A
   `check-docs-drift` failure names the stale doc — fix the doc, not the checker. A chunk-size
   warning from the build is expected; an actual build error is not.

2. **`npm run verify:full`** after any UI change — `verify` plus the Playwright suite
   (`npm run test:e2e`, against the built `dist`). Skip it for engine-only, data-only, or
   docs-only changes, and say that you did.

3. **Commit** — only if the user has actually asked for a commit (never assume). Follow the
   project's git conventions (the top-level Claude Code instructions for message/attribution
   format), not this skill's.

4. **Push** — `git push origin main`, only with explicit user go-ahead; `.claude/settings.json`
   asks before any push regardless. This skill doesn't grant permission to push, it describes
   what to do once permission exists.

5. **Watch the deploy** with the **`watch-github-actions`** skill — never a hand-written poll
   loop. The unauthenticated API budget is 60 requests/hour, and once it's spent every request
   is a 403 with no `status` field, which a naive loop spins on for 15+ minutes. Scope to
   `deploy.yml`; this repo's other workflow, `check-mega-gaps.yml`, will otherwise hand you the
   wrong run:

   ```bash
   node .claude/skills/watch-github-actions/scripts/gha-watch.mjs --workflow deploy.yml
   ```

   Run it with `run_in_background: true` so the user can still interject. Only exit code `0`
   means deployed — read that skill for what `1`/`2`/`3` mean. If the conclusion isn't
   `success`, say so plainly; "pushed" is not "deployed."

## What "done" looks like

Report `verify`'s result (and `verify:full`'s, if run), whether a commit and push happened, and
the deploy conclusion — not just "all good." If a step was skipped because it wasn't applicable,
say so explicitly rather than silently omitting it.
