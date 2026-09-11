import { useMemo, useState } from "react";
import type { SpeciesDefinition } from "@pogo-analyzer/engine";
import { CollapsibleSection } from "./CollapsibleSection.js";
import { RosterImportPanel } from "./RosterImportPanel.js";
import { RosterEntryForm } from "./RosterEntryForm.js";
import { SpeciesBadges } from "./SpeciesBadges.js";
import { candidatePickerOptions, speciesRegistry } from "./registry.js";
import { movesetDefaultBadge } from "./rosterMovesetBadge.js";
import {
  draftToRosterEntry,
  emptyRosterEntryDraft,
  newHandEntryId,
  normalizeRosterEntryDraft,
  rosterEntryToDraft,
  type RosterEntryDraft,
} from "./rosterEntryDraft.js";
import {
  buildRosterScenarioUrl,
  parseRosterScenarioFromUrl,
  type RosterScenario,
  type RosterSortBy,
} from "./rosterScenario.js";
import {
  dehydrateRosterEntry,
  hydrateRosterPool,
  loadRosterPool,
  mergeRosterPools,
  RosterPoolFormatError,
  saveRosterPool,
  type RosterPool,
} from "./rosterPool.js";
import { decodeRosterSaveCode, encodeRosterSaveCode } from "./rosterSaveCode.js";
import { getBaseUrl } from "./urlUtils.js";
import { runRosterScenario } from "./run/runRoster.js";
import type { RosterEntry } from "./import/pokeGenieMatch.js";

export interface RosterAssumptions {
  sortBy: RosterSortBy;
}

export const DEFAULT_ASSUMPTIONS: RosterAssumptions = { sortBy: "recent" };

export function assumptionsToScenario(a: RosterAssumptions): RosterScenario {
  return { sortBy: a.sortBy };
}

export function scenarioToAssumptions(s: RosterScenario): RosterAssumptions {
  return { sortBy: s.sortBy ?? DEFAULT_ASSUMPTIONS.sortBy };
}

function initialAssumptions(): RosterAssumptions {
  if (typeof window === "undefined") return DEFAULT_ASSUMPTIONS;
  const fromUrl = parseRosterScenarioFromUrl(window.location.href);
  return fromUrl ? scenarioToAssumptions(fromUrl) : DEFAULT_ASSUMPTIONS;
}

function resolveSpecies(id: string | null): SpeciesDefinition | null {
  return id && speciesRegistry.has(id) ? speciesRegistry.get(id) : null;
}

type LoadOutcome = { kind: "ok"; entryCount: number; totalAfter: number; mode: "add" | "replace" } | { kind: "error"; message: string };

const BYTES_TO_KB = 1024;

/**
 * The seventh tab — see PLAN_roster_tab.md. Owns the roster outright:
 * hand-entry/editing (RosterEntryForm.tsx), the pre-existing CSV import
 * (RosterImportPanel.tsx, moved here from the Power-Up Optimizer tab), and a
 * self-contained, versioned save code (rosterSaveCode.ts) for cross-device
 * transfer without any backend. The roster's CONTENTS never round-trip
 * through this tab's own `RosterScenario`/share link (CLAUDE.md's standing
 * decision) — only this tab's display settings do; the save code is the
 * deliberate, user-driven substitute, copied by hand rather than embedded in
 * a URL.
 */
