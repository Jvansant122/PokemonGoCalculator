import type { ChargedMove, FastMove, IVSpread, PowerUpCostModifiers, SpeciesDefinition, SpeciesRegistry } from "@pogo-analyzer/engine";
import type { PokeGenieRow } from "./pokeGenieCsv.js";

/**
 * One species-matched, interpreted roster entry — shaped to match
 * `RosterEntry` from §4.3 of PLAN_multi_raid_roster_optimizer.md as closely
 * as makes sense at this Phase-1 (standalone import) stage, i.e. before the
 * engine's own `rosterPlanner.ts` (Phase 2) exists to consume it.
 * `entryId` is unique PER POOL ENTRY, never per species — the real export
 * has 12 Houndour and 11 Inkay, and each is its own tradeable/power-up-able
 * entry.
 */
export interface RosterEntry {
  entryId: string;
  species: SpeciesDefinition;
  fastMoveId: string | null;
  chargedMoveId: string | null;
  level: number;
  ivs: IVSpread;
  costModifiers: PowerUpCostModifiers;
  canMega: boolean;
  ivsAreApproximate: boolean;
  levelIsApproximate: boolean;
  movesetIsDefaulted: boolean;
  /**
   * Deliberately left `undefined` (unknown) for every row in v1 — Phase 0 of
   * the plan adds real `evolvesToIds`/`isFullyEvolved` data this project
   * doesn't have yet (see the plan's §3.6). Do NOT infer this from Poke
   * Genie's own "Name (G/U/L)" PvP-rank columns in production code — those
   * columns just name whichever species a good PvP rank happens to belong
   * to (frequently the FULLY EVOLVED form even for an unevolved catch),
   * which is a decent one-off research proxy (it's how the plan's own §2.2
   * measured "69/164 unevolved") but not a real evolution-graph lookup.
   */
  isFullyEvolved?: boolean;
  /**
   * Poke Genie's "Charge Move 2" column, when present — recorded, NEVER
   * modelled (the engine simulates one charged move per attacker; see the
   * plan's §3 "Charge Move 2" note).
   */
  secondChargedMoveName?: string;
  /** The source CSV row's own 1-based line number — provenance for the match report / roster table. */
  sourceLineNumber: number;
  /**
   * Non-blank Quick/Charge Move names from the CSV that did NOT resolve
   * against this species' own moveset (e.g. "Return" on Raticate (Alola),
   * which genuinely doesn't exist anywhere in this engine's move data) —
   * reported because an unmatched move name usually means stale engine
   * data, not a bad user input. Never includes a move name that was simply
   * BLANK in the source row (that's `movesetIsDefaulted` alone, an
   * expected/common case — 55%/60% of the real export — not a data
   * problem).
   */
  unmatchedMoveNames: string[];
}

export interface UnmatchedPokeGenieRow {
  lineNumber: number;
  name: string;
  form: string;
  dex: number | null;
  reason: string;
  /** Every species name this matcher actually considered and rejected (ambiguous, or simply absent) — so "why didn't this match" is answerable without re-deriving the ladder by hand. */
  candidatesConsidered: string[];
}

export interface RosterImportResult {
  matched: RosterEntry[];
  unmatched: UnmatchedPokeGenieRow[];
}

/**
 * A registry-like object this module actually needs — just enough of
 * `SpeciesRegistry`'s real interface (`all()`) to matach against, kept
 * narrow so a test can pass a plain `{ all: () => SpeciesDefinition[] }`
 * without constructing the engine's real class.
 */
type SpeciesSource = Pick<SpeciesRegistry, "all">;

/**
 * `SpeciesDefinition` extended with the `dexNumber` field Phase 0 of
 * PLAN_multi_raid_roster_optimizer.md will add to real synced species (not
 * present as of this writing) — the same "extension type at the call site,
 * never edit the engine's own type" trick this project already uses
 * elsewhere (see shadowToggle.ts) for an engine field that hasn't landed.
 */
type SpeciesWithOptionalDex = SpeciesDefinition & { dexNumber?: number };

