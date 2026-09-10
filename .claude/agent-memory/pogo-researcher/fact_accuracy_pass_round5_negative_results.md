---
name: fact-accuracy-pass-round5-negative-results
description: Round-5 accuracy pass (2026-09-10) re-chased 5 open MECHANICS.md questions; most remain genuinely unsourceable. Read before re-attempting any of these to avoid repeating the same searches.
metadata:
  type: project
---

Requested by the user as a dedicated "close as many open questions as you honestly can" pass.
Full source list already tried is in [[reference-source-catalog]] — don't re-attempt those without
a new angle. This entry records what round 5 specifically tried and confirmed still closed.

**Boss charged-move decision denominator (MECHANICS.md's highest-value open question)**: tried
fresh WebSearch angles (GoBattleSim-Python freshness, direct "50% denominator" queries). No new
source. **Caught a WebSearch fabrication**: a search summary claimed the 50% roll is gated on "the
boss having used a fast attack" — direct-fetched the actual cited pokemongohub.net article
(`washed-out-to-sea-new-pve-mechanics-brings-a-wave-of-issues`) and that claim is **not in the
source text at all**. Do not reuse it. Confirms the reference catalog's standing warning about
WebSearch's AI-summary layer inventing citation-sounding claims. Status: unchanged, still
`[speculative — reasoned inference]` per-move-boundary trigger, still the best available model.

**`holdChargedMoveUntilSafe` own-dodge-time-cost**: tried searching for player strategy guides on
timing dodges around a held charged-move throw. Found only generic PvP charge-timing content
(irrelevant, that's a different minigame) and generic gym/raid dodge-timing guides that don't
address the specific "dodge before AND after my own held cast" sequencing. Genuinely no source
exists for this — it's a niche tactical detail nobody has quantified in writing. Status: unchanged,
stays the engine's own placeholder assumption (2x `DODGE_COST_SECONDS`).

**Dodge damage scaling with remaining HP (the Payback anomaly)**: searched directly for
corroboration or a follow-up Silph Road result. Nothing found beyond the original single Silph Road
observation already recorded. Status: unchanged, stays NOT MODELLED.

**Damage formula may be incomplete (Silph Road CPM non-overlap finding)**: tried searching for the
original post via alternate phrasing since reddit.com/thesilphroad.com are both blocked to this
tooling. No mirror, quote-site, or secondary citation found anywhere. This remains genuinely
unreachable, not merely unattempted — reddit and thesilphroad.com being blocked is a hard tooling
limit, not a search-effort gap. Status: unchanged, this is an honest ceiling on the whole project's
accuracy, not a fixable gap.

**"+10% per Mega Level tier" magnitude**: found `doctorpokegogo.com/en/moves/volt-tackle-plus/`
gives an exact per-tier table (170/187/204/221 = exactly 1.0/1.1/1.2/1.3×) — **but the same page's
own disclaimer confirms this is computed FROM the site's disclaimed formula** ("This formula is our
own estimate based on in-game measurement... (Mega Level - 1) × 10%"), not an independently observed
number. This is the same shared-disclaimer estimate already on record
(`fact_super_max_plus_move_mechanics_detail.md`), restated as a table — **not new evidence**, and
does not satisfy the user's proposed "one clean (move, tier, displayed damage) reading" test. Nobody
has supplied that reading yet. Status: unchanged, stays `[unverified]`.

**Nothing new since 2026-09-09 that breaks engine math.** Checked for a September 2026 balance
patch: found only content-rotation news (Mega Finale event Sept 5-14, Mega Squads event Sept 8-14,
GO Battle League Season 28 "Twilight Trails" starting Sept 8 — GBL/PvP, out of this project's
scope entirely). No raid-mechanic, damage-formula, or mega-boost change found. The already-recorded
1.3 mega/primal boost and BATTLE_SETTINGS constants remain current as of this check.

**One item resolved this round, filed separately**: [[fact-dodge-window-500-vs-700ms-reconciled]]
(500ms invulnerability vs 700ms reaction-window are different quantities, no engine change) and
[[fact-super-max-eligibility-upgraded-round5]] (confidence upgrade only, no engine change).
