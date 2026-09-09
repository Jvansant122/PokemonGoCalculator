/**
 * The Power-Up Optimizer's multi-raid sweep AND fixed-budget plan, off the
 * main thread — Phase 3b/Phase 4 of PLAN_multi_raid_roster_optimizer.md. See
 * run/runRosterPlanner.ts's own top doc comment for the RESOLUTION/
 * COMPUTATION split this worker is the COMPUTATION half of.
 *
 * NOT NEGOTIABLE (per the task's own architecture note): this file imports
 * ONLY `@pogo-analyzer/engine` — never `registry.ts`, never any
 * `data/normalized/*.json`. Pulling the registry in here would bundle
 * `species.json` a SECOND time (once for the main chunk, once for this
 * worker chunk); the main chunk is already ~2 MB. Everything this worker
 * needs (species data, cost table, boss targets — all plain JSON) arrives
 * pre-resolved in the `RosterPlannerInputs` message payload; this file does
 * no lookups of its own.
 *
 * Deliberately does NOT rely on TypeScript's "webworker" lib — this
 * package's single tsconfig.json sets `"lib": ["ES2022", "DOM", "DOM.Iterable"]`
 * for the whole `src` tree (main-thread code needs DOM), and DOM.d.ts and
 * webworker.d.ts both redeclare overlapping globals (`self`, `postMessage`,
 * etc.) when both are in scope — adding a per-file `/// <reference lib=
 * "webworker" />` here would conflict with the rest of the package rather
 * than cleanly override it. Casting `self` through `unknown` to a small,
 * locally-declared structural type sidesteps that entirely: this file only
 * ever touches `onmessage`/`postMessage`, both given their own exact,
 * message-contract-specific signatures below instead of the full DOM or
 * WebWorker `self` type.
 *
 * MESSAGE CONTRACT (extended by Phase 4 to TWO request types, still ONE
 * shared worker — the task's own instruction was to extend this worker
 * rather than spin up a second one): one request in, exactly one reply out
 * (`requestId` echoed back so a stale reply from a superseded run can't be
 * mistaken for the current one — see rosterPlannerWorkerClient.ts).
 *   - `{ type: "run" }` -> `runRosterPlanner(inputs)` -> `{ type: "result" }`
 *     (the ranked, whole-pool sweep — Phase 3b).
 *   - `{ type: "plan" }` -> `planRosterBudget(inputs)` -> `{ type: "planResult" }`
 *     (the fixed-budget joint allocation — Phase 4). `RosterBudgetInputs` is
 *     structurally satisfied by a plain `RosterPlannerInputs` value (see
 *     rosterPlanner.ts's own `RosterBudgetInputs` doc comment) — the caller
 *     (rosterPlannerWorkerClient.ts) sends the SAME resolved inputs object
 *     to both request types, no separate resolution pass.
 * Either request type can also reply `{ type: "error" }` on a thrown engine
 * error. No progress messages — both `runRosterPlanner` and
 * `planRosterBudget` are fully synchronous inside this worker with no yield
 * points of their own (a genuine per-boss/per-round progress event needs an
 * `onProgress` hook inside packages/engine/src/rosterPlanner.ts, out of scope
 * for a web-only phase — see PLAN_multi_raid_roster_optimizer.md's Phase 3b
 * task description). The calling side is responsible for showing coarse
 * running/done/failed state plus elapsed wall-clock time, NOT a fabricated
 * percentage.
 */
import {
  planRosterBudget,
  runRosterPlanner,
  type RosterBudgetInputs,
  type RosterBudgetPlan,
  type RosterPlannerInputs,
  type RosterPlanResult,
} from "@pogo-analyzer/engine";

export interface RosterPlannerWorkerRunRequest {
  type: "run";
  requestId: string;
  inputs: RosterPlannerInputs;
}

export interface RosterPlannerWorkerPlanRequest {
  type: "plan";
  requestId: string;
  inputs: RosterBudgetInputs;
}

export type RosterPlannerWorkerRequest = RosterPlannerWorkerRunRequest | RosterPlannerWorkerPlanRequest;

export type RosterPlannerWorkerResponse =
  | { type: "result"; requestId: string; data: RosterPlanResult }
  | { type: "planResult"; requestId: string; data: RosterBudgetPlan }
  | { type: "error"; requestId: string; message: string };

interface MinimalWorkerScope {
  onmessage: ((event: { data: RosterPlannerWorkerRequest }) => void) | null;
  postMessage: (message: RosterPlannerWorkerResponse) => void;
}

const ctx = self as unknown as MinimalWorkerScope;

ctx.onmessage = (event) => {
  const { requestId } = event.data;
  try {
    if (event.data.type === "run") {
      const data = runRosterPlanner(event.data.inputs);
      ctx.postMessage({ type: "result", requestId, data });
    } else {
      const data = planRosterBudget(event.data.inputs);
      ctx.postMessage({ type: "planResult", requestId, data });
    }
  } catch (err) {
    ctx.postMessage({ type: "error", requestId, message: err instanceof Error ? err.message : String(err) });
  }
};
