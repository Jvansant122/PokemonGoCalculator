---
name: feature-known-caveats-subdisclosures
description: Sub-collapsed each "Known caveats" section's h3 topics into their own <details className="prose-details"> (Comparator/Team Raid/Species Report/Power-Up Optimizer x2) so opening the section shows a short topic list, not a wall — the word-count+topic-count method used to decide which 2 of 7 sections to leave alone, a real above/below wording slip caught by diff review, and a genuine Windows spawn+shell:true+kill() orphaned-process gotcha
metadata:
  type: feedback
---

Done 2026-09-10 (same day as, and downstream of, [[feature_caveat_prose_relocation]] — that task moved sourcing
prose OUT of the Assumptions panels into each tab's "Known caveats" `CollapsibleSection`, adding `<h3>` topic
headings; this task's finding was that headings alone weren't enough, since opening "Known caveats" still dumped
every paragraph at once). Converted each `<h3>Topic</h3><p className="caveats">...</p>` pair to
`<details className="prose-details"><summary>Topic</summary><p>...</p></details>` (dropping the now-redundant
`className="caveats"` on the inner `<p>` — `.prose-details > p` already sets the same color/size/line-height/max-width;
confirmed this by grepping the TWO pre-existing uses of this exact pattern, `IvSweepReport.tsx` and one panel in
`SpeciesReportView.tsx`, both of which already use a bare `<p>` inside `<details className="prose-details">`, and
both of which already establish PLAIN-TEXT summaries — not a nested heading — for this specific disclosure size,
unlike `CollapsibleSection`'s own top-level convention of nesting a real `<h2>`/`<h3>` inside `<summary>`. Followed
the smaller pattern, not the top-level one — these sub-disclosures aren't e2e landmarks the way top-level sections
are, and no test targets them by role).

