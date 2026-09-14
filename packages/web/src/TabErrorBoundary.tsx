import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches a render error thrown by whichever tab view is currently mounted
 * and shows a fallback that carries the one artifact this project's entire
 * debugging workflow depends on: the exact share URL that reproduced the
 * crash. Every tab's state serializes into the URL specifically so "a bug
 * report can be a pasteable link" (CLAUDE.md) — but React unmounts the whole
 * tree on an unhandled render error, which would otherwise blank the page
 * and take the URL bar's visible contents (and the user's ability to copy
 * them) down with it. Confirmed live 2026-09-13: every one of the seven
 * tabs' `decodeXScenario` functions (all base64url + `JSON.parse`, see
 * scenario.ts and its per-tab siblings) throws — not falls back — on
 * invalid base64, a truncated string, or a structurally-valid-but-wrong-shape
 * payload (e.g. a missing required array read as `undefined[0]`), and every
 * one of those crashes to a fully blank `<div id="root">` today.
 *
 * Deliberately an error boundary around ONLY the active view, not the whole
 * `<div className="app">` — App.tsx keeps the masthead and `.tab-switcher`
 * nav mounted above it, so a crashed tab still leaves every other tab one
 * click away without needing its own "switch tabs" affordance in here.
 * App.tsx keys this by `tab` so switching away and back always mounts a
 * fresh instance — a crashed tab doesn't stay crashed once you've navigated
 * off it, and there's no need for this component to expose its own
 * "clear the error and re-try the same tree" method.
 *
 * A plain class component: this is the one place in the codebase a class is
 * still correct, since React has no hook equivalent for
 * `getDerivedStateFromError`/`componentDidCatch` as of this writing.
 */
export class TabErrorBoundary extends Component<
  { tabLabel: string; onResetTab: () => void; children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Deliberately still logged, not swallowed — a boundary that hides the
    // error from the console makes this HARDER to debug, not easier (see
    // this file's own doc comment above and the task that added it).
    console.error(`Uncaught error rendering the "${this.props.tabLabel}" tab:`, error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <TabCrashFallback tabLabel={this.props.tabLabel} error={this.state.error} onResetTab={this.props.onResetTab} />
      );
    }
    return this.props.children;
  }
}

/**
 * The fallback itself is a plain function component (no error-boundary logic
 * of its own) so it can use ordinary hooks/JSX conventions like every other
 * view-level component in this file tree.
 */
function TabCrashFallback({
  tabLabel,
  error,
  onResetTab,
}: {
  tabLabel: string;
  error: Error;
  onResetTab: () => void;
}): ReactNode {
  const shareUrl = typeof window === "undefined" ? "" : window.location.href;
  return (
    <section className="panel tab-crash-callout" role="alert">
      <strong>This tab failed to render</strong>
      <p>
        The "{tabLabel}" tab hit an error while rendering and could not display its normal contents. The rest of the
        app — the tab switcher above, and every other tab — is unaffected.
      </p>
      {shareUrl && (
        <>
          <p>
            This is the current share link. Pasting it into a bug report reproduces this exact state, including
            whatever malformed or unexpected input caused the crash:
          </p>
          <div className="share-row">
            <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
          </div>
        </>
      )}
      <details className="prose-details">
        <summary>Error details</summary>
        <p>{error.message}</p>
        {error.stack && <pre className="tab-crash-stack">{error.stack}</pre>}
      </details>
      <p>
        <button type="button" onClick={onResetTab}>
          Reset this tab to defaults
        </button>{" "}
        or switch to another tab above.
      </p>
    </section>
  );
}
