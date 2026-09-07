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
 * mechanical version of that checklist's step 3: it extracts every top-level
 * field of each tab's `Assumptions` interface and asserts the field name
 * appears in BOTH round-trip directions.
 *
 * Run it after adding any setting to any tab:
 *     npm run check-scenario-roundtrip
 * Exits non-zero if a field is missing from either direction.
 *
 * Deliberate limitations — this is a cheap name-level check, not a type
 * checker. It proves a field is *mentioned* in both functions, not that it is
 * mapped correctly, and it can't see fields wired through a spread. It is a
 * fast smoke test that catches the actual historical failure (a field simply
 * forgotten), not a substitute for the round-trip test or the manual
 * share-link check the skill also asks for.
 *
 * Three of the five Scenario types (`speciesReportScenario`,
 * `ivBreakpointsScenario`, `attackDefenseBreakpointsScenario`) are web-only and
 * have no automated tests at all, since `packages/web` has no vitest setup —
 * for those three this script is currently the ONLY automated coverage of the
 * round-trip, so keep it working.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** [label, file declaring Assumptions, interface name, file with the round-trip, toScenario fn, fromScenario fn] */
const TABS = [
  ['Comparator', 'packages/web/src/AssumptionPanel.tsx', 'Assumptions', 'packages/web/src/ComparatorView.tsx', 'assumptionsToScenario', 'scenarioToAssumptions'],
  ['Team Raid', 'packages/web/src/TeamAssumptionPanel.tsx', 'TeamAssumptions', 'packages/web/src/TeamRaidView.tsx', 'assumptionsToTeamScenario', 'teamScenarioToAssumptions'],
  ['Species Report', 'packages/web/src/SpeciesReportView.tsx', 'SpeciesReportAssumptions', 'packages/web/src/SpeciesReportView.tsx', 'assumptionsToScenario', 'scenarioToAssumptions'],
  ['IV Breakpoints', 'packages/web/src/IvBreakpointsView.tsx', 'IvBreakpointsAssumptions', 'packages/web/src/IvBreakpointsView.tsx', 'assumptionsToScenario', 'scenarioToAssumptions'],
  ['Attack/Defense', 'packages/web/src/AttackDefenseBreakpointsView.tsx', 'AttackDefenseBreakpointsAssumptions', 'packages/web/src/AttackDefenseBreakpointsView.tsx', 'assumptionsToScenario', 'scenarioToAssumptions'],
];

/** Lines of the block opened by the line matching `re`, up to the first column-0 `}`. */
function blockLines(file, re) {
  const lines = fs.readFileSync(path.join(repoRoot, file), 'utf8').split('\n');
  const start = lines.findIndex((l) => re.test(l));
  if (start < 0) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\}/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out;
}

const mentions = (field) => new RegExp('\\b' + field + '\\b');

let failures = 0;
let checked = 0;

for (const [label, ifile, iname, rfile, toFn, fromFn] of TABS) {
  const body = blockLines(ifile, new RegExp('interface\\s+' + iname + '\\s*\\{'));
  if (!body) {
    console.error(`FAIL ${label}: interface ${iname} not found in ${ifile} (renamed or moved?)`);
    failures++;
    continue;
  }

  // Two-space indent only == top-level members; skips nested object literals.
  const fields = [];
  for (const line of body) {
    const m = line.match(/^ {2}([a-zA-Z_]\w*)\??\s*:/);
    if (m) fields.push(m[1]);
  }

  const toBody = blockLines(rfile, new RegExp('function\\s+' + toFn + '\\b'));
  const fromBody = blockLines(rfile, new RegExp('function\\s+' + fromFn + '\\b'));
  if (!toBody || !fromBody) {
    console.error(`FAIL ${label}: could not find ${!toBody ? toFn : fromFn} in ${rfile} (renamed or moved?)`);
    failures++;
    continue;
  }

  const toText = toBody.join('\n');
  const fromText = fromBody.join('\n');
  const missingTo = fields.filter((f) => !mentions(f).test(toText));
  const missingFrom = fields.filter((f) => !mentions(f).test(fromText));
  checked += fields.length;

  if (missingTo.length || missingFrom.length) {
    failures++;
    console.error(`FAIL ${label} (${fields.length} fields)`);
    if (missingTo.length) console.error(`  never written to Scenario (won't survive a share link): ${missingTo.join(', ')}`);
    if (missingFrom.length) console.error(`  never read back (will revert to default on load): ${missingFrom.join(', ')}`);
  } else {
    console.log(`ok   ${label}: all ${fields.length} fields round-trip`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} tab(s) have an assumption that will not survive a shared link.`);
  console.error('See .claude/skills/add-scenario-assumption/ for the full checklist.');
  process.exit(1);
}

console.log(`\nAll ${checked} assumption fields across ${TABS.length} tabs round-trip in both directions.`);
