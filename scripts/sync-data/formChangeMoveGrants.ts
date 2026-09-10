/**
 * Resolves GameMasterPokemonRecord.formChange move-reassignment entries into
 * actual movepool grants — see MECHANICS.md's "Form-change `moveReassignment`
 * grants moves that appear in no movepool array" for the full rule this
 * implements (established 2026-09-10 after the user reported four "missing"
 * signature moves — Behemoth Blade, Behemoth Bash, Moongeist Beam, Gigaton
 * Hammer; the last turned out to be a false alarm, already syncing correctly
 * via Tinkaton's ordinary cinematicMoves).
 *
 * Split out of fetchCache.ts as its own focused module (same "one module per
 * parsing/resolution concern" convention as shadowVariant.ts/
 * megaPrimalParsing.ts/gameMasterMatching.ts) specifically so this pure
 * transform — no I/O, no network — is unit-testable with small hand-built
 * fixture arrays, without mocking a live GAME_MASTER fetch.
 *
 * THE RULE: each formChange[] entry sits on a DECLARING pokemonSettings
 * template and names a TARGET form (`availableForm`). Its
 * moveReassignment.cinematicMoves[]/quickMoves[] groups are ownership claims
 * about two different forms:
 *   - `existingMoves` -> moves the DECLARING form holds.
 *   - `replacementMoves` -> moves the TARGET form(s) hold after the
 *     transition.
 * `existingMoves` can be absent ENTIRELY (not an empty array — the key
 * itself missing), confirmed live for the Necrozma/Kyurem FUSE entries,
 * which are one-way (fusion has no return trip carrying move data — the
 * UNFUSE-direction formChange entry carries no moveReassignment at all).
 * Zacian/Zamazenta declare their grant from BOTH directions (Hero->Crowned
 * lists the move as a `replacementMove`; Crowned->Hero lists the SAME move as
 * an `existingMove`), which independently corroborates the reading above.
 *
 * Called once by fetchGameMasterData (./fetchCache.ts) after its main loop
 * over the upstream array has finished collecting every pokemonSettings/
 * moveSettings template — a form can be the TARGET of an entry declared on a
 * template appearing anywhere else in that array, before or after, so this
 * cannot run inside that same loop.
 *
 * Mutates each record's own `quickMoves`/`cinematicMoves` array IN PLACE
 * (pushing a newly-granted movementId) — every downstream consumer already
 * reads straight off these same compact records (see
 * gameMasterPokemonByEnum in sync-data.ts), so there is no second, parallel
 * structure for a consumer to forget to check.
 *
 * A grant is applied ONLY if:
 *   - the target form key resolves to an actual record in `pokemon` this
 *     run (else the target form key is reported in
 *     `unmatchedFormChangeTargets`, never thrown — "a named form isn't in
 *     the roster this run").
 *   - the movementId resolves to an actual entry in `moves` this run (else
 *     reported per-form in the returned report's skipped* arrays, never
 *     thrown — "a named move has no moveSettings template").
 *   - the movementId isn't ALREADY present on that form, checked against the
 *     UNION of its plain AND elite arrays for the matching move class (fast
 *     vs charged) — e.g. Kyurem's own `existingMoves: ["GLACIATE"]`
 *     self-grant is a no-op because GLACIATE is already Kyurem's own ELITE
 *     charged move, not because this function special-cases Kyurem. This
 *     union check is also what makes the required de-duplication fall out
 *     for free: Zacian/Zamazenta each assert the same grant via up to 5
 *     independent formChange entries (2 duplicate entries on the bare
 *     template, 2 more on the separate-but-content-identical Hero template,
 *     1 more via the reverse Crowned-Sword->Hero entry's existingMoves) — the
 *     first of these to run adds the move, every later one sees it already
 *     present and is silently skipped.
 */

import type { GameMasterMoveRecord, GameMasterPokemonRecord } from "./rawShapes.ts";

/** Report of one form's moveset gaining (or failing to gain) a move via formChange resolution. Only forms with at least one added OR skipped move are reported — a form whose formChange entries were pure no-ops (e.g. existingMoves re-asserting a move already present, anywhere) is silent, same as any other no-op in this pipeline. */
export interface FormChangeMoveGrantReport {
  pokemonId: string;
  form?: string;
  addedCinematicMoves: string[];
  addedQuickMoves: string[];
  /** movementIds this pipeline would have granted but skipped because no moveSettings template resolved for them this run (never thrown). */
  skippedCinematicMoves: string[];
  skippedQuickMoves: string[];
}

