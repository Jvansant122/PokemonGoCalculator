#!/usr/bin/env node
/**
 * gha-watch — bounded, budget-aware poller for a GitHub Actions workflow run.
 *
 * Exists because the naive poll loop hangs. The unauthenticated GitHub API allows
 * 60 requests/hour/IP. Once that budget is spent, every request returns HTTP 403 with
 * a body that has no `status` field — so a loop waiting for `status == "completed"`
 * never matches and spins until the quota resets. That is the ~15-minute hang.
 *
 * Guarantees:
 *   - Never runs past --timeout. Always exits, always prints why.
 *   - Preflights the budget via /rate_limit (that endpoint is free — it does not
 *     consume core quota) and refuses to start a poll it cannot afford.
 *   - Sizes the poll interval to the remaining budget instead of a fixed sleep.
 *   - Treats any non-200 as a decision point, never as "not done yet".
 *
 * Exit codes: 0 success | 1 run concluded non-success | 2 timed out still running
 *             3 cannot poll (no budget / bad config / API unreachable)
 */

import { execSync } from 'node:child_process';

// Overridable so the anti-hang guarantees (timeout, run-never-appears, rate-limit
// bail-out) can be exercised against a local stub without spending real API quota.
const API = process.env.GHA_WATCH_API_BASE || 'https://api.github.com';
const UA = { 'User-Agent': 'gha-watch', Accept: 'application/vnd.github+json' };

const USAGE = `usage: node gha-watch.mjs [options]

  --repo owner/name    default: parsed from "git remote get-url origin"
  --workflow FILE      workflow filename, default: deploy.yml  (ALWAYS scope it)
  --sha SHA            commit to match: "HEAD" (default), an explicit sha, or
                       "any" to watch the most recent run of that workflow
  --timeout SEC        hard wall-clock deadline, default 600
  --interval auto|SEC  poll interval; "auto" sizes it to the rate-limit budget
  --grace SEC          how long to wait for the run to be created, default 120
  --reserve N          API requests to leave unspent, default 3
  --json               emit one JSON object per line instead of text
`;

