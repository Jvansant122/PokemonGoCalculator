import {
  planRosterBudget,
  runRosterPlanner,
  type RosterBudgetInputs,
  type RosterBudgetPlan,
  type RosterPlannerInputs,
  type RosterPlannerProgressCallback,
  type RosterPlanResult,
} from "@pogo-analyzer/engine";
import type { RosterPlannerWorkerRequest, RosterPlannerWorkerResponse } from "./rosterPlanner.worker.js";

/**
 * Runs a multi-raid Power-Up Optimizer computation off the main thread via a
 * Web Worker — Phase 3b (the ranked sweep, `runRosterPlannerOffMainThread`)
 * and Phase 4 (the fixed-budget plan, `runRosterBudgetOffMainThread`) of
 * PLAN_multi_raid_roster_optimizer.md. Both functions share ONE worker file
 * (`rosterPlanner.worker.ts`, extended with a second request type rather than
 * duplicated into a second worker — per the task's own instruction) and this
 * module's own `runOnWorker` plumbing below. `inputs` must already be the
 * fully-RESOLVED, plain-JSON `RosterPlannerInputs` from
 * `run/runRosterPlanner.ts`'s `resolveRosterPlannerInputs` — this module does
 * no resolution of its own and never touches `registry.ts`. The SAME resolved
 * `inputs` object is valid for both functions (see rosterPlanner.ts's
 * `RosterBudgetInputs` doc comment for why a plain `RosterPlannerInputs`
 * value structurally satisfies it with zero remapping).
 *
 * DEGRADE GRACEFULLY (required, not optional — see the task's own
 * instruction): if `new Worker(...)` construction itself throws (a
 * restrictive embedder, or a browser with no module-worker support), OR the
 * worker script fails to load/parse at runtime (its own `onerror`), this
 * falls back to calling the matching engine function SYNCHRONOUSLY right here
 * on the main thread instead of rejecting — a broken worker must never break
 * the tab. `ranOn` on the resolved value tells the caller which path
 * actually ran, so the UI can say so honestly rather than silently pretend
 * every run was off the main thread.
 *
 * A genuine engine-level failure (a thrown validation error INSIDE
 * `runRosterPlanner`/`planRosterBudget`, reported back as a `{ type: "error" }`
 * message) is NOT treated as a worker-infrastructure failure — it's surfaced
 * as a rejection directly, since re-running the same bad `inputs`
 * synchronously would just throw the identical error again.
 *
 * PROGRESS (IDEAS.md #13): both functions take an optional `onProgress`
 * callback. On the worker path it's invoked from `{ type: "progress" }`
 * messages (rosterPlanner.worker.ts builds its own closure inside the worker
 * and posts one message per real engine-reported event — see that file's own
 * doc comment; the callback itself never crosses the postMessage boundary,
 * only already-serialized `RosterPlannerProgressEvent` payloads do). On the
 * main-thread-fallback path there's no serialization boundary at all, so
 * `onProgress` is simply spread into `inputs` and handed to the synchronous
 * engine call directly — same real per-event callback either way, not a
 * fallback-only no-op.
 */
export interface RosterPlannerWorkerRunOutcome {
  data: RosterPlanResult;
  /** "worker" = ran off the main thread as intended; "main-thread-fallback" = the worker itself couldn't be used (see this module's own top doc comment) and this call blocked the main thread instead, same as before Phase 3b. */
  ranOn: "worker" | "main-thread-fallback";
}

/** Same "worker" vs "main-thread-fallback" distinction as RosterPlannerWorkerRunOutcome, for the Phase 4 fixed-budget plan instead of the ranked sweep. */
export interface RosterBudgetWorkerRunOutcome {
  data: RosterBudgetPlan;
  ranOn: "worker" | "main-thread-fallback";
}

let requestCounter = 0;

function createWorker(): Worker | null {
  try {
    // The Vite-correct form (see the task's own instruction) — resolves
    // correctly under the production build's GitHub Pages `base` path,
    // not just in dev; confirmed against a built `dist` via Playwright
    // (see e2e/multi-raid.spec.ts).
    return new Worker(new URL("./rosterPlanner.worker.ts", import.meta.url), { type: "module" });
  } catch {
    // Worker construction itself failed (e.g. a restrictive embedder, or a
    // browser with no module-worker support) — the caller falls back
    // synchronously.
    return null;
  }
}