export interface ResolveFormChangeMoveGrantsResult {
  grants: FormChangeMoveGrantReport[];
  /** Target form keys named by some formChange[].availableForm entry with no matching GameMasterPokemonRecord in `pokemon` this run — reported, never thrown. */
  unmatchedFormChangeTargets: string[];
}

interface PendingGrant {
  record: GameMasterPokemonRecord;
  slot: "cinematic" | "quick";
  moveId: string;
}

/**
 * Resolves every record's own `formChange` entries and mutates
 * `cinematicMoves`/`quickMoves` in place — see this module's doc comment for
 * the full rule and guarantees. `pokemon` and `moves` should be the complete,
 * already-extracted arrays (all templates visited) so target-form and
 * move-template lookups never miss for want of ordering.
 */
export function resolveFormChangeMoveGrants(
  pokemon: readonly GameMasterPokemonRecord[],
  moves: readonly GameMasterMoveRecord[],
): ResolveFormChangeMoveGrantsResult {
  const moveIdSet = new Set(moves.map((m) => m.movementId));
  const recordByFormKey = new Map<string, GameMasterPokemonRecord>();
  for (const record of pokemon) {
    recordByFormKey.set(record.form ?? record.pokemonId, record);
  }

  const pendingGrants: PendingGrant[] = [];
  const unmatchedFormChangeTargets = new Set<string>();

  const collect = (
    declaringRecord: GameMasterPokemonRecord,
    targetForms: readonly string[],
    slot: "cinematic" | "quick",
    existingMoves: string[] | undefined,
    replacementMoves: string[] | undefined,
  ): void => {
    for (const moveId of existingMoves ?? []) {
      pendingGrants.push({ record: declaringRecord, slot, moveId });
    }
    if (replacementMoves && replacementMoves.length > 0) {
      for (const targetKey of targetForms) {
        const targetRecord = recordByFormKey.get(targetKey);
        if (!targetRecord) {
          unmatchedFormChangeTargets.add(targetKey);
          continue;
        }
        for (const moveId of replacementMoves) {
          pendingGrants.push({ record: targetRecord, slot, moveId });
        }
      }
    }
  };

  for (const declaringRecord of pokemon) {
    for (const fc of declaringRecord.formChange ?? []) {
      for (const group of fc.cinematicMoves) {
        collect(declaringRecord, fc.availableForm, "cinematic", group.existingMoves, group.replacementMoves);
      }
      for (const group of fc.quickMoves) {
        collect(declaringRecord, fc.availableForm, "quick", group.existingMoves, group.replacementMoves);
      }
    }
  }

  const grantReportsByRecord = new Map<GameMasterPokemonRecord, FormChangeMoveGrantReport>();
  const reportFor = (record: GameMasterPokemonRecord): FormChangeMoveGrantReport => {
    let report = grantReportsByRecord.get(record);
    if (!report) {
      report = { pokemonId: record.pokemonId, form: record.form, addedCinematicMoves: [], addedQuickMoves: [], skippedCinematicMoves: [], skippedQuickMoves: [] };
      grantReportsByRecord.set(record, report);
    }
    return report;
  };

  for (const { record, slot, moveId } of pendingGrants) {
    const plainList = slot === "cinematic" ? record.cinematicMoves : record.quickMoves;
    const eliteList = slot === "cinematic" ? record.eliteCinematicMoves : record.eliteQuickMoves;
    // Already known anywhere on this form (plain OR elite) — a genuine no-op
    // (self-grant corroboration) or a duplicate/reverse-direction assertion
    // of a grant already applied. This single check is what makes
    // de-duplication fall out for free; see this module's doc comment.
    if (plainList.includes(moveId) || eliteList.includes(moveId)) continue;

    if (!moveIdSet.has(moveId)) {
      const report = reportFor(record);
      const skipped = slot === "cinematic" ? report.skippedCinematicMoves : report.skippedQuickMoves;
      if (!skipped.includes(moveId)) skipped.push(moveId);
      continue;
    }

    plainList.push(moveId);
    const report = reportFor(record);
    (slot === "cinematic" ? report.addedCinematicMoves : report.addedQuickMoves).push(moveId);
  }

  return { grants: [...grantReportsByRecord.values()], unmatchedFormChangeTargets: [...unmatchedFormChangeTargets] };
}
