import { afterEach, describe, expect, it, vi } from "vitest";
import { readCollapsibleOpen, writeCollapsibleOpen } from "./collapsibleState.js";

/** Same in-memory Storage stand-in as rosterPool.test.ts — the real localStorage API surface these functions actually call. */
function fakeLocalStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readCollapsibleOpen", () => {
  it("returns defaultOpen when nothing has been stored yet", () => {
    vi.stubGlobal("window", { localStorage: fakeLocalStorage() });
    expect(readCollapsibleOpen("comparator-known-caveats", false)).toBe(false);
    expect(readCollapsibleOpen("comparator-assumptions", true)).toBe(true);
  });

  it("returns the stored value, overriding defaultOpen", () => {
    vi.stubGlobal("window", {
      localStorage: fakeLocalStorage({
        "pogo-analyzer:collapsible:comparator-known-caveats": "open",
        "pogo-analyzer:collapsible:comparator-assumptions": "closed",
      }),
    });
    expect(readCollapsibleOpen("comparator-known-caveats", false)).toBe(true);
    expect(readCollapsibleOpen("comparator-assumptions", true)).toBe(false);
  });

  it("degrades to defaultOpen (never throws) when localStorage.getItem throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readCollapsibleOpen("any-id", true)).toBe(true);
    expect(readCollapsibleOpen("any-id", false)).toBe(false);
  });

  it("ignores a foreign/corrupt stored value and falls back to defaultOpen", () => {
    vi.stubGlobal("window", {
      localStorage: fakeLocalStorage({ "pogo-analyzer:collapsible:weird": "not-a-real-value" }),
    });
    expect(readCollapsibleOpen("weird", true)).toBe(true);
  });
});

describe("writeCollapsibleOpen", () => {
  it("round-trips through a real-shaped localStorage stand-in", () => {
    const storage = fakeLocalStorage();
    vi.stubGlobal("window", { localStorage: storage });
    writeCollapsibleOpen("team-raid-breakdown", true);
    expect(readCollapsibleOpen("team-raid-breakdown", false)).toBe(true);
    writeCollapsibleOpen("team-raid-breakdown", false);
    expect(readCollapsibleOpen("team-raid-breakdown", true)).toBe(false);
  });

  it("never throws (silently degrades) when localStorage.setItem throws (quota exceeded)", () => {
    vi.stubGlobal("window", {
      localStorage: {
        setItem: () => {
          throw new Error("quota exceeded");
        },
      },
    });
    expect(() => writeCollapsibleOpen("any-id", true)).not.toThrow();
  });
});
