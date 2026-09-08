/**
 * Docs-drift guard. This repo's recurring trap (per HANDOFF.md and the overseer's memory) is
 * that CLAUDE.md, the add-scenario-assumption skill, the web-developer agent, and the round-trip
 * checker each carry their own copy of "what tabs exist" and "what commands exist", and one of
 * them gets left behind when a tab or script is added. This script cross-checks the copies
 * against the code they describe and exits non-zero naming the stale one.
 *
 *   1. Tabs:     App.tsx's `AppTab` union  ==  check-scenario-roundtrip's TABS count
 *                                          ==  the skill's Step-0 table rows
 *                                          ==  the spelled-out count word in CLAUDE.md's repo layout
 *   2. Params:   the query params CLAUDE.md lists  ==  the params in the skill table
 *   3. Commands: every `npm run <x>` mentioned in CLAUDE.md, HANDOFF.md, or any skill/agent
 *                exists in package.json's scripts.
 *   4. Agents:   every `.claude/agents/<name>.md` is routed in CLAUDE.md's "Subagents and
 *                routing" section, and every routed name has a file.
 *   5. Skills:   every `.claude/skills/<name>/` is mentioned in CLAUDE.md.
 *   6. Plans:    no PLAN_*.md remains for a feature HANDOFF.md describes as shipped/landed.
 *
 * Run: `npm run check-docs-drift` (also part of `npm run check` / `npm run verify`).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(repoRoot, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(repoRoot, p));

const problems = [];
const ok = (msg) => console.log(`ok   ${msg}`);
const fail = (msg) => {
  problems.push(msg);
  console.error(`FAIL ${msg}`);
};

const claude = read('CLAUDE.md');
const handoff = read('HANDOFF.md');
const pkg = JSON.parse(read('package.json'));

const COUNT_WORDS = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve' };
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

// ---- 1. Tabs -------------------------------------------------------------------------------
const appTsx = read('packages/web/src/App.tsx');
const unionMatch = appTsx.match(/export type AppTab =([\s\S]*?);/);
const appTabs = unionMatch ? [...unionMatch[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]) : [];
if (appTabs.length === 0) fail('could not parse the AppTab union in packages/web/src/App.tsx');

const roundtrip = read('scripts/check-scenario-roundtrip.mjs');
const tabsBlock = roundtrip.match(/const TABS = \[([\s\S]*?)\n\];/);
const roundtripRows = tabsBlock ? (tabsBlock[1].match(/^\s*\[/gm) || []).length : 0;

const skillPath = '.claude/skills/add-scenario-assumption/SKILL.md';
const skill = exists(skillPath) ? read(skillPath) : '';
const skillRows = [...skill.matchAll(/^\| [^|\n]+\(`([a-z]+)`\) \|/gm)].map((m) => m[1]);

const claudeTabCount = claude.match(/\*\*([A-Z][a-z]+)\*\*\s+tab-switched views/);
const claudeCountWord = claudeTabCount ? claudeTabCount[1].toLowerCase() : null;

if (appTabs.length && roundtripRows !== appTabs.length)
  fail(`App.tsx has ${appTabs.length} tabs but scripts/check-scenario-roundtrip.mjs has ${roundtripRows} TABS rows`);
else ok(`round-trip checker covers all ${appTabs.length} tabs`);

if (appTabs.length && skillRows.length !== appTabs.length)
  fail(`App.tsx has ${appTabs.length} tabs but ${skillPath}'s Step-0 table has ${skillRows.length} rows`);
else ok(`add-scenario-assumption table lists all ${appTabs.length} tabs`);

if (claudeCountWord && COUNT_WORDS[appTabs.length] !== claudeCountWord)
  fail(`CLAUDE.md says "${claudeCountWord} tab-switched views" but App.tsx has ${appTabs.length}`);
else if (claudeCountWord) ok(`CLAUDE.md tab count word ("${claudeCountWord}") matches App.tsx`);

// ---- 2. Params -----------------------------------------------------------------------------
const paramLine = claude.match(/URL query param \(([^)]+)\)/);
const claudeParams = paramLine ? [...paramLine[1].matchAll(/`([a-z]+)`/g)].map((m) => m[1]) : [];
const appParamBlock = appTsx.match(/\(`s` for Scenario[\s\S]*?\)/);
const appParams = appParamBlock ? [...appParamBlock[0].matchAll(/`([a-z]+)` for/g)].map((m) => m[1]) : [];
if (claudeParams.length && !sameSet(claudeParams, skillRows))
  fail(`CLAUDE.md query params (${claudeParams.join(', ')}) != skill table params (${skillRows.join(', ')})`);
else ok(`query params agree between CLAUDE.md and the skill table (${claudeParams.join(', ')})`);
if (appParams.length && !sameSet(appParams, skillRows))
  fail(`App.tsx's documented params (${appParams.join(', ')}) != skill table params (${skillRows.join(', ')})`);

// ---- 3. Commands ---------------------------------------------------------------------------
const docFiles = ['CLAUDE.md', 'HANDOFF.md'];
for (const d of ['.claude/skills', '.claude/agents']) {
  if (!exists(d)) continue;
  for (const entry of fs.readdirSync(path.join(repoRoot, d), { withFileTypes: true })) {
    if (entry.isDirectory() && exists(`${d}/${entry.name}/SKILL.md`)) docFiles.push(`${d}/${entry.name}/SKILL.md`);
    else if (entry.isFile() && entry.name.endsWith('.md')) docFiles.push(`${d}/${entry.name}`);
  }
}
const scriptNames = new Set(Object.keys(pkg.scripts));
let badCmds = 0;
for (const f of docFiles) {
  const text = read(f);
  for (const m of text.matchAll(/npm run ([a-z][a-z0-9:-]*)/g)) {
    const name = m[1];
    // `npm run <x> --workspace=...` refers to a workspace script; only root scripts are checked.
    const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 20);
    if (/^\s+--workspace/.test(tail)) continue;
    if (!scriptNames.has(name)) {
      fail(`${f} mentions "npm run ${name}" but package.json has no such script`);
      badCmds++;
    }
  }
}
if (!badCmds) ok(`every "npm run <x>" in ${docFiles.length} doc files exists in package.json`);

// ---- 4. Agents -----------------------------------------------------------------------------
const agentFiles = exists('.claude/agents')
  ? fs.readdirSync(path.join(repoRoot, '.claude/agents')).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''))
  : [];
const routingSection = claude.split(/^## Subagents and routing/m)[1]?.split(/^## /m)[0] ?? '';
const routedAgents = [...routingSection.matchAll(/^- \*\*`([a-z-]+)`\*\*/gm)].map((m) => m[1]);
for (const a of agentFiles) if (!routedAgents.includes(a)) fail(`.claude/agents/${a}.md exists but CLAUDE.md's "Subagents and routing" never routes to it`);
for (const a of routedAgents) if (!agentFiles.includes(a)) fail(`CLAUDE.md routes to \`${a}\` but .claude/agents/${a}.md does not exist`);
const agentCountWord = claude.match(/has \*{0,2}([a-z]+)\*{0,2} project-specific subagents/);
if (agentCountWord && COUNT_WORDS[agentFiles.length] !== agentCountWord[1])
  fail(`CLAUDE.md says "${agentCountWord[1]} project-specific subagents" but .claude/agents has ${agentFiles.length}`);
