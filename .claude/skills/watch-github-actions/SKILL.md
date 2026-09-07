---
name: watch-github-actions
description: Polls a GitHub Actions workflow run to completion without hanging the session. Use whenever you need the status or conclusion of a CI/deploy run — after a push, when asked "did the deploy pass?", "is CI green?", "watch the build", or when checking the GitHub Pages deploy for this repo. Always use this instead of hand-writing a curl poll loop, a `while`/`sleep` loop, or a raw Actions API call, because the unauthenticated API budget is 60 requests/hour and a naive loop silently spins for 15+ minutes once it is spent.
---

# Watch a GitHub Actions run

Never hand-roll this. Use `scripts/gha-watch.mjs`, which is bounded, budget-aware, and always
exits with a meaningful code.

## Why the naive version hangs

The GitHub REST API allows **60 requests/hour/IP unauthenticated**. When that budget is gone,
every request returns **HTTP 403** with a JSON body like `{"message": "API rate limit exceeded"}`.
That body has no `status` field — so a loop waiting for `status == "completed"` never matches and
keeps polling against a wall until the quota resets. That is the 15+ minute hang, and it is not a
slow deploy: the deploy has usually long since finished.

Two consequences that shape everything below:

- **A non-200 is a decision point, not "not done yet."** Anything that polls this API must check
  the HTTP status, not just grep the body.
- **The budget is shared across everything on this IP and it is small.** Every raw `curl` to
  `api.github.com` — including a quick one-off status check — spends from the same 60. Bursty
  polling is what exhausts it. `GET /rate_limit` is the exception: it is free and never counts.

## Run it

Always in the **background**, so the session stays interactive. The script exits on its own at a
terminal state, so background Bash gives exactly one completion notification.

```bash
export PATH="/c/Program Files/nodejs:$PATH"; node .claude/skills/watch-github-actions/scripts/gha-watch.mjs --workflow deploy.yml
```

Use the `Bash` tool with `run_in_background: true`, then read the output file when notified.
Do **not** run it in the foreground, and do **not** wrap it in a `sleep` loop — it already
schedules its own polling.

Defaults: repo from `git remote get-url origin`, workflow `deploy.yml`, commit `HEAD`, 600s
deadline, poll interval sized to the remaining budget.

Useful flags:

- `--workflow FILE` — **always scope this.** This repo has two workflows (`deploy.yml` and
  `check-mega-gaps.yml`); an unscoped query can hand you the wrong run and the wrong conclusion.
- `--sha <sha>` — commit to match. `HEAD` (default) is right after a push. Use `any` to just
  inspect the latest run of that workflow without pushing anything.
- `--timeout SEC` — hard deadline, default 600. The effective bound is `timeout` plus at most one
  poll interval, since the deadline is checked between polls.
- `--json` — one JSON object per line, if you want to parse rather than read.
- `--help` — full flag list.

If per-state-change notifications are wanted rather than a single completion, the same command
works as a `Monitor` command (it prints one line per state change and exits at the terminal
state). Background Bash is the better default.

## Act on the exit code

| Code | Meaning | What to do |
| :--- | :--- | :--- |
| `0` | Run completed, conclusion `success` | Report it. This is the only "deployed." |
| `1` | Run completed, conclusion was **not** success | Report the conclusion and the run URL plainly. Do not describe a pushed-but-failed deploy as shipped. |
| `2` | Deadline reached, run still going | Not a failure and not a hang. Say it is still running, give the URL, and re-run the command if it should keep being watched. |
| `3` | Cannot poll | Read the message — it distinguishes the causes below. Do **not** retry in a loop. |

Exit `3` covers rate limit exhausted (the message gives the reset time — wait for it, or open the
run in a browser; do not keep hammering), the run never appearing for that SHA within the grace
window (check the push actually landed and that the workflow triggers on it), a 404 workflow
filename, and the API being unreachable.

## If the budget keeps running out

Set `GITHUB_TOKEN` (or `GH_TOKEN`) in the environment and the script uses it automatically,
raising the limit to 5000/hour. It only ever sends the token to `api.github.com` and never prints
it. This is optional — ask the user rather than going looking for a credential to use.

## Verifying changes to the script

The API base is overridable via `GHA_WATCH_API_BASE`, so the anti-hang guarantees can be
exercised against a local stub without spending real quota. If you change the polling logic,
re-prove all four: deadline reached while still running (exit 2), run never appears (exit 3),
run concludes non-success (exit 1), and rate-limited mid-poll (exit 3).

One Windows-specific trap is already handled and should not be reintroduced: calling
`process.exit()` directly after a `fetch` trips a libuv assertion and reports **127** instead of
the intended code, which would silently break every exit-code branch above. The script closes
undici's keep-alive pool and sets `process.exitCode` instead — see `finish()`.
