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
 * rather than spin up a second one): one request in, ZERO OR MORE
 * `{ type: "progress" }` messages, then exactly one terminal reply out
 * (`requestId` echoed back on every message, progress included, so a stale
 * reply/progress event from a superseded run can't be mistaken for the
 * current one — see rosterPlannerWorkerClient.ts).
 *   - `{ type: "run" }` -> `runRosterPlanner(inputs)` -> `{ type: "result" }`
 *     (the ranked, whole-pool sweep — Phase 3b).
 *   - `{ type: "plan" }` -> `planRosterBudget(inputs)` -> `{ type: "planResult" }`
 *     (the fixed-budget joint allocation — Phase 4). `RosterBudgetInputs` is
 *     structurally satisfied by a plain `RosterPlannerInputs` value (see
 *     rosterPlanner.ts's own `RosterBudgetInputs` doc comment) — the caller
 *     (rosterPlannerWorkerClient.ts) sends the SAME resolved inputs object
 *     to both request types, no separate resolution pass.
 * Either request type can also reply `{ type: "error" }` on a thrown engine
 * error.
 *
 * PROGRESS (IDEAS.md #13, engine's `RosterPlannerInputs.onProgress` landed
 * 2026-09-10): a plain callback can't cross the `postMessage` structured-clone
 * boundary, so this worker builds its OWN `onProgress` closure right here —
 * one per request, capturing that request's `requestId` — and hands it to
 * `runRosterPlanner`/`planRosterBudget` as part of `inputs`. Every real,
 * completed unit of work the engine reports (one boss's baseline, one
 * candidate's Stage 4 simulation, one committed budget round — see
 * `RosterPlannerProgressEvent`'s own doc comment; never a fabricated
 * fraction) becomes exactly one `{ type: "progress" }` postMessage back to the
 * main thread, in ADDITION to the final `{ type: "result" }`/`{ type:
 * "planResult" }` reply. Message volume is cheap relative to the multi-second
 * compute it reports on: a real 164-entry/13-boss sweep produces on the order
 * of a few hundred total progress events (baseline: one per boss, ~13;
 * candidates: one per simulated (entry, level) pair, capped at
 * `maxCandidates` plus the benched tail, ~60-160; rounds: one per COMMITTED
 * budget step only, typically single digits) — no batching/throttling here,
 * each event is a tiny plain object (a stage tag, two counters, optional boss
 * id/name strings).
 */
import {
  planRosterBudget,
  runRosterPlanner,
  type RosterBudgetInputs,
  type RosterBudgetPlan,
  type RosterPlannerInputs,
  type RosterPlannerProgressEvent,
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
  | { type: "progress"; requestId: string; event: RosterPlannerProgressEvent }
  | { type: "error"; requestId: string; message: string };

interface MinimalWorkerScope {
  onmessage: ((event: { data: RosterPlannerWorkerRequest }) => void) | null;
  postMessage: (message: RosterPlannerWorkerResponse) => void;
}

const ctx = self as unknown as MinimalWorkerScope;

ctx.onmessage = (event) => {
  const { requestId } = event.data;
  // Built fresh per request, capturing this request's OWN requestId — see
  // this file's top doc comment for why a callback can't cross the
  // postMessage boundary any other way.
  const onProgress = (progressEvent: RosterPlannerProgressEvent) => ctx.postMessage({ type: "progress", requestId, event: progressEvent });
  try {
    if (event.data.type === "run") {
      const data = runRosterPlanner({ ...event.data.inputs, onProgress });
      ctx.postMessage({ type: "result", requestId, data });
    } else {
      const data = planRosterBudget({ ...event.data.inputs, onProgress });
      ctx.postMessage({ type: "planResult", requestId, data });
    }
  } catch (err) {
    ctx.postMessage({ type: "error", requestId, message: err instanceof Error ? err.message : String(err) });
  }
};
