import { raidDataFreshness } from "./registry.js";

/**
 * "Raid data as of …" — surfaces registry.ts's raidDataFreshness() wherever a
 * user reads a currently-active-raid list (SpeciesReportView's boss sweep,
 * BossSetPanel's multi-raid boss set). This is a STATIC site: the active-raid
 * roster freezes at build time, so what looks like "right now" on screen can
 * be however old the last successful `npm run sync-data` + deploy was —
 * `data/normalized/_meta.json` shipped 2026-09-14 specifically to answer
 * this, but nothing read it until this component.
 *
 * `source` (see RaidDataFreshness's own doc comment in registry.ts) tells
 * apart two genuinely different problems that a bare timestamp can't: "this
 * checkout just hasn't been synced/deployed in a while" (an old but healthy
 * `fetchedAt`, `source: "scrapedduck"`) versus "the upstream ScrapedDuck feed
 * itself was unreachable" (`source: "fallback-file"` /
 * `"fallback-file-created-empty"`, where `fetchedAt` can be far older than
 * `writtenAt` — the sync RAN recently, but had nothing fresh to write).
 * Deliberately a plain inline note, not a collapsible or a badge — this is a
 * caveat about the data's currency, which per this project's own convention
 * (assumptions/caveats stay visible) shouldn't hide behind a click.
 */
export function RaidFreshnessNote() {
  const meta = raidDataFreshness();
  const fetchedDate = meta.fetchedAt ? meta.fetchedAt.slice(0, 10) : null;
  const writtenDate = meta.writtenAt.slice(0, 10);

  if (fetchedDate === null) {
    return (
      <p className="raid-freshness-note raid-freshness-note--warn">
        Raid data has never been successfully synced on this build — the active-raid list below may be empty or
        badly out of date.
      </p>
    );
  }

  if (meta.source === "scrapedduck") {
    return (
      <p className="raid-freshness-note">
        Raid data as of {fetchedDate} (this site is a static build — that&rsquo;s when the roster below was last
        actually fetched, not &ldquo;now&rdquo;).
      </p>
    );
  }

  if (meta.source === "fallback-file") {
    return (
      <p className="raid-freshness-note raid-freshness-note--caution">
        The live raid feed was unreachable during the most recent data sync ({writtenDate}) — showing the last
        successfully fetched roster, from {fetchedDate}. Raid rotations since then may be missing.
      </p>
    );
  }

  return (
    <p className="raid-freshness-note raid-freshness-note--warn">
      Both the live raid feed and its local fallback cache failed during the most recent data sync ({writtenDate}) —
      the active-raid list below may be missing entries, not just stale. Last known-good fetch: {fetchedDate}.
    </p>
  );
}
