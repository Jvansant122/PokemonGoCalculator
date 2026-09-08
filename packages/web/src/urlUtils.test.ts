import { afterEach, describe, expect, it, vi } from "vitest";
import { getBaseUrl } from "./urlUtils.js";

describe("getBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("strips an existing query string, keeping origin+path", () => {
    vi.stubGlobal("window", { location: { href: "https://example.test/app/?s=abc123&view=comparator" } });
    expect(getBaseUrl()).toBe("https://example.test/app/");
  });

  it("returns the href unchanged when there is no query string", () => {
    vi.stubGlobal("window", { location: { href: "https://example.test/app/" } });
    expect(getBaseUrl()).toBe("https://example.test/app/");
  });
});
