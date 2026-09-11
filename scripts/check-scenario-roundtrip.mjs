/**
 * Static guard for this project's most-repeated bug class.
 *
 * Every tab has an `Assumptions` interface (the UI's live state) and its own
 * `Scenario` type (what gets encoded into a shareable URL). Keeping the two in
 * sync is a manual contract that the type system does NOT enforce — an
 * `Assumptions` field simply left out of `assumptionsToScenario` /
 * `scenarioToAssumptions` compiles fine, works fine in the current session, and
 * only breaks when someone opens a shared link, at which point the field
 * silently reverts to its default and the recipient sees a different result
 * than the sender meant to share.
 *
 * That has happened at least twice for real (`teammateTypeMatches`, then
 * `bossChargedMoveFrequencySeconds`), which is why `.claude/skills/
 * add-scenario-assumption/` exists as a checklist. This script is the
 * mechanical version of that checklist's step 3: it extracts every field of
 * each tab's `Assumptions` interface — INCLUDING fields nested inside an
 * array-element type, see below — and asserts the field name appears in BOTH
 * round-trip directions.
 *
 * Run it after adding any setting to any tab:
 *     npm run check-scenario-roundtrip
 * Exits non-zero if a field is missing from either direction.
 *
 * Recursion into array-element types (added 2026-09-10) — a field typed
 * `SomeType[]` (element type name starting uppercase, e.g.
 * `slots: TeamSlotAssumption[]`) is followed into `interface SomeType { ... }`
 * in the SAME source file, and every one of ITS members is checked too,
 * recursively. Before this, `slots: TeamSlotAssumption[]` counted as one
 * opaque field — the round-trip function bodies mention "slots" (via
 * `a.slots.map(...)`) so the top-level check passed, but no per-slot field
 * (`speciesId`, `fastMoveId`, `isMega`, `megaLevel`, `isShadow`, ...) was ever
 * independently verified in either direction. That was a real blind spot,
 * not a hypothetical one: it is exactly the shape of TeamAssumptions.slots
 * and PowerUpOptimizerAssumptions.slots, both real per-slot roster configs.
 * A nested field's report label is `arrayField[].nestedField` so a failure
 * names the array, not just a bare field name that might collide with
 * something else. Deliberately scoped to `Foo[]`-shaped members only (not
 * every nested single-object field, e.g. `ivA: IVSpread`) — a single nested
 * object is always copied as one atomic reference in every case observed in
 * this codebase (`ivA: a.ivA`), so the top-level field-name check already
 * guards it; recursion only matters where a `.map()` destructures the object
 * back apart per element, which is where the actual historical bug lives.
 * Do not re-narrow this back to top-level-only — that is precisely the gap
 * this revision closed.
 *
 * Deliberate limitations — this is a cheap name-level check, not a type
 * checker. It proves a field is *mentioned* in both functions, not that it is
 * mapped correctly, and it can't see fields wired through a spread. It is a
 * fast smoke test that catches the actual historical failure (a field simply
 * forgotten), not a substitute for the round-trip test or the manual
 * share-link check the skill also asks for. It also does not follow a
 * `Record<string, SomeType>` value type (e.g. PowerUpOptimizerAssumptions'
 * own `candyByFamilyId`) — a Record's keys are dynamic data, not named
 * fields, and every such field observed so far is copied wholesale (never
 * decomposed per-key), so the top-level check already covers it the same way
 * a single nested object does.
 *
 * Four of the six Scenario types (`speciesReportScenario`,
 * `ivBreakpointsScenario`, `attackDefenseBreakpointsScenario`,
 * `powerUpOptimizerScenario`) are web-only and have no automated tests at
 * all, since `packages/web` has no vitest setup — for those four this script
 * is currently the ONLY automated coverage of the round-trip, so keep it
 * working.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** [label, file declaring Assumptions, interface name, file with the round-trip, toScenario fn, fromScenario fn] */
