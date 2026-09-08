---
name: bugfix-multiflip-crossing-marker
description: DamageOverTimeChart marked the FIRST lead-flip while finalLeader was computed independently from final totals — disagreed whenever the lead flipped twice; fixed to derive finalLeader from the LAST flip
metadata:
  type: project
---

`DamageOverTimeChart.tsx`'s crossing-detection loop used to `break` on the first sign flip of
`(x - y)`, while `finalLeader` was computed completely separately from the final sample's totals.
Whenever the lead flips more than once (real, confirmed case: default Comparator load, Kartana vs
Rayquaza vs Latios-mega — own-damage deltas go −3 → +39 → −81, i.e. two flips), the marker sat at
the first, non-decisive flip while the caveat sentence named the winner of the second, decisive
one. Visually the dot ends up sitting where the *losing* line is about to rise — exactly backwards
for a chart whose entire point (per CLAUDE.md's standing thesis) is marking *where the ranking
flips for good*.

**Fix**: don't `break` on the first flip — keep scanning and overwrite `crossing` on every valid
flip found, so it ends up holding the *last* one. Derive `finalLeader` from that same last flip's
post-flip sign (`crossingLeader`), falling back to the independent final-totals computation only
when there was no crossing at all. This makes the marker and the leader sentence structurally the
same fact instead of two independently-computed values that can drift apart — per the task's own
instruction, "make it impossible for them to disagree rather than just changing which one you
pick." Don't reintroduce `break`-on-first; a single-flip case is unaffected by this change (the
last flip *is* the first flip when there's only one), so there's no reason to special-case it back.

**Verification technique reused from [[verification-without-browser-tool]]**: no browser tool
available, so proved this numerically with a throwaway `packages/web/src/_scratch_crossing_check.ts`
(deleted after, confirmed via `git status --porcelain`) that called the real
`runSustainedComparison` with the exact default-Comparator inputs (Kartana/Rayquaza/Latios-mega,
level 35, 15/15/15 IVs, party 4 @ 26.5 DPS) and ran both the old and new loop logic side-by-side
against the same `totals` array. Confirmed old crossing ~5.44s (matches the bug report) vs new
~6.99s, both agreeing `finalLeader = Rayquaza`. Also swept several other species pairs to find a
genuine single-flip case (`metagross-mega` vs `salamence-mega` @ several bosses — flips=1, old and
new times identical) and a genuine no-crossing case (`mewtwo-mega-x` vs `mewtwo-mega-y`,
`kartana` vs `kartana`) to confirm both edge branches are unchanged. Note:
`runSustainedComparison`'s representative-run RNG state is NOT independently reseeded per call in
a scratch script that calls it multiple times in sequence — exact crossing times shifted slightly
(5.44s vs 5.51s) between two separate scratch-script runs of the identical Kartana/Rayquaza
matchup depending on how many earlier calls preceded it in the same script. Harmless for this kind
of qualitative check (old-vs-new comparison within the *same* script run, same call, is still
apples-to-apples) but don't treat an isolated scratch-script's exact decimal as a pinned value —
rerun in isolation if you need a reproducible number.
