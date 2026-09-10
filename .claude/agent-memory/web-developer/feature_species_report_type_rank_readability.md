---
name: feature_species_report_type_rank_readability
description: Species Report readability pass (2026-09-10) — renamed "Type-matchup percentile" to "Type rank" with a tooltip, cut the caveats paragraph and crossover verdict down hard using the existing prose-details pattern; plus a real Bash-heredoc Windows-path bug and a CollapsibleSection selector gotcha found while verifying
metadata:
  type: feedback
---

Pure display-only task (no Scenario/Assumptions field touched — `sortMode`'s internal value
`"typeMatchup"` was NOT renamed, only its visible label; `check-scenario-roundtrip` still reports
exactly 16 Species Report fields before and after). Confirmed the underlying engine semantics
first, against `packages/engine/src/speciesReport.ts`, rather than trusting the task's paraphrase:
`offensiveTypeMatchup` = max(typeEffectiveness(fastType, bossTypes), typeEffectiveness(chargedType,
bossTypes)) — pure type chart; `typeMatchupPercentile(value, corpus)` = fraction of the corpus
(every REGISTERED species' own DEFAULT moveset, computed fresh per boss) that `value` beats or
ties. Both confirmed genuinely worth keeping (not a "this stat isn't worth its column" case) —
said so explicitly rather than silently agreeing just because removal wasn't asked for.

**The fix, in the pattern this codebase already established for "control is simple, its full
justification is not" (megaLevelSelect.tsx / bossCadence.tsx's `<details className="prose-details">`
+ `<summary>`), applied here for the first time to a RESULT explanation rather than an input
control's own caveat:** renamed the column header "Type-matchup percentile" -> "Type rank" (pairs
naturally with the body's "top 12%" and with the neighboring "Type matchup" raw-value column) with
a `title` tooltip carrying the full one-sentence definition (`<th title="...">`, the exact existing
pattern from `PowerUpOptimizerView.tsx`'s own headers — grepped for precedent before inventing a
new one). Cut the `<p className="caveats">` above the table from ~8 lines (5 sentences covering
methodology, the type-percentile distinction, AND the roster-scope caveat all at once) down to 2
short sentences that keep ONLY the genuinely load-bearing part (simulated vs. cheap-type-chart —
confusing the two would be a real misread), moving the full methodology + roster-scope prose into a
new collapsed `<details className="prose-details">` right below it. Shortened the crossover verdict
sentence (the `.crossover-note` box, which already prepends a "VERDICT"/"Ranking flip" label via
CSS `::before` — so the sentence itself never needs to restate "this is the finding") from a
two-clause 50+-word sentence to one ~20-word sentence that still names both winners and which to
trust. Renamed the sort button to match ("Sort: type rank"). Total visible-prose line count in the
ranked-results panel dropped from ~8 lines to 3 (plus one always-collapsed summary line) — confirmed
via a live 1920x1080 screenshot with Assumptions collapsed: the full "Ranked against N raid bosses"
panel (heading, short caveat, collapsed methodology toggle, sort buttons, verdict callout, AND
several table rows) now fits in one 1080p viewport with zero scrolling.

**A genuinely dangerous Bash-tool gotcha, found and worked around**: writing a multi-line `.mjs`
script via a Bash heredoc (`cat > file.mjs <<'EOF' ... EOF`, single-quoted delimiter) that contains
a JS string literal with Windows-path double-backslashes (`"C:\\Users\\Jack\\..."`) silently
collapses each `\\` to a single `\` somewhere in the tool's parameter transport — NOT a bash
escaping issue (the heredoc IS quoted) but something upstream of bash seeing the command. The
resulting file on disk has single backslashes (`"C:\Users\Jack\..."`), which Node/Windows then
resolves as a **drive-relative path** (`C:foo` with no leading `\` means "relative to drive C's
CURRENT working directory," an obscure Windows path-semantics corner, NOT `C:\foo`) — so
`fs.existsSync()`/`page.screenshot()` reported SUCCESS while silently writing the file into
`packages/web/` (the script's cwd) under a mangled single-segment filename
(`UsersJackAppDataLocal...scratchpadspecies-report-...png`), not the intended scratchpad path. No
error was ever thrown; the only tell was the target directory's own `ls` not showing the expected
file. Confirmed via `cat -A` on the written script file that the bytes really were single
backslashes, not a display artifact. **Fix: use forward slashes in any JS/Node path string authored
via a Bash heredoc** (`"C:/Users/Jack/.../scratchpad"` — Node's fs APIs accept `/` natively on
Windows) rather than fighting the escaping. The `Write` tool does NOT have this problem (the first
scratch script in this session, authored via `Write` with real double-backslashes, worked
correctly first try) — so the safer general rule is: **use `Write` for a scratch script that needs
literal Windows backslashes in a string; if using a Bash heredoc instead, use forward slashes.**
Left two stray mangled-path PNGs behind in `packages/web/` before catching this — `git status`
after cleanup is what surfaced them (they don't match any `.gitignore` pattern since the "directory"
name is really just part of a single garbled filename), worth checking for on any future session
that hits the same silent-success symptom.

**`CollapsibleSection`'s `id` prop is a localStorage key only — it is NEVER rendered as a DOM
`id` attribute.** A Playwright script targeting `#some-id summary` will hang until timeout with no
useful error (the selector just never matches). Correct selector: `page.locator('summary', {
hasText: "Assumptions" })` (or `summary:has-text(...)`) — matches this memory index's existing
[[feature_collapsible_sections]] note about `xpath=ancestor::details[1]` for a different angle on
the same underlying fact (the heading lives INSIDE `<summary>`, and neither carries the section's
own `id`).

