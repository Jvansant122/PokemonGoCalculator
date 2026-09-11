---
name: reaction-full-audit-2026-09-11
description: Full 7-tab live audit (2026-09-11), first pass since the Roster tab + Lineup Builder shipped (2026-09-10/11). Top finding is a NEW one — the Roster tab's "Can Mega/Primal Evolve" checkbox defaults OFF even when the selected species IS a mega form, silently stripping the mega boost everywhere the roster feeds (Lineup Builder, Power-Up Optimizer multi-raid) with no on-screen warning. Also: a contradictory Fixed-budget-plan stop-reason message, a select-all-on-focus regression on the Roster tab's own species box, and a suspicious flat dodge-sensitivity table (flagged for skeptic, not confirmed).
metadata:
  type: project
---

Triggered by: full end-to-end 7-tab audit, driven live (Comparator, Team Raid Simulator + Lineup
Builder, Species Report, IV Breakpoints, Attack/Defense Breakpoints, Power-Up Optimizer both
modes, Roster). Built a real 4-entry roster by hand (Mega Mewtwo X, Rayquaza, Terrakion, Lucario)
to exercise the Lineup Builder and multi-raid sweep, which no prior audit round had live data for.
Full findings/report written to the scratchpad this session (not persisted — see PARENT SESSION
report for full text); this memory file is the durable summary.

## Top finding, NOT previously known

**Roster tab: selecting a "Mega X" species from the search box does not set it up to mega
evolve.** The species picker offers "Mega Mewtwo X" as its own directly-selectable entry
(distinct from "Mewtwo"). Adding it leaves the roster summary's "Mega/Primal-capable" count at 0
and the row's Flags column at "—" until a SEPARATE "Can Mega/Primal Evolve" checkbox (unchecked
by default, same form) is manually ticked. Nothing on screen warns that this is needed. Verified
this changes real output: the Lineup Builder only used "Mega Mewtwo X (mega)" — with the boost —
after I noticed and fixed the flag.

**Inconsistent with the rest of the app**: Power-Up Optimizer's own single-raid slot picker
auto-selects the "Mega/Primal for this raid" radio when you pick a mega-named species. The Roster
tab is the one place this defaults OFF. Since the Roster tab is the shared input for BOTH the
Lineup Builder and Power-Up Optimizer's multi-raid mode, this is high-blast-radius: a roster built
by picking mega forms by name (the natural, offered-by-the-picker way) silently loses its mega
boost everywhere downstream, with a roster table that looks complete. This is my single top ask
this session — same failure shape as the recurring "field exists but isn't wired" pattern
HANDOFF.md already names (Eternatus cost override read by nothing, etc.), just in the UI layer
instead of the sync layer.

## Other findings this round

- **Power-Up Optimizer multi-raid, Fixed-budget plan: contradictory stop-reason message.** With a
  4-entry, all-level-20 roster and blank candy fields, the plan's headlined stop-reason read
  "Stopped because every fielded slot has already reached level 50" — false on its face — while a
  section further down the SAME page gave the real reason ("Excluded from this plan — 4 entries",
  because candy-on-hand was unknown for every family). Flagged as worth a `skeptic` pass (didn't
  check source) but functionally misleading regardless of root cause: a player reading only the
  prominent stop-reason box would wrongly conclude their roster is maxed out.
- **Roster tab's own "Add a Pokémon" species search box doesn't select-all on refocus** — the same
  append-bug class round-2 (2026-09-10) fixed on the Comparator/Team Raid boss pickers
  (`reaction_full_audit_round2_2026-09-10.md`), NOT propagated to this newer (7th) tab's identical
  control. Reproduced: typing "Rayquaza" into an already-filled box produced
  "RayquazaRayquaza" / "No matches". Triple-click works around it.
- **Comparator dodge-execution-error sensitivity table returned byte-identical numbers across all
  6 accuracy points (50-100%) for both candidates** — suspicious enough (identical to the exact
  decimal at every row) to flag for `skeptic`, not confirmed as wrong. Scenario: Kartana vs
  Rayquaza vs Mega Latios, both candidates die before any dodge would matter, which COULD
  legitimately explain flat results — didn't investigate further, this is `skeptic`'s call.
- **Comparator headline sentence reads as a 3-way candidate fight.** "Kartana vs Rayquaza vs Mega
  Latios" — no visual/textual distinction between the two candidates and the boss they're both
  fighting, directly under a tab labeled "Two-Candidate Comparator." Cheap wording fix.
- **Multi-raid candy fields**: good "CANDY UNVERIFIED" badge pattern once you run the sweep, but
  nothing explains beforehand that a blank candy field means "compute anyway, flag it" rather than
  "treat as zero" — a first-time user would likely assume the latter. Cheap wording fix.

## Confirmed still working (re-verified, not new)

Team Raid default roster still wins (280.4s clear); Power-Up single-raid clear-rate-before/after
present; Species Report now links to Team Raid Simulator per-row (closes a gap flagged in
`reaction_forward_looking_2026-09-10.md` finding #4 — CONSIDER THAT FINDING CLOSED); Lineup
Builder's empty-roster state is a clear, actionable message pointing at the Roster tab; Lineup
Builder correctly reports a within-noise tie between its top-2 candidates rather than overclaiming
a winner.

## STRUCTURAL, no new ground

`casual-optimizer` rejects Roster tab, Power-Up Optimizer multi-raid, IV Breakpoints, and
Attack/Defense Breakpoints on premise — all previously recorded, unchanged, one line each in the
full report.

## Not investigated this round

Didn't re-drive Attack/Defense Breakpoints or IV Breakpoints beyond a spot-check — no material
change since round 1/2 per HANDOFF.md, and casual-optimizer's STRUCTURAL rejection there is
already settled. Didn't stress-test the Power-Up Optimizer's move-change sweep or Best Buddy
single-raid list this round (spot-checked only, matched what HANDOFF.md already describes as
shipped 2026-09-11).
