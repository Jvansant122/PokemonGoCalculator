---
name: reaction-lockout-friendship-design-2026-09-12
description: 2026-09-12 targeted pass (companion to a pogo-researcher pass) — reproduces the dodgeFastAttacksLockout 0-damage case live (Mega Tyranitar + Bite), confirms friendship control absence on 4 tabs, and a broader design/readability/usability pass incl. two mobile-preset checks. Priority call given: lockout warning >> friendship wiring.
metadata:
  type: project
---

Triggered by: overseer request, explicit companion to a pogo-researcher pass. Scope expanded
mid-session by the user to also cover UI design/readability/usability (not just desirability),
folded into the same ranked list rather than a separate pass.

## Reproduced live: the dodge-fast-attacks lockout (Comparator tab)

Set Raid target = Mega Tyranitar (boss fast move defaults to Bite, 500ms), "Also dodge boss's
fast attacks?" = Yes. Result: both candidates show `0.0 OWN DPS`, `Mean charged damage 0`,
`Mean fast-move damage 0`, `Mean own total... 0`, `Own DPS ratio: not comparable (one side is
zero)`. Confirmed no on-screen explanation anywhere, including the deep "Known caveats" ->
"Simulation, damage tracking & mega/primal mechanics" panel (expanded and read in full — it
documents dodge cost, mid-animation guaranteed damage, mega-boost scope, "approximate"/
"hypothetical" species — but never the ≤0.5s fast-move cadence case). This confirms
`pogo-researcher`'s `finding_dodge_fast_attacks_lockout_never_surfaced.md` as a live, reproducible
defect, not a theoretical one.

**Worse than silence, found live**: the chart caption reads *"No crossing in this window under
these assumptions — Kartana leads throughout"* when both candidates are at literal 0 total damage
— "leads" implies a real margin that doesn't exist. The moveset-roll sweep table is more honest by
accident: Bite-fast-move rows read `tied` (0 vs 0) rather than naming a winner, but nothing tells
the reader `tied` here means "both permanently locked at zero," as opposed to a normal close
finish.

## Confirmed absent: Friendship control/caveat on 4 tabs

