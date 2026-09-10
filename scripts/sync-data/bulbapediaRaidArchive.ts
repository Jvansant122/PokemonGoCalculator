/**
 * Parsing + name-normalization for the Bulbapedia raid-archive union backfill
 * (2026-09-07) — see sync-data.ts's "Bulbapedia archive union" section for how
 * this feeds into raidHistory.json alongside the existing pogoapi-previous
 * backfill. Split out of sync-data.ts for the same reason megaPrimalParsing.ts/
 * gameMasterMatching.ts are: one focused module per parsing concern.
 *
 * Source pages: BULBAPEDIA_RAID_ARCHIVE_PAGES in ./fetchCache.ts. Format,
 * verbatim from direct wikitext inspection 2026-09-07:
 *   {{lop/raid/GO-head|<tierToken>}}          (also "Lop/raid/GO-head", both seen)
 *   {{lop/raid/GO|<dexNum>|<Name>|...|form=<Form>|...}}   (positional/named
 *     args appear in INCONSISTENT order across pages/rows — a fixed-position
 *     parse is not safe; this module tokenizes on top-level `|` and treats
 *     any `key=value` token as named, everything else as positional in
 *     encounter order: [dexNum, Name, ...unnamed numeric stats/shiny flag]).
 * <!-- ... --> HTML comments (including ones spanning multiple lines) are
 * stripped before line-by-line scanning.
 *
 * `<tierToken>` is "1".."5", or a raid-type token ("Mega"/"Primal") optionally
 * followed by `|<difficulty>` (e.g. "Mega|6" for Mega Latias/Latios, "Primal|5"
 * for Primal Kyogre/Groudon) — see BULBAPEDIA_MEGA_HEAD_RE. This second
 * token is NOT used to pick between "Mega Raids"/"Legendary Mega Raids": it's
 * inconsistent (Mega Latias/Latios use "6", Primal Kyogre/Groudon use "5",
 * even though both raid at the same real 22500 HP tier), so instead the
 * resolved SPECIES' own rarity/boost classification is used post-resolution
 * (defaultRaidTierForSpecies — the same real classification this project
 * already trusts everywhere else), never guessed from wikitext.
 */

import type { RaidTier, SpeciesDefinition } from "@pogo-analyzer/engine";
import { BULBAPEDIA_RAID_ARCHIVE_PAGES } from "./fetchCache.ts";

export interface BulbapediaRaidRow {
  bucket: "normal" | "mega";
  /** Raw pokemon name exactly as Bulbapedia wrote it, e.g. "Farfetch'd" (ASCII apostrophe), possibly "Shadow "-prefixed. */
  name: string;
  /** Raw form= value exactly as given, if any. */
  form?: string;
  /** Only set for bucket "normal" — the header-derived tier after the pre-2020-08-26 merge (2->1, 4->3). Mega-bucket tier is resolved later from the matched species, not from wikitext. */
  normalTier?: RaidTier;
  /**
   * This row's own real boss max HP (2026-09-07 era-HP backfill task) —
   * always the THIRD positional `{{lop/raid/GO|...}}` argument (index 2:
   * dexNum, Name, HP, then base-stat columns), confirmed by direct
   * inspection to hold in that exact position across every "normal" and
   * "mega"/"primal" row seen (4913 rows spot-checked, 4905 matching the known
   * raid-HP magnitude set below). Undefined when that positional field
   * either doesn't parse as a number or doesn't match KNOWN_ERA_HP_VALUES —
   * see parseBulbapediaRaidRows's invalidHpSamples return for the handful
   * of real exceptions found (a genuine 18750 HP Mewtwo row and a handful of
   * 9500 HP Season_5 mega rows, both outside the documented magnitude set
   * and therefore deliberately NOT stored rather than guessed at).
   */
  hp?: number;
}

/**
 * Every plausible real Pokémon GO raid-boss max-HP value this project's
 * research has confirmed across raid-tier history (2026-09-07 era-HP
 * backfill task): 600 (tier 1), 1800 (old tier 2, pre-2020-08-26), 3000 (tier
 * 3 pre-2019-02-03), 3600 (tier 3 post-2019-02-03), 9000 (old tier 4,
 * pre-2020-08-26), 12500 (tier 5 pre-2019-02-03), 15000 (Mega, pre-2022-04-28
 * for the ones that changed), 20000/22500/25000 (higher Legendary Mega /
 * Primal tiers). A row's positional HP field is only ever trusted if it
 * matches one of these exactly — anything else (observed: a real 18750 HP
 * Mewtwo row, real 9500 HP rows for a handful of Season_5 mega raids) is
 * reported, never stored, per this task's "never fabricate or launder an
 * HP" rule.
 */
