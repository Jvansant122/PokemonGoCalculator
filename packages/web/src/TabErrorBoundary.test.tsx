import { describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { TabErrorBoundary } from "./TabErrorBoundary.js";

/**
 * `packages/web` deliberately has no component-rendering test harness
 * (vitest.config.ts, `environment: "node"`, no jsdom/@testing-library —
 * this project's UI-behavior verification is the manual/browser checklist,
 * not a component test suite). Adding one (jsdom + @testing-library/react)
 * for this single component would be disproportionate — neither is an
 * existing dependency, and pulling them in changes the test environment for
 * every OTHER test in this package, not just this file.
 *
 * This doesn't need either, though: `TabErrorBoundary` is a plain ES class
 * extending React's `Component`, and its `render()` method is just a
 * function that returns plain React element objects (`{ type, props, ... }`)
 * — data, not DOM. Constructing the class directly and calling its own
 * `getDerivedStateFromError`/`render()`/`componentDidCatch` methods exercises
 * the REAL implementation (not a reimplementation or a mock) with zero new
 * dependencies and zero environment change, at the cost of not exercising
 * React's actual reconciler (no real "a child threw during a real render
 * pass" — state is set directly, mirroring what `getDerivedStateFromError`
 * would have produced). That's an honest, named trade-off, not a hidden one.
 *
 * `findElement`/`findText` below walk the plain element tree returned by
 * calling the (unexported) `TabCrashFallback` function component directly —
 * `fallback.type` IS that function reference, since JSX literals compile to
 * plain objects — to find the real `<button>` and assert its `onClick` is
 * the EXACT callback instance passed in, not a copy or a no-op. That's the
 * one thing text-only assertions (or an HTML-string render via
 * `react-dom/server`) can't prove, since HTML strips event handlers.
 */

type Node = ReactElement<{ children?: ReactNode; onClick?: () => void; role?: string; type?: string }> | ReactNode;

function findElement(node: Node, predicate: (el: ReactElement) => boolean): ReactElement | null {
  if (node == null || typeof node === "boolean" || typeof node === "string" || typeof node === "number") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child as Node, predicate);
      if (found) return found;
    }
    return null;
  }
  const el = node as ReactElement<{ children?: ReactNode }>;
  if (predicate(el)) return el;
  if (el.props && "children" in el.props) return findElement(el.props.children, predicate);
  return null;
}

function findText(node: Node, needle: string): boolean {
  if (node == null || typeof node === "boolean") return false;
  if (typeof node === "string" || typeof node === "number") return String(node).includes(needle);
  if (Array.isArray(node)) return node.some((child) => findText(child as Node, needle));
  const el = node as ReactElement<{ children?: ReactNode }>;
  if (el.props && "children" in el.props) return findText(el.props.children, needle);
  return false;
}

describe("TabErrorBoundary", () => {
  it("getDerivedStateFromError captures the thrown error into state, the React contract this boundary relies on", () => {
    const err = new Error("deliberate test crash");
    expect(TabErrorBoundary.getDerivedStateFromError(err)).toEqual({ error: err });
  });

  it("renders its children unchanged when nothing has thrown", () => {
    const children = <div>fine</div>;
    const instance = new TabErrorBoundary({ tabLabel: "Test Tab", onResetTab: () => {}, children });
    expect(instance.state).toEqual({ error: null });
    expect(instance.render()).toBe(children);
  });

  it("logs the caught error via componentDidCatch rather than swallowing it", () => {
    const err = new Error("deliberate test crash");
    const instance = new TabErrorBoundary({ tabLabel: "Test Tab", onResetTab: () => {}, children: null });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      instance.componentDidCatch(err, { componentStack: "\n    in Bomb" });
      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(consoleError.mock.calls[0]?.[1]).toBe(err);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("once an error is caught, renders the crash fallback with the error surfaced, the tab name shown, and 'Reset this tab to defaults' wired to the REAL onResetTab callback (not a copy or a no-op)", () => {
    const err = new Error("deliberate test crash");
    const onResetTab = vi.fn();
    const instance = new TabErrorBoundary({
      tabLabel: "Two-Candidate Comparator",
      onResetTab,
      children: <div>never shown once crashed</div>,
    });

    // What React itself does after getDerivedStateFromError fires, applied
    // directly since there's no reconciler here to do it for us.
    instance.state = TabErrorBoundary.getDerivedStateFromError(err);

    const fallback = instance.render() as ReactElement<{ tabLabel: string; error: Error; onResetTab: () => void }>;
    // The boundary hands the SAME props straight through to its fallback —
    // no re-wrapping, no lost reference.
    expect(fallback.props.tabLabel).toBe("Two-Candidate Comparator");
    expect(fallback.props.error).toBe(err);
    expect(fallback.props.onResetTab).toBe(onResetTab);

    // TabCrashFallback is a plain function component — calling it directly
    // (`fallback.type` IS that function) renders its own element tree one
    // level deeper, the real markup a user would see.
    const tree = (fallback.type as (props: typeof fallback.props) => ReactElement)(fallback.props);

    expect(tree.props.role).toBe("alert");
    expect(findText(tree, "Two-Candidate Comparator")).toBe(true);
    expect(findText(tree, err.message)).toBe(true);

    const button = findElement(tree, (el) => el.type === "button");
    expect(button).not.toBeNull();
    expect(findText(button!.props.children, "Reset this tab to defaults")).toBe(true);
    // The load-bearing assertion: the exact callback instance the caller
    // passed in, not a fresh closure or `undefined` from a dropped prop.
    expect(button!.props.onClick).toBe(onResetTab);
  });
});