export const TABS = [
  ['Comparator', 'packages/web/src/AssumptionPanel.tsx', 'Assumptions', 'packages/web/src/ComparatorView.tsx', 'assumptionsToScenario', 'scenarioToAssumptions'],
  ['Team Raid', 'packages/web/src/TeamAssumptionPanel.tsx', 'TeamAssumptions', 'packages/web/src/TeamRaidView.tsx', 'assumptionsToTeamScenario', 'teamScenarioToAssumptions'],
  ['Species Report', 'packages/web/src/SpeciesReportView.tsx', 'SpeciesReportAssumptions', 'packages/web/src/SpeciesReportView.tsx', 'assumptionsToScenario', 'scenarioToAssumptions'],
  ['IV Breakpoints', 'packages/web/src/IvBreakpointsView.tsx', 'IvBreakpointsAssumptions', 'packages/web/src/IvBreakpointsView.tsx', 'assumptionsToScenario', 'scenarioToAssumptions'],
  ['Attack/Defense', 'packages/web/src/AttackDefenseBreakpointsView.tsx', 'AttackDefenseBreakpointsAssumptions', 'packages/web/src/AttackDefenseBreakpointsView.tsx', 'assumptionsToScenario', 'scenarioToAssumptions'],
  ['Power-Up Optimizer', 'packages/web/src/PowerUpOptimizerAssumptionPanel.tsx', 'PowerUpOptimizerAssumptions', 'packages/web/src/PowerUpOptimizerView.tsx', 'assumptionsToScenario', 'scenarioToAssumptions'],
  ['Roster', 'packages/web/src/RosterView.tsx', 'RosterAssumptions', 'packages/web/src/RosterView.tsx', 'assumptionsToScenario', 'scenarioToAssumptions'],
];

/** Lines of the block opened by the line matching `re` within an already-split `lines` array, up to the first column-0 `}`. Pure — no filesystem access, so it's directly unit-testable against synthetic source text. */
export function blockLinesFromLines(lines, re) {
  const start = lines.findIndex((l) => re.test(l));
  if (start < 0) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\}/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out;
}

/** Reads a repo-relative file and splits it into lines. Normalizes CRLF — some files in this repo (e.g. PowerUpOptimizerAssumptionPanel.tsx) are saved with Windows line endings, and a trailing `\r` broke the member-type regex below (it counts as a line terminator, so `.` can't consume it and a naive `$`-anchored pattern never matches). */
export function readLines(file) {
  return fs.readFileSync(path.join(repoRoot, file), 'utf8').replace(/\r\n/g, '\n').split('\n');
}

const MEMBER_RE = /^ {2}([a-zA-Z_]\w*)\??\s*:\s*(.+)$/;
/** Element type of a `Foo[]`-shaped member worth recursing into — PascalCase only, so `string[]`/`number[]`/tuple types (`[boolean, boolean]`) are left as opaque top-level fields. */
const CUSTOM_ARRAY_TYPE_RE = /^([A-Z]\w*)\[\]$/;

function cleanType(text) {
  return text.replace(/\/\/.*/, '').trim().replace(/;\s*$/, '').trim();
}

function findInterfaceBody(lines, interfaceName) {
  return blockLinesFromLines(lines, new RegExp('interface\\s+' + interfaceName + '\\s*\\{'));
}

/**
 * Flattens `interfaceName`'s members (as declared somewhere in `lines`) into
 * checkable `{ name, label }` entries, recursing into any member typed as a
 * PascalCase `SomeType[]` by looking up `interface SomeType { ... }` in the
 * same `lines` and flattening its members too. `name` is the bare field name
 * actually searched for in the round-trip function text; `label` carries the
 * full `arrayField[].nestedField` path for reporting. Returns `null` if
 * `interfaceName` itself can't be found (renamed/moved). Guards against a
 * self-referential or mutually-recursive type cycling forever via `visited`.
 */