/**
 * A species' National Pokédex number. Prefers `species.dexNumber` (Phase 0,
 * not present today) and otherwise falls back to parsing the trailing
 * number out of `imageUrl` (".../sprites/pokemon/134.png") — confirmed by
 * direct check against `data/normalized/species.json` to hold the REAL dex
 * number for every non-mega form (base, regional, gender, and Shadow all
 * reuse the base form's sprite), but NOT for `-mega`/`-mega-x`/`-mega-y`
 * ids, whose sprite is a distinct PokeAPI alternate-form id instead (e.g.
 * `delphox-mega` -> 10293, not Delphox's real dex 655) — see
 * `findMegaCandidate` below for how the Mega step of the matching ladder
 * sidesteps that entirely rather than ever trusting this function on a mega
 * candidate. Isolated in this one function so Phase 0 landing `dexNumber`
 * only requires deleting the fallback branch here, nowhere else.
 */
function dexNumberOf(species: SpeciesWithOptionalDex): number | null {
  if (typeof species.dexNumber === "number") return species.dexNumber;
  const match = species.imageUrl?.match(/\/pokemon\/(\d+)\.png$/);
  return match ? Number(match[1]) : null;
}

function buildDexIndex(species: SpeciesDefinition[]): Map<number, SpeciesDefinition[]> {
  const index = new Map<number, SpeciesDefinition[]>();
  for (const s of species) {
    const dex = dexNumberOf(s);
    if (dex === null) continue;
    const list = index.get(dex);
    if (list) list.push(s);
    else index.set(dex, [s]);
  }
  return index;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Step 1 of the ladder — exact species-name match within one dex's candidates. */
function candidatesByExactName(dexCandidates: SpeciesDefinition[], name: string): SpeciesDefinition[] {
  const needle = normalizeName(name);
  return dexCandidates.filter((s) => normalizeName(s.name) === needle);
}

/**
 * Step 2 of the ladder — "Mega" form. Poke Genie's `Form` column just says
 * "Mega" with no X/Y distinction, so this can't rely on dex-number matching
 * against the mega candidate itself (`dexNumberOf` is wrong for mega ids —
 * see its own doc comment). Instead: find the BASE (non-mega) species for
 * this dex to learn its canonical name, then search the WHOLE registry for
 * a species named "Mega <that name>" (a prefix match, so "Mega Raichu
 * X"/"Mega Raichu Y" both surface if a dex ever has more than one —
 * reported as ambiguous/unmatched rather than guessed at, since no case in
 * the fixture exercises that branch).
 */
function findMegaCandidate(
  dexCandidates: SpeciesDefinition[],
  csvName: string,
  allSpecies: SpeciesDefinition[],
): { match: SpeciesDefinition | null; considered: string[] } {
  const base = candidatesByExactName(dexCandidates, csvName)[0] ?? null;
  const canonicalName = base?.name ?? csvName;
  const expectedPrefix = normalizeName(`Mega ${canonicalName}`);
  const candidates = allSpecies.filter((s) => normalizeName(s.name).startsWith(expectedPrefix));
  return {
    match: candidates.length === 1 ? candidates[0]! : null,
    considered: candidates.map((s) => s.name),
  };
}

/** Segments of a species id after its base (e.g. "raichu-alola" -> ["alola"], "sneasel-hisuian" -> ["hisuian"]). */
function idSuffixSegments(id: string): string[] {
  return id.split("-").slice(1);
}

/**
 * Poke Genie's regional/gender `Form` tokens this matcher recognizes for
 * step 3 — see the plan's §2.2: real species ids do NOT use one uniform
 * suffix convention (`raichu-alola`, `sneasel-hisuian`,
 * `stunfisk-galarian`, `indeedee-male`), so `candidatesByFormToken` matches
 * by ID-SEGMENT PREFIX (a hyphen-delimited suffix segment starting with the
 * token), not by assuming an exact suffix string. Anchoring to a whole
 * hyphen-segment (never a raw substring anywhere in the id) is what keeps
 * "Male" from also matching "indeedee-female" (which contains "male" as a
 * bare substring but not as its own segment).
 */
const REGIONAL_GENDER_FORM_TOKENS = new Set(["alola", "hisui", "galar", "male"]);

function candidatesByFormToken(dexCandidates: SpeciesDefinition[], token: string): SpeciesDefinition[] {
  const needle = token.toLowerCase();
  return dexCandidates.filter((s) => idSuffixSegments(s.id).some((seg) => seg.startsWith(needle)));
}

interface MatchOutcome {
  species: SpeciesDefinition | null;
  considered: string[];
}

/**
 * The 6-step matching ladder from PLAN_multi_raid_roster_optimizer.md §4.2:
 * (1) dex + exact name when Form is Normal/empty, (2) dex + Mega form,
 * (3) dex + regional/gender form token, (4) dex with exactly one registered
 * candidate, (5) bare-name lookup, (6) otherwise unmatched. Each step only
 * commits to a match when it is UNIQUE — an ambiguous step falls through to
 * the next one rather than guessing.
 */
function matchSpecies(
  csvName: string,
  form: string,
  dex: number,
  dexIndex: Map<number, SpeciesDefinition[]>,
  allSpecies: SpeciesDefinition[],
): MatchOutcome {
  const dexCandidates = dexIndex.get(dex) ?? [];
  const considered = new Set<string>();
  const formLower = form.trim().toLowerCase();
  const isNormalForm = formLower === "" || formLower === "normal";

  if (isNormalForm) {
    const exact = candidatesByExactName(dexCandidates, csvName);
    exact.forEach((s) => considered.add(s.name));
    if (exact.length === 1) return { species: exact[0]!, considered: [...considered] };
  }

  if (formLower === "mega") {
    const { match, considered: megaConsidered } = findMegaCandidate(dexCandidates, csvName, allSpecies);
    megaConsidered.forEach((n) => considered.add(n));
    if (match) return { species: match, considered: [...considered] };
  }

  if (REGIONAL_GENDER_FORM_TOKENS.has(formLower)) {
    const tokenMatches = candidatesByFormToken(dexCandidates, formLower);
    tokenMatches.forEach((s) => considered.add(s.name));
    if (tokenMatches.length === 1) return { species: tokenMatches[0]!, considered: [...considered] };
  }

  if (dexCandidates.length === 1) {
    considered.add(dexCandidates[0]!.name);
    return { species: dexCandidates[0]!, considered: [...considered] };
  }
  dexCandidates.forEach((s) => considered.add(s.name));

  const bare = allSpecies.filter((s) => normalizeName(s.name) === normalizeName(csvName));
  bare.forEach((s) => considered.add(s.name));
  if (bare.length === 1) return { species: bare[0]!, considered: [...considered] };

  return { species: null, considered: [...considered] };
}

/**
 * Resolves a raw move display name (Poke Genie's "Water Gun") against ONE
 * species' own moveset by normalized name — never a global move map (a
 * move's engine id can collide/differ across species' otherwise-identical
 * display names is not actually a risk here since we always scope to the
 * matched species' own fastMoves/chargedMoves, per this project's own
 * "never infer fast-vs-charged from shape" discipline: the caller already
 * knows which array it's searching).
 */
function resolveMoveByName(
  moves: (FastMove | ChargedMove)[],
  rawName: string | undefined,
): { id: string | null; unmatchedName: string | null } {
  const trimmed = (rawName ?? "").trim();
  if (trimmed === "") return { id: null, unmatchedName: null };
  const needle = normalizeName(trimmed);
  const found = moves.find((m) => normalizeName(m.name) === needle);
  return found ? { id: found.id, unmatchedName: null } : { id: null, unmatchedName: trimmed };
}

function parseNumberOrNull(raw: string | undefined): number | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function clampIv(n: number): number {
  return Math.max(0, Math.min(15, Math.round(n)));
}

function clampIvTotal(total: number): number {
  return Math.max(0, Math.min(45, total));
}

/**
 * Even split of `IV Avg` (a 0-100 percent of the 45-point max) across
 * attack/defense/stamina — §3.3 of the plan. Remainder points (0-2, from
 * rounding the /3 division) go to attack first, then defense, so the three
 * numbers still sum to the same rounded total rather than each being
 * independently rounded and silently drifting off it.
 */
function ivsFromAverage(avgPercent: number): IVSpread {
  const total = clampIvTotal(Math.round((avgPercent / 100) * 45));
  const base = Math.floor(total / 3);
  const remainder = total - base * 3;
  return {
    attack: clampIv(base + (remainder > 0 ? 1 : 0)),
    defense: clampIv(base + (remainder > 1 ? 1 : 0)),
    stamina: clampIv(base),
  };
}

const SHADOW_PURIFIED_NONE = 0;
const SHADOW_PURIFIED_SHADOW = 1;
const SHADOW_PURIFIED_PURIFIED = 2;

function buildRosterEntry(row: PokeGenieRow, species: SpeciesDefinition): RosterEntry {
  const v = row.values;

  const ivAvg = parseNumberOrNull(v["IV Avg"]) ?? 0;
  const rawAtkIv = parseNumberOrNull(v["Atk IV"]);
  const rawDefIv = parseNumberOrNull(v["Def IV"]);
  const rawStaIv = parseNumberOrNull(v["Sta IV"]);
  const hasAllRawIvs = rawAtkIv !== null && rawDefIv !== null && rawStaIv !== null;
  const ivs: IVSpread = hasAllRawIvs
    ? { attack: clampIv(rawAtkIv!), defense: clampIv(rawDefIv!), stamina: clampIv(rawStaIv!) }
    : ivsFromAverage(ivAvg);

  const levelMin = parseNumberOrNull(v["Level Min"]) ?? 1;
  const levelMax = parseNumberOrNull(v["Level Max"]);
  const levelIsApproximate = levelMax !== null && levelMax !== levelMin;

  const shadowPurified = parseNumberOrNull(v["Shadow/Purified"]) ?? SHADOW_PURIFIED_NONE;
  const isLucky = (parseNumberOrNull(v["Lucky"]) ?? 0) === 1;

  const fast = resolveMoveByName(species.fastMoves, v["Quick Move"]);
  const charged = resolveMoveByName(species.chargedMoves, v["Charge Move"]);
  const fastMoveId = fast.id ?? species.fastMoves[0]?.id ?? null;
  const chargedMoveId = charged.id ?? species.chargedMoves[0]?.id ?? null;
  const movesetIsDefaulted = fast.id === null || charged.id === null;
  const unmatchedMoveNames = [fast.unmatchedName, charged.unmatchedName].filter((n): n is string => n !== null);

  const secondChargedMoveNameRaw = (v["Charge Move 2"] ?? "").trim();

  return {
    entryId: `pg-${row.lineNumber}-${species.id}`,
    species,
    fastMoveId,
    chargedMoveId,
    level: levelMin,
    ivs,
    costModifiers: {
      isShadow: shadowPurified === SHADOW_PURIFIED_SHADOW,
      isPurified: shadowPurified === SHADOW_PURIFIED_PURIFIED,
      isLucky,
    },
    canMega: normalizeName(v["Form"] ?? "") === "mega",
    ivsAreApproximate: !hasAllRawIvs,
    levelIsApproximate,
    movesetIsDefaulted,
    secondChargedMoveName: secondChargedMoveNameRaw === "" ? undefined : secondChargedMoveNameRaw,
    sourceLineNumber: row.lineNumber,
    unmatchedMoveNames,
  };
}

/**
 * Matches every parsed Poke Genie row against the registry, per the 6-step
 * ladder documented above (see PLAN_multi_raid_roster_optimizer.md §4.2).
 * Every input row becomes exactly one `matched` or `unmatched` entry —
 * never silently dropped.
 */
export function matchPokeGenieRows(rows: PokeGenieRow[], registry: SpeciesSource): RosterImportResult {
  const allSpecies = registry.all();
  const dexIndex = buildDexIndex(allSpecies);

  const matched: RosterEntry[] = [];
  const unmatched: UnmatchedPokeGenieRow[] = [];

  for (const row of rows) {
    const name = (row.values["Name"] ?? "").trim();
    const form = (row.values["Form"] ?? "").trim();
    const dex = parseNumberOrNull(row.values["Pokemon"]);

    if (name === "") {
      unmatched.push({ lineNumber: row.lineNumber, name, form, dex, reason: "Missing Name column.", candidatesConsidered: [] });
      continue;
    }
    if (dex === null) {
      unmatched.push({
        lineNumber: row.lineNumber,
        name,
        form,
        dex: null,
        reason: "Missing or non-numeric Pokemon (dex number) column.",
        candidatesConsidered: [],
      });
      continue;
    }

    const { species, considered } = matchSpecies(name, form, dex, dexIndex, allSpecies);
    if (!species) {
      unmatched.push({
        lineNumber: row.lineNumber,
        name,
        form,
        dex,
        reason: `No unique registered species found for dex ${dex}, form "${form || "(none)"}".`,
        candidatesConsidered: considered,
      });
      continue;
    }

    matched.push(buildRosterEntry(row, species));
  }

  return { matched, unmatched };
}
