import { useMemo, useState } from "react";
import { parsePokeGenieCsv, PokeGenieFormatError, type PokeGenieParseResult } from "./import/pokeGenieCsv.js";
import { matchPokeGenieRows, type RosterImportResult, type UnmatchedPokeGenieRow } from "./import/pokeGenieMatch.js";
import {
  dehydrateRosterEntry,
  deserializeRosterPoolFromJson,
  emptyRosterPool,
  hydrateRosterPool,
  RosterPoolFormatError,
  saveRosterPool,
  serializeRosterPoolToJson,
  type RosterPool,
} from "./rosterPool.js";
import { speciesRegistry } from "./registry.js";

interface ImportSummary {
  parseSkipped: PokeGenieParseResult["skipped"];
  unknownColumns: string[];
  ignoredColumns: string[];
  unmatched: UnmatchedPokeGenieRow[];
  matchedCount: number;
  totalDataRows: number;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsText(file);
  });
}

function downloadTextFile(filename: string, contents: string, mimeType: string) {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  /**
   * Controlled from PowerUpOptimizerView.tsx (which owns the canonical
   * `useState<RosterPool>(loadRosterPool)` — this panel used to own that
   * state itself, but the multi-raid sweep (Phase 3) needs to read the SAME
   * pool a CSV import just produced without requiring a page reload, so the
   * state was lifted up. This panel still owns PERSISTENCE (calling
   * saveRosterPool as a side effect of every import/clear action) — only the
   * canonical in-memory value moved.
   */
  pool: RosterPool;
  onPoolChange: (next: RosterPool) => void;
}

/**
 * Whole-roster CSV import, one panel among several the Roster tab
 * (RosterView.tsx) owns — see PLAN_roster_tab.md. Import a Poke Genie CSV
 * export, persist it to THIS BROWSER's localStorage (deliberately NOT the
 * share-link URL — CLAUDE.md's standing "no backend" roster exception), and
 * display a match report + roster table. Feeds the Power-Up Optimizer's
 * multi-raid mode and Team Raid Simulator's Lineup Builder via the pool/
 * onPoolChange props this component is controlled by. Originally embedded
 * directly in the Power-Up Optimizer tab; moved here 2026-09-10 once the
 * roster stopped being that tab's own implementation detail.
 */