export const KNOWN_ERA_HP_VALUES = new Set([600, 1800, 3000, 3600, 9000, 12500, 15000, 20000, 22500, 25000]);

const BULBAPEDIA_NORMAL_TIER_MAP: Record<string, RaidTier> = {
  "1": "1-Star Raids",
  "2": "1-Star Raids", // pre-2020-08-26 tier, merged into Tier 1 — same mapping as the pogoapi-previous backfill
  "3": "3-Star Raids",
  "4": "3-Star Raids", // pre-2020-08-26 tier, merged into Tier 3
  "5": "5-Star Raids",
};

const HEAD_RE = /\{\{[Ll]op\/raid\/GO-head\|([^}]*)\}\}/;
const ROW_RE = /\{\{[Ll]op\/raid\/GO\|([^}]*)\}\}/;

function stripComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

function parseTemplateArgs(argsStr: string): { positional: string[]; named: Record<string, string> } {
  const positional: string[] = [];
  const named: Record<string, string> = {};
  for (const part of argsStr.split("|")) {
    const eq = part.indexOf("=");
    if (eq > -1) {
      named[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    } else if (part.trim().length > 0) {
      positional.push(part.trim());
    }
  }
  return { positional, named };
}

/**
 * Giratina is the one species this archive shows raiding with NO `form=`
 * field at all (every occurrence is in the pre-2019 "2017-2018" page, before
 * Origin Forme existed in Pokémon GO raids at all — confirmed by direct
 * inspection: every OTHER Giratina row in later pages, where Origin Forme
 * coexists, explicitly disambiguates with `form=Altered Form`/`Altered
 * Forme`). Documented, not guessed: absent form + dexNum 487 (no suffix)
 * always means Altered here.
 */
const ABSENT_FORM_DEFAULT: Record<string, string> = {
  giratina: "Altered Form",
};

export interface ParseBulbapediaRaidRowsResult {
  rows: BulbapediaRaidRow[];
  /** `{page}: {name}: {rawValue}` samples for rows whose positional HP field didn't match KNOWN_ERA_HP_VALUES — reported, not thrown; the row itself is still kept (just with `hp: undefined`), since HP is a bonus field, not something a row's tier resolution depends on. */
  invalidHpSamples: string[];
}

/**
 * Parses every page's wikitext into raw (unresolved) rows. Pure — does no
 * species matching itself.
 *
 * Iterates `BULBAPEDIA_RAID_ARCHIVE_PAGES` explicitly (the canonical
 * chronological page order) rather than `Object.entries(pages)`/
 * `Object.values(pages)` — 2026-09-07 era-HP backfill task discovered that
 * `pages`' keys include several canonical-numeric-string years ("2019",
 * "2020", "2021", "2022"), and JS's own property-enumeration order silently
 * reorders those AHEAD of non-numeric keys ("2017-2018", "Season_1", ...)
 * regardless of true insertion/chronological order (confirmed by direct
 * observation: `Object.keys` on the cached pages object came back
 * `["2019","2020","2021","2022","2017-2018","Season_1",...]`, NOT
 * chronological). This module's own era-HP "first-valid-row-wins, locked"
 * logic (see sync-data.ts's Bulbapedia per-row reduction loop) depends on
 * true chronological order to correctly prefer an old, pre-collapse tier's
 * real HP (e.g. Tyranitar's old-tier-4 9000) over the same species' later,
 * lower-difficulty reappearance (Tyranitar's current tier-3 3600) — silently
 * processing 2019-2022 before 2017-2018 broke that for any species whose
 * only pre-2019 archived HP differed from its 2019+ HP (e.g. Machamp: 3000
 * in 2017-2018, 3600 from 2019 on).
 */
export function parseBulbapediaRaidRows(pages: Record<string, string>): ParseBulbapediaRaidRowsResult {
  const rows: BulbapediaRaidRow[] = [];
  const invalidHpSamples: string[] = [];

  for (const page of BULBAPEDIA_RAID_ARCHIVE_PAGES) {
    const wikitext = pages[page];
    if (wikitext === undefined) continue; // page failed to fetch this run — see BulbapediaRaidArchiveFetchResult.failedPages
    const lines = stripComments(wikitext).split("\n");
    let bucket: "normal" | "mega" | null = null;
    let normalTier: RaidTier | null = null;

    for (const line of lines) {
      const headMatch = line.match(HEAD_RE);
      if (headMatch) {
        // headMatch[1] is HEAD_RE's sole capture group `([^}]*)` — mandatory
        // (not inside an optional quantifier), so always present whenever
        // headMatch itself is truthy. String.prototype.split always returns
        // an array of at least one element, even for "" or no delimiter
        // found, so index 0 is always present too.
        const token0 = headMatch[1]!.split("|")[0]!.trim();
        if (/^(mega|primal)$/i.test(token0)) {
          bucket = "mega";
          normalTier = null;
        } else if (BULBAPEDIA_NORMAL_TIER_MAP[token0]) {
          bucket = "normal";
          normalTier = BULBAPEDIA_NORMAL_TIER_MAP[token0];
        } else {
          // Unrecognized head token (none expected — see module docstring). Skip rows until the next recognized head rather than guess.
          bucket = null;
          normalTier = null;
        }
        continue;
      }
      const rowMatch = line.match(ROW_RE);
      if (rowMatch && bucket) {
        // rowMatch[1] is ROW_RE's sole mandatory capture group `([^}]*)` —
        // always present whenever rowMatch itself is truthy.
        const { positional, named } = parseTemplateArgs(rowMatch[1]!);
        const name = positional[1];
        if (!name) continue;
        let form = named.form && named.form.length > 0 ? named.form : undefined;
        if (!form && ABSENT_FORM_DEFAULT[name.toLowerCase()]) form = ABSENT_FORM_DEFAULT[name.toLowerCase()];

        // Positional[2] (after dexNum, Name) is this row's own real HP —
        // 2026-09-07 era-HP backfill task. Validated against
        // KNOWN_ERA_HP_VALUES rather than trusted blindly (positional[2] is
        // also, rarely, a genuinely different real-but-out-of-scope HP value
        // — see KNOWN_ERA_HP_VALUES's doc comment).
        let hp: number | undefined;
        const hpCandidate = positional[2];
        if (hpCandidate !== undefined) {
          const hpNum = Number(hpCandidate);
          if (Number.isFinite(hpNum) && KNOWN_ERA_HP_VALUES.has(hpNum)) {
            hp = hpNum;
          } else {
            invalidHpSamples.push(`${page}: ${name}: ${hpCandidate}`);
          }
        }

        rows.push(bucket === "mega" ? { bucket, name, form, hp } : { bucket, name, form, normalTier: normalTier ?? undefined, hp });
      }
    }
  }

  return { rows, invalidHpSamples };
}

export interface BulbapediaShadowRaidRow {
  /** Bare base-species name exactly as this page wrote it (never "Shadow "-prefixed — see fetchAndCacheBulbapediaShadowRaidArchive's doc comment in ./fetchCache.ts for this page's row shape). */
  name: string;
}

/**
 * Parses the single BULBAPEDIA_SHADOW_RAID_ARCHIVE_PAGE (see ./fetchCache.ts)
 * into raw rows — deliberately NOT a bucket/tier-aware parse like
 * parseBulbapediaRaidRows above: every row on this page is a Shadow raid by
 * construction (that's the page's entire subject), and the page's own head
 * token ("Shadow", not a bare "1".."5"/"Mega"/"Primal") doesn't match that
 * parser's HEAD_RE handling anyway. Reuses the same ROW_RE/parseTemplateArgs
 * machinery since the row template itself ({{Lop/raid/GO|...}}) is identical.
 * Pure — does no species matching itself (see sync-data.ts's shadow-
 * durability section for how a caller resolves `name` against the roster).
 */
export function parseBulbapediaShadowRaidPage(wikitext: string): BulbapediaShadowRaidRow[] {
  const rows: BulbapediaShadowRaidRow[] = [];
  for (const line of stripComments(wikitext).split("\n")) {
    const rowMatch = line.match(ROW_RE);
    if (!rowMatch) continue;
    // rowMatch[1] is ROW_RE's sole mandatory capture group `([^}]*)` —
    // always present whenever rowMatch itself is truthy.
    const { positional } = parseTemplateArgs(rowMatch[1]!);
    const name = positional[1];
    if (name) rows.push({ name: normalizeApostrophe(name) });
  }
  return rows;
}

function normalizeApostrophe(s: string): string {
  return s.replace(/[’]/g, "'");
}

/**
 * Translates Bulbapedia's verbose form wording to this project's own
 * `SpeciesDefinition.name` convention (bare "Form2" style suffix, e.g.
 * "Giratina (Altered)"). Confirmed against 5 real cases before trusting the
 * general rule: "Altered Form"->"Altered", "Incarnate Forme"->"Incarnate",
 * "Plant Cloak"->"Plant", "West Sea"->"West Sea" (unchanged — see below),
 * Unown letters unchanged.
 *
 * UPDATED 2026-09-10: this function used to rewrite "West Sea"/"East Sea" to
 * "West_sea"/"East_sea" specifically to match the roster's OLD, underscored
 * `.name` convention (see formDisplayName's doc comment in
 * ./gameMasterMatching.ts for that fix). Now that the roster's own name is
 * cleaned to natural spacing ("Shellos (West Sea)"), rewriting TO an
 * underscore would itself become the mismatch — Bulbapedia's own "West Sea"/
 * "East Sea" text already matches the new convention verbatim, so the
 * special case is simply removed rather than flipped to insert a space (a
 * no-op that would only add confusion).
 */
function normalizeFormText(form: string): string {
  let f = form.trim();
  f = f.replace(/\s+Cloak$/i, "");
  f = f.replace(/\s+Forme?$/i, "");
  f = f.replace(/\s+of Many Battles$/i, "");
  return f;
}

/**
 * A raw form string that survives normalizeFormText but still smells like a
 * REAL alternate form this pipeline's single-form-per-species roster simply
 * doesn't carry (regional Alolan/Galarian/Hisuian, Origin/Therian/Attack/
 * Defense/Speed Forme, Armored Mewtwo, Shellos East Sea) — matched on the RAW
 * (pre-normalization) text so it only ever runs once the exact qualified-name
 * match has already failed. Deliberately NOT used to block the fallback for
 * ordinary costume/event reskins (Party hat, Fall 2019, holiday outfits,
 * Genesect Drives, Spinda patterns, Frillish gender, etc.), which the real
 * game itself treats as stat-identical to the base form (no distinguishing
 * roster entry to fall back FROM in the first place) — see resolveBulbapediaRow's
 * doc comment for the fallback this guards.
 */
const REAL_ALT_FORM_RE = /\bform\b|forme|cloak|east sea|west sea|armored/i;

export interface BaseNameIndex {
  /** Species id keyed by the FULL qualified name (species.name), normalized apostrophe + lowercased. */
  byQualifiedName: Map<string, string>;
  /** Species id keyed by the name's base token (portion before " (", or the whole name if unqualified), normalized apostrophe + lowercased — ONLY for base names with exactly one roster entry (this pipeline's one-form-per-species scope guarantees that's the common case; see buildBaseNameIndex). */
  byUniqueBaseName: Map<string, string>;
}

/** Builds the two lookup indexes resolveBulbapediaRow needs from the full final species roster (ordinary + mega/primal + Shadow — same pool sync-data.ts's own speciesIdByNameLower already uses for the pogoapi-previous backfill). */
export function buildBaseNameIndex(species: Pick<SpeciesDefinition, "id" | "name">[]): BaseNameIndex {
  const byQualifiedName = new Map<string, string>();
  const baseNameCandidates = new Map<string, string[]>();
  for (const s of species) {
    const qualified = normalizeApostrophe(s.name).toLowerCase();
    byQualifiedName.set(qualified, s.id);
    // String.prototype.split always returns an array of at least one
    // element, even for a string with no "(" present, so index 0 is always defined.
    const base = normalizeApostrophe(s.name).split("(")[0]!.trim().toLowerCase();
    if (!baseNameCandidates.has(base)) baseNameCandidates.set(base, []);
    baseNameCandidates.get(base)!.push(s.id);
  }
  const byUniqueBaseName = new Map<string, string>();
  for (const [base, ids] of baseNameCandidates) {
    // The length check just above guarantees index 0 exists.
    if (ids.length === 1) byUniqueBaseName.set(base, ids[0]!);
  }
  return { byQualifiedName, byUniqueBaseName };
}

export interface ResolvedBulbapediaRow {
  speciesId: string;
  raidName: string;
  tier: RaidTier;
  /** True when resolution fell back to the species' bare/base roster entry because the specific costume/event form Bulbapedia named isn't (and doesn't need to be) modeled separately — see REAL_ALT_FORM_RE's doc comment. Surfaced only for the sync report, not stored on the entry itself. */
  viaBaseNameFallback: boolean;
  /** This row's own real HP (see BulbapediaRaidRow.hp), carried through resolution unchanged — 2026-09-07 era-HP backfill task. */
  eraHp?: number;
}

/**
 * Resolves one raw parsed row to a registered species id + RaidTier, or null
 * if unresolvable. Mirrors sync-data.ts's existing pogoapi-previous
 * resolution shape (qualified-name lookup against the full final roster) but
 * adds one extra fallback step this source needs and pogoapi's `previous`
 * list didn't: retrying against the species' bare/base roster entry when the
 * exact qualified form doesn't exist AND the named form doesn't look like a
 * real alternate form (see REAL_ALT_FORM_RE) — because unlike pogoapi's own
 * `form` field (already pre-normalized to this project's vocabulary),
 * Bulbapedia also names purely cosmetic reskins (event costumes, Genesect
 * Drives, Spinda patterns, Frillish gender, Furfrou trim) that this pipeline
 * never models as separate species at all. Safe specifically because this
 * pipeline's roster is one-form-per-species: a base name has AT MOST one
 * roster entry (byUniqueBaseName), so there is never a real second form to
 * confuse the fallback with — see buildBaseNameIndex.
 */
export function resolveBulbapediaRow(
  row: BulbapediaRaidRow,
  index: BaseNameIndex,
  speciesById: Map<string, SpeciesDefinition>,
  defaultRaidTierForSpecies: (species: SpeciesDefinition) => RaidTier,
): ResolvedBulbapediaRow | null {
  const rawName = normalizeApostrophe(row.name);
  const strippedShadow = rawName.replace(/^Shadow\s+/i, "");

  if (row.bucket === "mega") {
    // Bulbapedia's own `form=` text for a mega/primal row already matches
    // this project's SpeciesDefinition.name convention exactly (e.g. "Mega
    // Charizard X", "Primal Kyogre") — confirmed by direct inspection — with
    // one wrinkle: a costume-mega row (Mega Lopunny's flower-crown event) hid
    // an HTML `<br>` inside the form text, so anything after it is stripped.
    if (!row.form) return null;
    // String.prototype.split always returns an array of at least one
    // element, even when the <br> pattern never matches, so index 0 is always defined.
    const megaName = normalizeApostrophe(row.form).split(/<br\s*\/?>/i)[0]!.trim();
    const speciesId = index.byQualifiedName.get(megaName.toLowerCase());
    if (!speciesId) return null;
    const species = speciesById.get(speciesId);
    if (!species) return null;
    return { speciesId, raidName: megaName, tier: defaultRaidTierForSpecies(species), viaBaseNameFallback: false, eraHp: row.hp };
  }

  // bucket "normal"
  if (!row.normalTier) return null;
  let qualifiedName: string;
  if (!row.form) {
    qualifiedName = strippedShadow;
  } else {
    const normalizedForm = normalizeFormText(row.form);
    qualifiedName = normalizedForm.toLowerCase() === "normal" ? strippedShadow : `${strippedShadow} (${normalizedForm})`;
  }

  const exactId = index.byQualifiedName.get(qualifiedName.toLowerCase());
  if (exactId) {
    return { speciesId: exactId, raidName: qualifiedName, tier: row.normalTier, viaBaseNameFallback: false, eraHp: row.hp };
  }

  const looksLikeRealAltForm = row.form ? REAL_ALT_FORM_RE.test(row.form) : false;
  if (!looksLikeRealAltForm) {
    const fallbackId = index.byUniqueBaseName.get(strippedShadow.toLowerCase());
    if (fallbackId) {
      return { speciesId: fallbackId, raidName: strippedShadow, tier: row.normalTier, viaBaseNameFallback: true, eraHp: row.hp };
    }
  }

  return null;
}