/**
 * Shared request/reply plumbing for BOTH worker message types — sends
 * `request`, resolves with the FIRST reply whose `requestId` matches AND
 * whose `type` is `successType` (`isSuccess` narrows it so the caller gets a
 * correctly-typed `data`), rejects on a `{ type: "error" }` reply, and
 * degrades to `fallback()` on the main thread if the worker itself can't be
 * constructed or fails before ever replying (see this module's own top doc
 * comment for why that's required, not optional).
 */
function runOnWorker<TData>(
  request: RosterPlannerWorkerRequest,
  isSuccess: (msg: RosterPlannerWorkerResponse) => msg is Extract<RosterPlannerWorkerResponse, { data: TData }>,
  fallback: () => TData,
  onProgress?: RosterPlannerProgressCallback,
): Promise<{ data: TData; ranOn: "worker" | "main-thread-fallback" }> {
  return new Promise((resolve, reject) => {
    const worker = createWorker();
    if (!worker) {
      try {
        resolve({ data: fallback(), ranOn: "main-thread-fallback" });
      } catch (fallbackErr) {
        reject(fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr)));
      }
      return;
    }

    let settled = false;

    function cleanup() {
      worker!.removeEventListener("message", onMessage);
      worker!.removeEventListener("error", onError);
      worker!.terminate();
    }

    function fallbackToMainThread() {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        resolve({ data: fallback(), ranOn: "main-thread-fallback" });
      } catch (fallbackErr) {
        reject(fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr)));
      }
    }

    function onMessage(event: MessageEvent<RosterPlannerWorkerResponse>) {
      if (event.data.requestId !== request.requestId) return;
      // Progress messages keep arriving after settlement is impossible (the
      // terminal reply always comes last), but guard anyway in case a stale
      // worker somehow outlives its own terminal reply.
      if (event.data.type === "progress") {
        onProgress?.(event.data.event);
        return;
      }
      if (settled) return;
      settled = true;
      cleanup();
      if (isSuccess(event.data)) resolve({ data: event.data.data, ranOn: "worker" });
      else if (event.data.type === "error") reject(new Error(event.data.message));
      else reject(new Error(`Unexpected worker response type "${event.data.type}" for request ${request.requestId}.`));
    }

    // A worker-level failure BEFORE it ever gets to reply (the script itself
    // failed to load/parse, or threw outside the try/catch this worker's own
    // onmessage handler wraps) — degrade to the main thread rather than
    // hanging forever waiting for a reply that will never arrive.
    function onError() {
      fallbackToMainThread();
    }

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage(request);
  });
}

function isRunResult(msg: RosterPlannerWorkerResponse): msg is { type: "result"; requestId: string; data: RosterPlanResult } {
  return msg.type === "result";
}

function isPlanResult(msg: RosterPlannerWorkerResponse): msg is { type: "planResult"; requestId: string; data: RosterBudgetPlan } {
  return msg.type === "planResult";
}

/** The ranked, whole-pool sweep (`runRosterPlanner`) — Phase 3b. See this module's own top doc comment, including the PROGRESS section for `onProgress`. */
export function runRosterPlannerOffMainThread(
  inputs: RosterPlannerInputs,
  onProgress?: RosterPlannerProgressCallback,
): Promise<RosterPlannerWorkerRunOutcome> {
  const requestId = `roster-${++requestCounter}`;
  return runOnWorker({ type: "run", requestId, inputs }, isRunResult, () => runRosterPlanner({ ...inputs, onProgress }), onProgress);
}

/** The fixed-budget joint plan (`planRosterBudget`) — Phase 4. See this module's own top doc comment, including the PROGRESS section for `onProgress`. */
export function runRosterBudgetOffMainThread(
  inputs: RosterBudgetInputs,
  onProgress?: RosterPlannerProgressCallback,
): Promise<RosterBudgetWorkerRunOutcome> {
  const requestId = `roster-budget-${++requestCounter}`;
  return runOnWorker({ type: "plan", requestId, inputs }, isPlanResult, () => planRosterBudget({ ...inputs, onProgress }), onProgress);
}