export function RosterImportPanel({ pool, onPoolChange }: Props) {
  const [pasteText, setPasteText] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [persistWarning, setPersistWarning] = useState<string | null>(null);

  const { entries: hydratedEntries, droppedCount } = useMemo(() => hydrateRosterPool(pool, speciesRegistry), [pool]);

  function applyImportedRoster(result: RosterImportResult, parseResult: PokeGenieParseResult) {
    const nextPool: RosterPool = { ...pool, entries: result.matched.map(dehydrateRosterEntry) };
    const saveResult = saveRosterPool(nextPool);
    onPoolChange(nextPool);
    setPersistWarning(
      saveResult.persisted
        ? null
        : "Could not save this roster to this browser's local storage (private window, blocked site data, or storage quota) — it will be lost on reload. Export it as a file below to keep it.",
    );
    setSummary({
      parseSkipped: parseResult.skipped,
      unknownColumns: parseResult.unknownColumns,
      ignoredColumns: parseResult.ignoredColumns,
      unmatched: result.unmatched,
      matchedCount: result.matched.length,
      totalDataRows: parseResult.rows.length,
    });
    setErrorMessage(null);
  }

  function importCsvText(text: string) {
    try {
      const parseResult = parsePokeGenieCsv(text);
      const matchResult = matchPokeGenieRows(parseResult.rows, speciesRegistry);
      applyImportedRoster(matchResult, parseResult);
    } catch (err) {
      setErrorMessage(err instanceof PokeGenieFormatError ? err.message : `Could not import this file: ${err instanceof Error ? err.message : String(err)}`);
      setSummary(null);
    }
  }

  function handleCsvFile(file: File) {
    readFileAsText(file)
      .then((text) => importCsvText(text))
      .catch((err) => setErrorMessage(`Could not read this file: ${err instanceof Error ? err.message : String(err)}`));
  }

  function handleJsonFile(file: File) {
    readFileAsText(file)
      .then((text) => {
        const imported = deserializeRosterPoolFromJson(text);
        const saveResult = saveRosterPool(imported);
        onPoolChange(imported);
        setPersistWarning(
          saveResult.persisted ? null : "Could not save this roster to this browser's local storage — it will be lost on reload.",
        );
        setSummary(null);
        setErrorMessage(null);
      })
      .catch((err) => {
        setErrorMessage(
          err instanceof RosterPoolFormatError ? err.message : `Could not import this roster file: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  function handleExportJson() {
    downloadTextFile(`pogo-roster-pool-${new Date().toISOString().slice(0, 10)}.json`, serializeRosterPoolToJson(pool), "application/json");
  }

  function handleClear() {
    const next = emptyRosterPool();
    saveRosterPool(next);
    onPoolChange(next);
    setSummary(null);
    setErrorMessage(null);
    setPersistWarning(null);
  }

  return (
    <details>
      <summary>Import a whole roster (Poke Genie CSV) — {hydratedEntries.length} Pokémon stored in this browser</summary>

      <p className="caveats" style={{ marginTop: 12 }}>
        Feeds the Power-Up Optimizer's multi-raid mode and Team Raid Simulator's Lineup Builder. This roster is
        stored ONLY in this browser's local storage, never in a share link (see the save code section below for the
        deliberate, user-driven way to move it to another device). See the &ldquo;Your roster&rdquo; table below for
        every imported (and hand-added) entry, with edit/delete controls — not duplicated here.
      </p>

      {errorMessage && <p className="error-text">{errorMessage}</p>}
      {persistWarning && <p className="error-text">{persistWarning}</p>}
      {droppedCount > 0 && (
        <p className="caveats">
          {droppedCount} stored entr{droppedCount === 1 ? "y" : "ies"} reference a species this data layer no longer
          has — re-import the CSV to fix.
        </p>
      )}

      <div className="result-row" style={{ flexWrap: "wrap", gap: 12, marginTop: 8 }}>
        <div className="field">
          <label htmlFor="roster-import-csv-file">Import Poke Genie CSV file</label>
          <input
            id="roster-import-csv-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) handleCsvFile(file);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="roster-import-json-file">Restore a previously-exported roster (JSON)</label>
          <input
            id="roster-import-json-file"
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) handleJsonFile(file);
            }}
          />
        </div>
      </div>

      <div className="field" style={{ marginTop: 8 }}>
        <label htmlFor="roster-import-paste">...or paste CSV text</label>
        <textarea
          id="roster-import-paste"
          rows={4}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="Paste a Poke Genie CSV export here..."
        />
        <button type="button" onClick={() => importCsvText(pasteText)} disabled={pasteText.trim() === ""}>
          Import pasted CSV
        </button>
      </div>

      <div className="share-row" style={{ marginTop: 8 }}>
        <button type="button" onClick={handleExportJson} disabled={hydratedEntries.length === 0}>
          Export roster as JSON
        </button>
        <button type="button" onClick={handleClear} disabled={hydratedEntries.length === 0}>
          Clear stored roster
        </button>
      </div>

      {summary && (
        <div className="result-card" style={{ marginTop: 12 }}>
          <h3>Last import</h3>
          <dl>
            <dt>Rows in file</dt>
            <dd>{summary.totalDataRows}</dd>
            <dt>Matched to a species</dt>
            <dd>{summary.matchedCount}</dd>
            <dt>Unmatched</dt>
            <dd>{summary.unmatched.length}</dd>
            <dt>Skipped (malformed row)</dt>
            <dd>{summary.parseSkipped.length}</dd>
            {summary.ignoredColumns.length > 0 && (
              <>
                <dt>Columns not used</dt>
                <dd>
                  {summary.ignoredColumns.length} (Poke Genie&rsquo;s PvP-rank columns &mdash; expected, nothing is
                  wrong)
                </dd>
              </>
            )}
            {/*
              Only GENUINELY unrecognized columns are worth a user's attention — a real export
              always carries ~25 recognized-but-unused PvP-rank columns, and listing those as
              "unrecognized" made a perfectly healthy import read as a failure.
            */}
            {summary.unknownColumns.length > 0 && (
              <>
                <dt>Unrecognized columns</dt>
                <dd>
                  {summary.unknownColumns.join(", ")} &mdash; this export may come from a newer Poke Genie version
                  than this tool knows about.
                </dd>
              </>
            )}
          </dl>

          {summary.unmatched.length > 0 && (
            <>
              <h4>Unmatched rows</h4>
              <ul className="caveats">
                {summary.unmatched.map((u) => (
                  <li key={u.lineNumber}>
                    Line {u.lineNumber}: {u.name || "(blank name)"}
                    {u.form && ` (${u.form})`} — {u.reason}
                    {u.candidatesConsidered.length > 0 && ` Considered: ${u.candidatesConsidered.join(", ")}.`}
                  </li>
                ))}
              </ul>
            </>
          )}

          {summary.parseSkipped.length > 0 && (
            <>
              <h4>Skipped rows</h4>
              <ul className="caveats">
                {summary.parseSkipped.map((s, i) => (
                  <li key={`${s.lineNumber}-${i}`}>
                    Line {s.lineNumber}: {s.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

    </details>
  );
}