**Found, verified, and deliberately left alone (out of scope)**: column 2 ("Type matchup", NOT
renamed by this task) has a real ~6px header-text clipping overflow at 1920x1080 —
`getComputedStyle`/`getBoundingClientRect` showed `scrollWidth: 71` vs. `clientWidth: 65` for that
`<th>`, visually clipping the "P" off "MATCHUP" (confirmed via an element-scoped screenshot, not
just the numbers). Root cause looks like the existing `nth-child(2) { max-width: 7ch }` rule being
sized from the AUTHORED mixed-case string ("Type matchup") rather than the RENDERED uppercase one
(`text-transform: uppercase` makes "MATCHUP" wider than the ch-budget assumed) — the exact same
category of bug this task's own column-3 rename had to avoid reintroducing, confirmed clean there
(`scrollWidth === clientWidth === 74`, checked before shipping). Did not touch column 2's rule: it
wasn't renamed by this task, the task's own instructions only authorized updating the nth-child rule
tied to a column THIS task renamed, and the actual fix isn't a trivial ch-bump — measured that
`clientWidth` (65px) doesn't even match the rule's own specified `max-width` (53px, i.e. 7ch),
meaning the table's auto-layout column-width algorithm is already overriding that property for
reasons not fully diagnosed in this session. Flagged plainly in the final report instead of
scope-creeping into a fix with an incomplete understanding of why the existing number doesn't
already hold.

**RESOLVED 2026-09-10 (same-day, a later session)** — see [[feature_caveat_prose_relocation]] for
the actual fix and why two more guesses (a bare 7ch→8ch bump, then a `ch`-probe that silently
measured the wrong font) both failed before a clone-the-real-`<th>`-and-measure approach got the
real number (11ch). The "auto-layout column-width algorithm already overriding the property"
observation above was correct as a symptom (`clientWidth` never matched the raw ch-to-px math
exactly, even after the real fix) but isn't the actual bug — the actual bug was simply that the
budget itself was too narrow once `text-transform: uppercase` + `letter-spacing` + this table's
`box-sizing: border-box` padding were all accounted for.

**Verification depth**: live Vite dev server (`npm run dev -- --port 5183`, avoids the e2e suite's
own 4173), driven with throwaway Playwright scripts (screenshots at 1920x1080, both viewport-only
and full-page, plus one Assumptions-collapsed shot and one details-expanded shot; `getAttribute`
confirmed the `title` tooltip text landed in the DOM; `textContent` confirmed the exact shortened
verdict sentence rendered) — deleted after use, confirmed via `git status` that none of the four
`_scratch_check*.mjs` files (nor the two mangled-path PNGs above) were left behind. `npm run
test:web` (188/188), `check-scenario-roundtrip` (113/113 across all 6 tabs, Species Report still 16
fields), `lint` (0 errors; the one pre-existing `SpeciesPicker.tsx` warning is untouched and not
mine), `check-docs-drift` (all 8 checks ok) all genuinely green. `typecheck`/production `build` are
CURRENTLY RED, but traced conclusively (via `git status` on `packages/engine/src` and
`packages/web/src`, not just assumed) to a live, in-flight, unrelated concurrent change —
`engine-developer` mid-porting a `showDetailedAssumptions` toggle (already shipped for Team Raid,
see [[feature_team_raid_detailed_assumptions_toggle]]) onto the Comparator via
`packages/engine/src/comparison.ts`/`scenario.ts` plus `ComparatorView.tsx`/`AssumptionPanel.tsx` —
exactly the two files this task's own brief named as off-limits/concurrently-edited. Confirmed
`SpeciesReportView.tsx` itself produces zero tsc errors of its own by reading the FULL (not
truncated) tsc output: exactly one error total, in `ComparatorView.tsx`, unrelated to anything this
task touched.