Live-checked via `find "Friendship"` on Species Report, IV Breakpoints, Attack/Defense
Breakpoints, Power-Up Optimizer — zero matches on all four (IV Breakpoints and Attack/Defense
Breakpoints don't even have a "More detailed assumptions" toggle to hide it behind). Comparator's
own caveat text (expanded and quoted in full) is a good model if this ever gets a caveat instead
of a control: cites GAME_MASTER `FRIENDSHIP_LEVEL_0..5` directly, gives all 5 multipliers, and is
explicit that Best Buddy is a "COMPLETELY SEPARATE mechanic despite the name overlap."

## PRIORITY CALL: (1) lockout warning >> (2) friendship wiring

(1) is cheap (data already computed, per `pogo-researcher`'s finding: `dodgeFastAttacksLockout` /
`fastMoveCadenceTooFastToDodge` already exist and reach all 3 simulating tabs) and is actively
misleading, not just missing — see the "leads throughout" wording above. (2) is a real gap but
costs much more and its actual damage depends on which tab: Species Report (a ranking over ~600
bosses) and Power-Up Optimizer (a stardust-efficiency ranking) are unlikely to flip from a
3-12% flat multiplier, so a **static text caveat** (matching Comparator's existing model) is
probably enough there. IV Breakpoints and Attack/Defense Breakpoints are different in kind — their
entire product claim is an EXACT floored-damage crossing point, and a flat multiplier applied
before flooring can and will move a breakpoint. A caveat there tells a Best-Friend-tier player
their tool's headline number is not their real breakpoint, not just "approximately right." If (2)
is ever scheduled, I would NOT wire all four identically — text-only for Species
Report/Power-Up Optimizer, a real control for the two breakpoint tabs — but that's a bigger,
split job, and (1) should ship first regardless.

## Design/readability findings (new this session)

Ranked most to least impactful:

1. **Mobile tab strip does not track the active tab across a resize.** On `resize_window` to the
   mobile preset while already on a non-leading tab (Power-Up Optimizer), the tab strip renders
   scrolled to its start (`Comparator | Team Raid Simulator | Species Re...`) with NO tab visually
   marked active — the active "Power-Up Optimizer" pill is off-screen right with no chevron/arrow
   hinting more tabs exist. Clicking a tab DOES correctly auto-scroll it into view (verified:
   clicking "Power-Up Optimizer" from a fresh Comparator-tab mobile load scrolled the strip so it
   read `...e Breakpoints | Power-Up Optimizer [highlighted] | Roster`) — so this is specifically
   a resize/rotate-without-a-subsequent-click gap, not a universal mobile failure. Direct
   query-param deep-linking to a specific tab was not verified this session (tooling issue: the
   dev server's `?view=...` value wasn't confirmed — don't reuse "pu" as the value without
   checking `App.tsx`).
2. **Power-Up Optimizer's Single-raid/Multi-raid mode toggle overflows its own container on
   mobile**, independent of the page-level tab strip: at 375px width the two-button toggle shows
   "Single raid — 6-slot roster vs. one boss" [selected] and a cut-off "M..." for the other option,
   requiring a SECOND, separate horizontal scroll (inside the assumptions card, not the page) to
   reach it. A full-width stacked or evenly-split two-button toggle would remove this.
3. **Team Raid Simulator's result color coding fights itself.** A green "Cleared" headline is
   immediately followed by a RED-bordered callout box: *"Boss moveset risk: this roster **clears
   against 5 of 16** possible boss movesets... but **fails against the other 11**"* — the box is
   giving nuance on a genuine success, but red is the app's own "bad" color everywhere else
   (dodge-accuracy tables, type-effectiveness arrows), so the very first visual impression on
   scanning is "something failed" before the text is read. Content is good — it's exactly the
   ranking-flip-thesis honesty this tool exists for — the color choice undercuts it. An
   amber/neutral border would keep the warning without contradicting "Cleared."
4. **Roster tab's summary card is five single-fact stat blocks stacked at desktop width**
   ("Total entries / 4", "Unique species / 4", "Mega/Primal-capable / 1", "Shadow / 0",
   "Default/unknown moveset / 0" — each its own label-then-big-number block). On a wide screen
   this is a lot of vertical scroll for five small integers that would read fine as one line
   ("4 entries, 4 unique species, 1 mega-capable, 0 shadow, 0 default-moveset"). Not mobile-only —
   this is a desktop-width waste of the vertical space `real-users` explicitly cares about
   ("visual clutter is more of a human analysis thing tho... big monitor... might be more aids on
   1080p" — this cuts the other way, it's wasted space rather than clutter, but the same
   scan-efficiency concern applies).

## Confirmed fixed since the 2026-09-11 audit (don't re-flag)

- **Roster tab mega-checkbox default**: adding "Mega Mewtwo X" now shows `mega-capable` in the
  Flags column immediately, and "Mega/Primal-capable" in the roster summary reads 1 (was the TOP
  finding of `reaction_full_audit_2026-09-11.md`; verified live this session on the same kind of
  roster row, not re-tested exhaustively).
- **Power-Up Optimizer -> Team Raid Simulator reverse export shipped**: `find` surfaced a "Send
  post-plan roster to Team Raid Simulator ->" button — this is the #1 finding from
  `reaction_forward_looking_2026-09-10.md` ("no reverse export"). Not clicked through to verify
  the resulting Team Raid state this session — spot-check only.
- Attack/Defense Breakpoints' first (IV) column stays visually anchored under horizontal scroll on
  mobile (375px) — checked directly, confirmed the row IV values stay on screen while level-column
  headers scroll away. Good behavior for a deliberately dense, 51-column tab; no fix needed here.

## Not investigated this round

Didn't stress the CSV import flow, the save-code round-trip, or the Species Report debounced
loading state. Didn't re-verify the flat dodge-sensitivity table (still reproduced again this
session on a DIFFERENT scenario — Mega Tyranitar this time, not just the Mega Latios one from
2026-09-11 — still flagged for `skeptic`, not confirmed wrong).
