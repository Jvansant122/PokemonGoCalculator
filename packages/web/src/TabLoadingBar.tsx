/**
 * `Suspense` fallback for a lazy tab chunk (see App.tsx's own doc comment on
 * why every view is now a separate async chunk). Deliberately `position:
 * fixed`, out of document flow — it occupies NO box in the layout, so it can
 * never shift anything else on the page regardless of how long the chunk
 * takes to arrive, and it costs nothing visually on a fast connection beyond
 * a brief animated line at the very top of the viewport (no full-panel
 * spinner, no "Loading…" text competing with the masthead). `role="status"`
 * plus a visually-hidden label is the only thing an assistive-tech user gets
 * — sighted users get the bar itself.
 */
export function TabLoadingBar() {
  return (
    <div className="tab-loading-bar" role="status" aria-live="polite">
      <span className="visually-hidden">Loading tab…</span>
    </div>
  );
}