if (agentFiles.length && sameSet(agentFiles, routedAgents)) ok(`all ${agentFiles.length} agents are routed in CLAUDE.md`);

// ---- 5. Skills -----------------------------------------------------------------------------
const skillDirs = exists('.claude/skills')
  ? fs.readdirSync(path.join(repoRoot, '.claude/skills'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
  : [];
let badSkills = 0;
for (const s of skillDirs) {
  if (!claude.includes(`\`${s}\``)) {
    fail(`.claude/skills/${s}/ exists but CLAUDE.md never mentions \`${s}\``);
    badSkills++;
  }
}
const skillCountWord = claude.match(/has \*{0,2}([a-z]+)\*{0,2} project-specific\s+skills/);
if (skillCountWord && COUNT_WORDS[skillDirs.length] !== skillCountWord[1])
  fail(`CLAUDE.md says "${skillCountWord[1]} project-specific skills" but .claude/skills has ${skillDirs.length}`);
if (!badSkills) ok(`all ${skillDirs.length} skills are mentioned in CLAUDE.md`);

// ---- 6. Plans ------------------------------------------------------------------------------
const plans = fs.readdirSync(repoRoot).filter((f) => /^PLAN_.*\.md$/.test(f));
let badPlans = 0;
const SHIPPED = /\b(shipped|landed|implemented|resolved|deleted)\b/i;
const PENDING = /\b(pending|not yet|untouched|unshipped|still)\b/i;
for (const p of plans) {
  const lines = handoff.split('\n').filter((l) => l.includes(p));
  const shippedLine = lines.find((l) => SHIPPED.test(l) && !PENDING.test(l));
  if (shippedLine) {
    fail(`${p} still exists but HANDOFF.md describes it as shipped: "${shippedLine.trim().slice(0, 120)}"`);
    badPlans++;
  }
}
if (!badPlans) ok(`${plans.length} PLAN_*.md file(s) present, none described as shipped in HANDOFF.md`);

// ---- result --------------------------------------------------------------------------------
if (problems.length) {
  console.error(`\n${problems.length} docs-drift problem(s). Fix the stale copy, not the checker.`);
  process.exit(1);
}
console.log('\nDocs agree with the code they describe.');