function parseArgs(argv) {
  const o = {
    repo: null, workflow: 'deploy.yml', sha: 'HEAD',
    timeout: 600, interval: 'auto', grace: 120, reserve: 3, json: false, help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--repo') o.repo = next();
    else if (a === '--workflow') o.workflow = next();
    else if (a === '--sha') o.sha = next();
    else if (a === '--timeout') o.timeout = Number(next());
    else if (a === '--interval') o.interval = next();
    else if (a === '--grace') o.grace = Number(next());
    else if (a === '--reserve') o.reserve = Number(next());
    else if (a === '--json') o.json = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return o;
}

const nowSec = () => Math.floor(Date.now() / 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dur = (s) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`);

let asJson = false;

// One line per event: works as a Monitor event stream and as background-Bash output.
function emit(event, msg, extra = {}) {
  if (asJson) console.log(JSON.stringify({ event, msg, ...extra }));
  else console.log(`[gha] ${msg}`);
}

function token() {
  const t = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  return t && t.trim() ? t.trim() : null;
}

async function api(path) {
  const headers = { ...UA };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(`${API}${path}`, { headers });
  const remaining = Number(res.headers.get('x-ratelimit-remaining'));
  const reset = Number(res.headers.get('x-ratelimit-reset'));
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON error page */ }
  return {
    ok: res.ok, status: res.status, body,
    remaining: Number.isFinite(remaining) ? remaining : null,
    reset: Number.isFinite(reset) ? reset : null,
  };
}

function resolveRepo(explicit) {
  if (explicit) return explicit;
  const url = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
  const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
  if (!m) throw new Error(`could not parse owner/repo from origin url: ${url}`);
  return `${m[1]}/${m[2]}`;
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  asJson = opt.json;
  if (opt.help) { process.stdout.write(USAGE); return 0; }

  const repo = resolveRepo(opt.repo);
  const matchAny = opt.sha === 'any';
  const wantSha = opt.sha === 'HEAD'
    ? execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
    : opt.sha;

  // ---- Preflight: is there budget to poll at all? /rate_limit is free. ----
  const rl = await api('/rate_limit').catch((e) => ({ ok: false, status: 0, err: e }));
  if (!rl.ok) {
    emit('error', `cannot reach the GitHub API (${rl.status || rl.err?.message}). Not polling.`);
    return 3;
  }
  const core = rl.body?.resources?.core ?? {};
  const budget = Number(core.remaining ?? 0);
  const resetAt = Number(core.reset ?? 0);
  const authed = !!token();

  if (budget <= opt.reserve) {
    const waitFor = Math.max(0, resetAt - nowSec());
    emit('blocked',
      `rate limit exhausted: ${budget}/${core.limit ?? '?'} requests left` +
      `${authed ? '' : ' (unauthenticated, 60/hr per IP)'}. ` +
      `Resets in ${dur(waitFor)} (${new Date(resetAt * 1000).toISOString()}). ` +
      `NOT polling — this is the exact condition that used to hang. ` +
      `Open the run in a browser, wait for the reset, or set GITHUB_TOKEN for 5000/hr.`,
      { remaining: budget, resetAt, waitSeconds: waitFor });
    return 3;
  }

  // ---- Size the poll interval to the budget, never below 10s. ----
  const spendable = Math.max(1, budget - opt.reserve);
  const interval = opt.interval === 'auto'
    ? Math.max(10, Math.ceil(opt.timeout / Math.min(spendable, 30)))
    : Math.max(5, Number(opt.interval));

  const runsPath = `/repos/${repo}/actions/workflows/${opt.workflow}/runs?per_page=10`;
  emit('start',
    `watching ${opt.workflow} on ${repo} for ${matchAny ? 'the latest run' : wantSha.slice(0, 7)} ` +
    `— budget ${budget}/${core.limit ?? '?'}${authed ? ' (authenticated)' : ''}, ` +
    `poll ${interval}s, deadline ${dur(opt.timeout)}`,
    { repo, workflow: opt.workflow, sha: wantSha, interval, budget });

  const started = nowSec();
  const deadline = started + opt.timeout;
  let lastState = null;
  let netFails = 0;
  let run = null;

  while (nowSec() < deadline) {
    const r = await api(runsPath).catch((e) => ({ ok: false, status: 0, err: e }));

    if (!r.ok) {
      // A non-200 is never "not done yet" — decide, don't spin.
      if (r.status === 403 || r.status === 429) {
        const waitFor = Math.max(0, (r.reset ?? 0) - nowSec());
        emit('blocked',
          `rate limited mid-poll (HTTP ${r.status}, ${r.remaining ?? 0} left). ` +
          `Resets in ${dur(waitFor)}. Stopping instead of spinning.`,
          { resetAt: r.reset, waitSeconds: waitFor });
        return 3;
      }
      if (r.status === 404) {
        emit('error', `workflow ${opt.workflow} not found on ${repo} (HTTP 404). Check the filename.`);
        return 3;
      }
      if (++netFails >= 4) {
        emit('error', `gave up after ${netFails} consecutive API failures (last: HTTP ${r.status || r.err?.message}).`);
        return 3;
      }
      emit('warn', `transient API failure (HTTP ${r.status || r.err?.message}), retry ${netFails}/4`);
      await sleep(interval * 1000);
      continue;
    }
    netFails = 0;

    // Stop before the budget hits zero rather than blundering into a 403.
    if (r.remaining !== null && r.remaining <= opt.reserve) {
      emit('blocked',
        `budget down to ${r.remaining}; stopping before it hits zero. ` +
        `Run so far: ${lastState ?? 'unknown'}${run ? ` — ${run.html_url}` : ''}.`);
      return 3;
    }

    const runs = r.body?.workflow_runs ?? [];
    run = matchAny ? runs[0] : runs.find((x) => x.head_sha === wantSha);

    if (!run) {
      const waited = nowSec() - started;
      if (waited > opt.grace) {
        emit('error',
          `no ${opt.workflow} run for ${wantSha.slice(0, 7)} after ${dur(waited)}. ` +
          `Latest run is ${runs[0] ? `${runs[0].head_sha.slice(0, 7)} (${runs[0].status})` : 'none'}. ` +
          `Did the push land, and does this workflow trigger on it?`);
        return 3;
      }
      if (lastState !== 'pending-create') {
        lastState = 'pending-create';
        emit('waiting', `run not created yet (${dur(waited)} of ${dur(opt.grace)} grace)`);
      }
      await sleep(interval * 1000);
      continue;
    }

    const elapsed = nowSec() - started;
    if (run.status === 'completed') {
      const ok = run.conclusion === 'success';
      emit(ok ? 'success' : 'failure',
        `DONE ${run.conclusion} — run #${run.run_number} after ${dur(elapsed)} — ${run.html_url}`,
        { conclusion: run.conclusion, runId: run.id, url: run.html_url });
      return ok ? 0 : 1;
    }

    if (run.status !== lastState) {
      lastState = run.status;
      emit('progress', `${run.status} — run #${run.run_number} (${dur(elapsed)}) — ${run.html_url}`,
        { status: run.status, runId: run.id, url: run.html_url });
    }
    await sleep(interval * 1000);
  }

  emit('timeout',
    `deadline of ${dur(opt.timeout)} reached; run is still ${lastState ?? 'unknown'}` +
    `${run ? ` — ${run.html_url}` : ''}. Not hanging — re-run to keep watching.`,
    { status: lastState, url: run?.html_url });
  return 2;
}

/**
 * Exiting is load-bearing here — the caller branches on the exit code — and on
 * Windows a bare process.exit() straight after a fetch trips a libuv assertion
 * ("!(handle->flags & UV_HANDLE_CLOSING)") and reports 127 instead of our code.
 * Close undici's keep-alive pool first, then let Node exit on its own; the ref'd
 * timer is a backstop so a stuck socket still can't turn this into a hang.
 */
async function finish(code) {
  try {
    const dispatcher = globalThis[Symbol.for('undici.globalDispatcher.1')];
    if (dispatcher && typeof dispatcher.close === 'function') await dispatcher.close();
  } catch { /* best effort — the backstop below still guarantees an exit */ }
  process.exitCode = code;
  setTimeout(() => process.exit(code), 2000).unref();
}

main().then(finish).catch((e) => {
  console.log(`[gha] fatal: ${e.message}`);
  return finish(3);
});