export function RosterView() {
  const [assumptions, setAssumptions] = useState<RosterAssumptions>(initialAssumptions);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const [pool, setPool] = useState<RosterPool>(loadRosterPool);
  const [persistWarning, setPersistWarning] = useState<string | null>(null);
  const { entries: hydratedEntries, droppedCount } = useMemo(() => hydrateRosterPool(pool, speciesRegistry), [pool]);

  const [draft, setDraftRaw] = useState<RosterEntryDraft>(emptyRosterEntryDraft);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [codeStats, setCodeStats] = useState<{ originalBytes: number; codeChars: number } | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [loadCodeText, setLoadCodeText] = useState("");
  const [loadMode, setLoadMode] = useState<"add" | "replace">("add");
  const [loadingCode, setLoadingCode] = useState(false);
  const [loadOutcome, setLoadOutcome] = useState<LoadOutcome | null>(null);

  const speciesOptions = useMemo(() => candidatePickerOptions(), []);
  const draftSpecies = resolveSpecies(draft.speciesId);

  const { summary, sortedEntries } = useMemo(() => runRosterScenario(assumptions.sortBy, hydratedEntries), [assumptions.sortBy, hydratedEntries]);

  function setDraft(next: RosterEntryDraft) {
    setDraftRaw(normalizeRosterEntryDraft(next, resolveSpecies(next.speciesId)));
  }

  function persistAndSet(next: RosterPool) {
    const result = saveRosterPool(next);
    setPool(next);
    setPersistWarning(
      result.persisted ? null : "Could not save this roster to this browser's local storage (private window, blocked site data, or storage quota) — it will be lost on reload. Save a code below to keep it.",
    );
  }

  function resetForm() {
    setDraft(emptyRosterEntryDraft());
    setEditingEntryId(null);
  }

  function handleAddSubmit() {
    if (!draftSpecies) return;
    const entry = draftToRosterEntry(draft, draftSpecies, newHandEntryId());
    persistAndSet({ ...pool, entries: [...pool.entries, dehydrateRosterEntry(entry)] });
    setStatusMessage(`Added ${draftSpecies.name} to your roster.`);
    resetForm();
  }

  function handleEditSave() {
    if (!draftSpecies || !editingEntryId) return;
    const entry = draftToRosterEntry(draft, draftSpecies, editingEntryId);
    persistAndSet({
      ...pool,
      entries: pool.entries.map((e) => (e.entryId === editingEntryId ? dehydrateRosterEntry(entry) : e)),
    });
    setStatusMessage(`Saved changes to ${draftSpecies.name} — its moveset/level/IVs are now marked KNOWN, not defaulted.`);
    resetForm();
  }

  function handleStartEdit(entry: RosterEntry) {
    setEditingEntryId(entry.entryId);
    setDraft(rosterEntryToDraft(entry));
    setStatusMessage(null);
    document.getElementById("roster-entry-form-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleDelete(entryId: string, name: string) {
    persistAndSet({ ...pool, entries: pool.entries.filter((e) => e.entryId !== entryId) });
    if (editingEntryId === entryId) resetForm();
    setStatusMessage(`Removed ${name} from your roster.`);
  }

  async function handleGenerateCode() {
    setGeneratingCode(true);
    try {
      const code = await encodeRosterSaveCode(pool);
      const originalBytes = new TextEncoder().encode(JSON.stringify(pool)).length;
      setSavedCode(code);
      setCodeStats({ originalBytes, codeChars: code.length });
    } finally {
      setGeneratingCode(false);
    }
  }

  async function handleLoadCode() {
    setLoadingCode(true);
    setLoadOutcome(null);
    try {
      const { pool: decoded, entryCount } = await decodeRosterSaveCode(loadCodeText);
      const next = loadMode === "replace" ? decoded : mergeRosterPools(pool, decoded);
      persistAndSet(next);
      setLoadOutcome({ kind: "ok", entryCount, totalAfter: next.entries.length, mode: loadMode });
      setLoadCodeText("");
    } catch (err) {
      setLoadOutcome({
        kind: "error",
        message: err instanceof RosterPoolFormatError ? err.message : `Could not load this code: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setLoadingCode(false);
    }
  }

  function handleShare() {
    const url = new URL(buildRosterScenarioUrl(getBaseUrl(), assumptionsToScenario(assumptions)));
    url.searchParams.set("view", "roster");
    window.history.replaceState(null, "", url.toString());
    setShareUrl(url.toString());
  }

  return (
    <>
      <p className="subtitle">
        {hydratedEntries.length} Pokémon in your roster — hand-add, import a CSV export, edit any entry, or save a
        code to move this roster to another device. Read by the Power-Up Optimizer&rsquo;s multi-raid mode and Team
        Raid Simulator&rsquo;s Lineup Builder.
      </p>

      {persistWarning && <p className="error-text">{persistWarning}</p>}
      {droppedCount > 0 && (
        <p className="caveats">
          {droppedCount} stored entr{droppedCount === 1 ? "y" : "ies"} reference a species this data layer no longer
          has.
        </p>
      )}

      <section className="panel">
        <h2>Roster summary</h2>
        <dl>
          <dt>Total entries</dt>
          <dd>{summary.entryCount}</dd>
          <dt>Unique species</dt>
          <dd>{summary.uniqueSpeciesCount}</dd>
          <dt>Mega/Primal-capable</dt>
          <dd>{summary.megaCapableCount}</dd>
          <dt>Shadow</dt>
          <dd>{summary.shadowCount}</dd>
          <dt>Default/unknown moveset</dt>
          <dd>{summary.defaultedMovesetCount}</dd>
        </dl>
        <div className="field" style={{ maxWidth: 260 }}>
          <label htmlFor="roster-sort-by">Table sort order</label>
          <select
            id="roster-sort-by"
            value={assumptions.sortBy}
            onChange={(e) => setAssumptions({ ...assumptions, sortBy: e.target.value as RosterSortBy })}
          >
            <option value="recent">Recently added</option>
            <option value="species">Species name</option>
            <option value="level">Level (highest first)</option>
          </select>
        </div>
      </section>

      <CollapsibleSection
        id="roster-entry-form"
        heading={<span id="roster-entry-form-heading">{editingEntryId ? "Edit this Pokémon" : "Add a Pokémon"}</span>}
        defaultOpen
      >
        {statusMessage && <p className="species-picker-hint">{statusMessage}</p>}
        <RosterEntryForm
          idPrefix="roster-form"
          draft={draft}
          onChange={setDraft}
          species={draftSpecies}
          speciesOptions={speciesOptions}
          mode={editingEntryId ? "edit" : "add"}
          onSubmit={editingEntryId ? handleEditSave : handleAddSubmit}
          onCancel={editingEntryId ? resetForm : undefined}
        />
      </CollapsibleSection>

      <section className="panel">
        <RosterImportPanel pool={pool} onPoolChange={setPool} />
      </section>

      {sortedEntries.length > 0 && (
        <section className="panel">
          <h2>Your roster</h2>
          <div className="table-scroll">
            <table className="time-series-table">
              <thead>
                <tr>
                  <th>Species</th>
                  <th>Level</th>
                  <th>IVs</th>
                  <th>Fast move</th>
                  <th>Charged move</th>
                  <th>Flags</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((entry) => {
                  const badge = movesetDefaultBadge(entry);
                  const flags: string[] = [];
                  if (entry.canMega) flags.push("mega-capable");
                  if (entry.costModifiers.isPurified) flags.push("purified");
                  if (entry.costModifiers.isLucky) flags.push("lucky");
                  return (
                    <tr key={entry.entryId}>
                      <td>
                        {entry.species.name}
                        <SpeciesBadges isHypothetical={entry.species.isHypothetical} isShadow={entry.species.isShadow || entry.costModifiers.isShadow} />
                      </td>
                      <td>
                        {entry.level}
                        {entry.levelIsApproximate && <span className="badge badge-approximate">approx level</span>}
                      </td>
                      <td>
                        {entry.ivs.attack}/{entry.ivs.defense}/{entry.ivs.stamina}
                        {entry.ivsAreApproximate && <span className="badge badge-approximate">approx IVs</span>}
                      </td>
                      <td>{entry.species.fastMoves.find((m) => m.id === entry.fastMoveId)?.name ?? "—"}</td>
                      <td>{entry.species.chargedMoves.find((m) => m.id === entry.chargedMoveId)?.name ?? "—"}</td>
                      <td>
                        {flags.length > 0 ? flags.join("; ") : "—"}
                        {badge && (
                          <span className="badge badge-approximate" title={badge.title}>
                            {badge.label}
                          </span>
                        )}
                      </td>
                      <td>
                        <button type="button" onClick={() => handleStartEdit(entry)}>
                          Edit
                        </button>{" "}
                        <button type="button" onClick={() => handleDelete(entry.entryId, entry.species.name)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Save your roster as a code</h2>
        <p className="species-picker-hint">
          A self-contained, compressed code you copy and paste yourself — never automatically shared, and never part
          of any share link (this app has no backend and no accounts). Paste it back here, on this device or another,
          to restore your roster.
        </p>
        <div className="share-row">
          <button type="button" onClick={() => void handleGenerateCode()} disabled={hydratedEntries.length === 0 || generatingCode}>
            {generatingCode ? "Compressing…" : "Generate save code"}
          </button>
        </div>
        {savedCode && (
          <>
            <textarea readOnly rows={4} value={savedCode} onFocus={(e) => e.target.select()} style={{ marginTop: 8, width: "100%" }} />
            {codeStats && (
              <p className="species-picker-hint">
                {codeStats.originalBytes.toLocaleString()} bytes of roster JSON compressed to a {codeStats.codeChars.toLocaleString()}-character
                code ({((1 - codeStats.codeChars / Math.max(1, codeStats.originalBytes)) * 100).toFixed(0)}% smaller than the raw JSON; roughly{" "}
                {(codeStats.codeChars / BYTES_TO_KB).toFixed(1)} KB).
              </p>
            )}
          </>
        )}

        <h3 style={{ marginTop: 16 }}>Load a roster from a code</h3>
        <div className="field">
          <label htmlFor="roster-load-code">Paste a save code</label>
          <textarea
            id="roster-load-code"
            rows={4}
            value={loadCodeText}
            onChange={(e) => setLoadCodeText(e.target.value)}
            placeholder="pogo-roster-v1:…"
          />
        </div>
        <div className="team-slot-flags">
          <label className="species-picker-hint">
            <input type="radio" name="roster-load-mode" checked={loadMode === "add"} onChange={() => setLoadMode("add")} /> Add to current roster
          </label>
          <label className="species-picker-hint">
            <input type="radio" name="roster-load-mode" checked={loadMode === "replace"} onChange={() => setLoadMode("replace")} /> Replace current
            roster
          </label>
        </div>
        <div className="share-row" style={{ marginTop: 8 }}>
          <button type="button" onClick={() => void handleLoadCode()} disabled={loadCodeText.trim() === "" || loadingCode}>
            {loadingCode ? "Loading…" : "Load"}
          </button>
        </div>
        {loadOutcome?.kind === "ok" && (
          <p className="species-picker-hint">
            Restored {loadOutcome.entryCount} entr{loadOutcome.entryCount === 1 ? "y" : "ies"} ({loadOutcome.mode === "add" ? "added to" : "replaced"}{" "}
            your roster — {loadOutcome.totalAfter} total now).
          </p>
        )}
        {loadOutcome?.kind === "error" && <p className="error-text">{loadOutcome.message}</p>}
      </section>

      <section className="panel">
        <h2>Share this scenario</h2>
        <div className="share-row">
          <button onClick={handleShare}>Build link</button>
          {shareUrl && <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />}
        </div>
        <p className="caveats" style={{ marginTop: 8 }}>
          This link carries only this tab&rsquo;s display setting (table sort order) — NEVER your roster itself. Use
          the save code above to move your roster to another device.
        </p>
      </section>

      <CollapsibleSection id="roster-known-caveats" heading="Known caveats" defaultOpen={false}>
        <div className="note-block">
          <h3>What&rsquo;s stored where</h3>
          <p className="caveats">
            Your roster lives only in THIS browser&rsquo;s local storage — clearing site data, a private/incognito
            window, or a different browser/device will not see it. There is no account and no server; the save code
            above is the only way to move a roster between devices, and it must be copied and pasted deliberately.
          </p>
          <h3>Hand-entered vs. imported</h3>
          <p className="caveats">
            A hand-added or hand-edited entry&rsquo;s moveset, level, and IVs are treated as fully KNOWN — none of
            them ever carry the &ldquo;default moveset&rdquo;/&ldquo;approx IV&rdquo;/&ldquo;approx level&rdquo;
            badges a blank or averaged CSV column earns, since you just typed or picked them directly.
          </p>
          <h3>Save code format</h3>
          <p className="caveats">
            The code is gzip-compressed and base64url-encoded, with a version prefix
            (&ldquo;pogo-roster-v1:&rdquo;) — a future format change will bump that number rather than silently
            breaking old codes; a mismatched or corrupted code fails with a specific error, never a partial load.
          </p>
        </div>
      </CollapsibleSection>
    </>
  );
}