**Decision method for "which sections are a real wall": word count via a throwaway extraction script, not eyeballing.**
Wrote a scratch `.mjs` that regex-extracts each `Known caveats` `CollapsibleSection`'s JSX (matching
`<CollapsibleSection`/`</CollapsibleSection>` depth, not just a naive substring search — there's exactly one
instance per file except `PowerUpOptimizerView.tsx`, which has two: `pu-known-caveats-single`/`-multi`), evaluates
the two shared hint constants (`MEGA_LEVEL_HINT`/`BOSS_CADENCE_HINT`) as real JS via `new Function(...)` so their
word counts are exact rather than estimated from their own doc-comment claims (which were stale: doc comments said
255/384 words, actual eval'd length was 228/343 — recompute, don't trust a comment's own claimed count), then strips
JSX tags/`{expr}` interpolations and counts words per `<h3>` topic. Results: Comparator 1194w/4 topics, Team Raid
1080w/7, Species Report 1111w/7, Power-Up Optimizer single-raid 1180w/6, Power-Up Optimizer multi-raid 793w/5 — all
converted. IV Breakpoints 628w/3 and Attack/Defense Breakpoints 568w/4 — both left alone. There's a clean, principled
(not arbitrary) gap between 628 and 793: the 5 converted sections all carry the full 343-word `BOSS_CADENCE_HINT`
block, and the 2 left-alone tabs structurally never do — `bossCadence.tsx`'s own doc comment says why ("IV
Breakpoints and Attack/Defense Breakpoints don't get this at all, deliberately: neither calls a simulator"). Verified
this wasn't just a word-count coincidence by checking per-topic breakdown too: every left-alone topic besides the
shared Mega Level hint stays under ~130 words, while every converted tab has at least one single topic over 340
words (Comparator's lead paragraph alone is 568w). Reported both "leave alone" tabs' actual numbers plainly in the
final report rather than just asserting the call — this is a judgment call, not a mechanical threshold, and should
be checked by a human, not taken on faith.

**A real content-accuracy bug caught only by re-reading my own diff, not by any test:** while restructuring
Comparator's lead paragraph, one of two "Boss charged-move cadence model" cross-references inside it got flipped
from "above" to "below" while retyping the block — wrong, because that specific instance refers to the actual
`<select>` control (which lives in the Assumptions panel, physically ABOVE "Known caveats" on the page, unchanged by
this task), whereas the other two instances in the same paragraph correctly say "below" because THEY refer to the
sub-heading now sitting a few lines further down in the same collapsed section. Caught by running `git diff` and
reading every changed line against the original text after the edit, not by any automated check — `textLenMatchesExactly`
word/length comparisons wouldn't have caught a same-length word swap, and no test asserts on this prose's content.
**Lesson: after any "pure restructuring, preserve content exactly" edit, diff-review the full text against source
line by line — don't trust that Edit-tool exact-string matching alone guarantees the OUTPUT is unchanged, since nothing
stops you from also editing a word while constructing the replacement block.**

**A verification-technique pitfall: `element.textContent` does NOT respect `display:none`/a closed `<details>`'s
collapsed state — unlike `.innerText()`, which does (see [[feature_collapsible_sections]]).** A before/after
`textContent.length` comparison across "all sub-disclosures collapsed" vs "all sub-disclosures force-opened via
`.evaluate()`" is therefore trivially always equal (both read the same full DOM regardless of `open`), NOT a
meaningful fidelity check — realized this only after the numbers came back suspiciously exactly equal every time.
Replaced with a real check: extracted the two shared hint constants as actual JS values (same `new Function`
technique as the word-count script) and compared them, whitespace-normalized, against the LIVE PAGE's rendered
`textContent` for those specific paragraphs — this actually validates the `{MEGA_LEVEL_HINT}`/`{BOSS_CADENCE_HINT}`
JSX interpolations rendered with no stray/missing whitespace inside their new wrapper, and specifically confirmed the
"+"-move community-estimate disclaimer (flagged by this task as required to stay labelled) is present verbatim.

**A genuine Windows-specific gotcha, cost real cleanup time: `child_process.spawn(cmd, args, { shell: true })`
followed by `.kill()` in a `finally` block does NOT terminate the actual server process on Windows.** Used this
pattern four times (once per throwaway `vite preview` port: 4196-4199) to drive live-DOM measurement/screenshot
scripts. Every one of the four spawned an extra shell wrapper PID that `.kill()` only killed the WRAPPER of — the
real `node`/`esbuild` preview server underneath kept running and kept the port bound, confirmed via
`netstat -ano | grep LISTENING` finding all four ports still live well after each script's `main()` had returned and
logged success. **Fix: `taskkill //PID <pid> //T //F` (the `/T` flag is what actually kills the child tree, `/F`
forces it) — plain `.kill()` alone is not sufficient for a `shell:true` spawn on this platform.** Re-verified via
`netstat` after the taskkill calls that all four ports were genuinely free before finishing. Any future scratch
script on this Windows box that spawns a background dev/preview server should either avoid `shell: true`, or budget
an explicit `taskkill /T /F` cleanup step rather than trusting `.kill()` — this generalizes past just this task.

**Verification depth:** `npm run verify` (engine 418 / web 216 / scripts 213 tests, typecheck clean x3, lint 0
errors — 1 pre-existing unrelated warning in `SpeciesPicker.tsx`, all 4 checkers including
`check-scenario-roundtrip` unchanged at 114 fields across all 6 tabs, confirming this was a genuinely display-only
change) and `npm run test:e2e` (14/14) both green. Real browser verification via four throwaway Playwright scripts
against an isolated `vite preview` build (ports 4196-4199, never the shared e2e port 4173) at 1920x1080: measured
live DOM heights of the SAME "Known caveats" `<details>` in two states — "topics collapsed" (the new default once
opened) vs. every nested `prose-details` force-`open`ed via `.evaluate()` (reproduces the OLD always-expanded wall
exactly, since zero wording changed) — Comparator 222px -> 2286px (90.3% cut), Team Raid 338px -> 2144px (84.2%),
Species Report 338px -> 2152px (84.3%), Power-Up Optimizer single-raid 299px -> 2206px (86.4%), multi-raid
260px -> 1567px (83.4%). Also screenshotted both states for Comparator and Power-Up Optimizer per the task's own
ask, and confirmed via screenshot that the two left-alone tabs (IV Breakpoints 1230px, Attack/Defense Breakpoints
1195px opened, both still one wall) are genuinely still readable at a glance relative to the five that got the
treatment, not just asymptotically shorter. All four scratch `.mjs` files deleted from `packages/web/` before
finishing (confirmed absent via `git status`), nothing staged.