export function collectFields(lines, interfaceName, prefix = '', visited = new Set()) {
  if (visited.has(interfaceName)) return [];
  const body = findInterfaceBody(lines, interfaceName);
  if (!body) return null;
  const nextVisited = new Set(visited).add(interfaceName);

  const out = [];
  for (const rawLine of body) {
    // Defensive CRLF strip — callers are expected to normalize (readLines/
    // checkRoundTrip both do), but MEMBER_RE's trailing `$` anchor is fragile
    // to a stray `\r` (a line terminator `.` can't consume), so guard here
    // too rather than relying on every caller remembering to normalize first.
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    const m = line.match(MEMBER_RE);
    if (!m) continue;
    const [, name, rawType] = m;
    const label = prefix + name;
    out.push({ name, label });

    const arrayMatch = cleanType(rawType).match(CUSTOM_ARRAY_TYPE_RE);
    if (arrayMatch) {
      const nested = collectFields(lines, arrayMatch[1], `${label}[].`, nextVisited);
      if (nested) out.push(...nested);
    }
  }
  return out;
}

const mentions = (field) => new RegExp('\\b' + field + '\\b');

/**
 * Core check for one tab, decoupled from the filesystem so it's directly
 * unit-testable: given the Assumptions interface's declaring source
 * (`interfaceSource`, containing `interfaceName` and any array-element types
 * it references), and the exact text of the `toScenario`/`fromScenario`
 * function bodies, returns every checked field plus which ones are missing
 * from each direction.
 */
export function checkRoundTrip({ interfaceSource, interfaceName, toText, fromText }) {
  const fields = collectFields(interfaceSource.replace(/\r\n/g, '\n').split('\n'), interfaceName);
  if (!fields) return { error: `interface ${interfaceName} not found` };
  const missingTo = fields.filter((f) => !mentions(f.name).test(toText)).map((f) => f.label);
  const missingFrom = fields.filter((f) => !mentions(f.name).test(fromText)).map((f) => f.label);
  return { fields, missingTo, missingFrom };
}

function runCli() {
  let failures = 0;
  let checked = 0;
  let nestedChecked = 0;

  for (const [label, ifile, iname, rfile, toFn, fromFn] of TABS) {
    const ifileLines = readLines(ifile);
    const toBody = blockLinesFromLines(readLines(rfile), new RegExp('function\\s+' + toFn + '\\b'));
    const fromBody = blockLinesFromLines(readLines(rfile), new RegExp('function\\s+' + fromFn + '\\b'));
    if (!toBody || !fromBody) {
      console.error(`FAIL ${label}: could not find ${!toBody ? toFn : fromFn} in ${rfile} (renamed or moved?)`);
      failures++;
      continue;
    }

    const result = checkRoundTrip({
      interfaceSource: ifileLines.join('\n'),
      interfaceName: iname,
      toText: toBody.join('\n'),
      fromText: fromBody.join('\n'),
    });
    if (result.error) {
      console.error(`FAIL ${label}: ${result.error} in ${ifile} (renamed or moved?)`);
      failures++;
      continue;
    }

    const { fields, missingTo, missingFrom } = result;
    const nested = fields.filter((f) => f.label.includes('[].'));
    checked += fields.length;
    nestedChecked += nested.length;

    if (missingTo.length || missingFrom.length) {
      failures++;
      console.error(`FAIL ${label} (${fields.length} fields, ${nested.length} nested)`);
      if (missingTo.length) console.error(`  never written to Scenario (won't survive a share link): ${missingTo.join(', ')}`);
      if (missingFrom.length) console.error(`  never read back (will revert to default on load): ${missingFrom.join(', ')}`);
    } else if (nested.length) {
      const nestedArrays = [...new Set(nested.map((f) => f.label.slice(0, f.label.indexOf('[].') + 3)))];
      console.log(`ok   ${label}: all ${fields.length} fields round-trip (${fields.length - nested.length} top-level + ${nested.length} nested in ${nestedArrays.join(', ')})`);
    } else {
      console.log(`ok   ${label}: all ${fields.length} fields round-trip`);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} tab(s) have an assumption that will not survive a shared link.`);
    console.error('See .claude/skills/add-scenario-assumption/ for the full checklist.');
    process.exit(1);
  }

  console.log(`\nAll ${checked} assumption fields (including ${nestedChecked} nested inside per-slot arrays) across ${TABS.length} tabs round-trip in both directions.`);
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  runCli();
}
