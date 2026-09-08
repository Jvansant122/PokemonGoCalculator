import { useEffect, useState } from "react";

/**
 * Echoes `value` after it has stopped changing for `delayMs` — the standard
 * "debounce" pattern, generic enough for any view whose input state also
 * drives an expensive synchronous computation (a `useMemo` doing real
 * simulation work, not just cheap re-rendering).
 *
 * Built for the Species Report tab's growing past-raid roster (~529 entries
 * once the pogoapi historical backfill lands vs. ~15 before it): every
 * Level/IV keystroke was re-running a 200-run-per-boss sweep SYNCHRONOUSLY on
 * the main thread (measured ~1.4s at 696 targets), so typing a two-digit
 * level froze the tab for several seconds. React's own concurrent
 * primitives (`useTransition`/`useDeferredValue`) don't fix this: JS is
 * run-to-completion, so once a `useMemo` body starts executing, React cannot
 * interrupt it partway through no matter how the update was scheduled — they
 * only help react schedule cheap re-renders around expensive ones, not make
 * one giant synchronous computation itself interruptible. What actually
 * fixes "unresponsive while typing" is not running the expensive computation
 * at all until the user stops typing — a plain timer-based debounce — which
 * trades "N keystrokes trigger N freezes" for "one, deferred freeze after the
 * user pauses," and is genuinely correct even though the browser still can't
 * paint during that single final computation.
 *
 * A real, considered, and REJECTED alternative: moving the sweep into a Web
 * Worker so the main thread never blocks at all, even during that final
 * computation. That's the actually-scalable fix as this roster keeps
 * growing, but it's a materially bigger and riskier change (structured-
 * cloning the whole species registry — or restructuring the engine call to
 * take serializable inputs only — into a worker, message-passing, and
 * duplicating or sharing build tooling for a worker bundle) than this task's
 * scope. Flagged here rather than silently built around, per this project's
 * "state what you did and why" instruction for a rejected alternative.
 *
 * Callers should debounce the SPECIFIC derived object that feeds the
 * expensive computation (not raw component state wholesale) if the
 * component also has cheap, instant-feedback state living alongside it (e.g.
 * a sort-order toggle) — see SpeciesReportView.tsx's `sweepInputs`, which
 * deliberately excludes `sortMode` so toggling sort order never flashes a
 * "pending" indicator for work that was never actually re-triggered.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
