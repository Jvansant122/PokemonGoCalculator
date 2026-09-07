/**
 * Strips any existing query string off the current page URL, leaving just
 * the origin+path a fresh scenario query string can be appended to. Every
 * tab's `handleShare()` needs exactly this before calling its own
 * `build*ScenarioUrl` — previously four identical
 * `window.location.href.split("?")[0]!` copies (Comparator/Team Raid/
 * Species Report/IV Breakpoints), now one shared helper.
 */
export function getBaseUrl(): string {
  return window.location.href.split("?")[0]!;
}
