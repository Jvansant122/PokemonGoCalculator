import {
  fromBase64Url,
  sanitizeKnownFields,
  toBase64Url,
  tryParseJsonObject,
  type FieldValidators,
} from "@pogo-analyzer/engine";
import { isLiteralUnion } from "./webScenarioValidation.js";

/**
 * Which column order the Roster tab's own table is currently displayed in —
 * a display-only choice, same "still a real, shareable setting" precedent as
 * Species Report's own `sortMode` (see that tab's own bugfix history: a
 * display toggle silently reverting to its default on a shared link is
 * exactly the recurring bug class `add-scenario-assumption` exists to catch,
 * even though this one never changes a computed number).
 */
export type RosterSortBy = "recent" | "species" | "level";

/**
 * The Roster tab's own shareable SETTINGS — deliberately NOT the roster's
 * contents. See CLAUDE.md's standing decision: the imported/hand-entered
 * roster itself lives only in this browser's localStorage (rosterPool.ts)
 * and is excluded from every share link, single documented exception in this
 * project. What round-trips here is display preference only; the actual
 * Pokémon travel via the save code (rosterSaveCode.ts) instead, which the
 * user copies deliberately — never automatically, and never into a URL.
 */
export interface RosterScenario {
  sortBy?: RosterSortBy;
}

function encodeRosterScenario(scenario: RosterScenario): string {
  const json = JSON.stringify(scenario);
  return toBase64Url(new TextEncoder().encode(json));
}

const isRosterSortBy = isLiteralUnion<RosterSortBy>(["recent", "species", "level"]);

/** See scenario.ts's `SCENARIO_FIELD_VALIDATORS` — the same per-field validator table convention, just for this tab's (much smaller) scenario shape. */
const ROSTER_SCENARIO_FIELD_VALIDATORS: FieldValidators<RosterScenario> = {
  sortBy: isRosterSortBy,
};

/** See scenario.ts's `ScenarioDecodeResult` — identical shape and rationale, just for `RosterScenario`. */
export interface RosterScenarioDecodeResult {
  scenario: RosterScenario;
  rejectedFields: string[];
}

/**
 * Defensive decode: never throws. Returns `null` only when the payload is
 * entirely unusable (invalid base64, non-JSON, or a non-object top level) —
 * see scenario.ts's `decodeScenarioWithDiagnostics` for the full contract
 * this mirrors. `RosterScenario`'s single field (`sortBy`) already being
 * optional means a wholly-empty `{}` was always a valid decode; this only
 * changes what happens to a PRESENT-but-wrong-shaped `sortBy` (previously a
 * silent wrong value flowing straight into the sort-order `<select>`, now
 * dropped back to "absent," same as an older link).
 */
export function decodeRosterScenarioWithDiagnostics(encoded: string): RosterScenarioDecodeResult | null {
  const payload = tryParseJsonObject(fromBase64Url, encoded);
  if (payload === null) return null;
  const { result, rejectedFields } = sanitizeKnownFields<RosterScenario>(payload, ROSTER_SCENARIO_FIELD_VALIDATORS);
  return { scenario: result as unknown as RosterScenario, rejectedFields };
}

function decodeRosterScenario(encoded: string): RosterScenario | null {
  return decodeRosterScenarioWithDiagnostics(encoded)?.scenario ?? null;
}

/**
 * A separate query param from every other tab's own ("s"/"ts"/"sr"/"ivc"/
 * "adb"/"pu") — see App.tsx's tab-switcher, which stamps a matching `view=`
 * param onto every generated share link.
 */
const ROSTER_SCENARIO_QUERY_PARAM = "rt";

export function buildRosterScenarioUrl(baseUrl: string, scenario: RosterScenario): string {
  const url = new URL(baseUrl);
  url.searchParams.set(ROSTER_SCENARIO_QUERY_PARAM, encodeRosterScenario(scenario));
  return url.toString();
}

export function parseRosterScenarioFromUrl(url: string): RosterScenario | null {
  const encoded = new URL(url).searchParams.get(ROSTER_SCENARIO_QUERY_PARAM);
  return encoded ? decodeRosterScenario(encoded) : null;
}
