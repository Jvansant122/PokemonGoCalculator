---
name: fact-no-post-charged-move-lockout
description: Whether a distinct post-charged-move-animation lockout/cooldown exists in Pokemon GO, separate from the move's stated duration
metadata:
  type: project
---

Researched 2026-09-05 at the user's request (framed as "the delay after using a charge move
before we can start using fast move or dodging again").

**Finding: no evidence of a distinct EXTRA lockout tacked on after a charged move's stated
duration.** Community consensus (GamePress Q&A "What exactly is cooldown for a charge move?",
paraphrased via search snippet — could not fetch gamepress.gg directly, DNS-blocked in this
environment) describes charged-move "cooldown"/"duration" as already covering the *complete*
window: cast + reaction/damage window + any recovery, ending exactly when the player regains
control. GamePress's own community cycle-DPS formula (`cycleTime = energyToFull/EPS + chargeMoveDuration`,
from "DPS over charge move cycle time" Q&A) treats the stated duration as the entire gap before
the next energy-generating fast move can start — no separate additive term. PvPoke's PvP mechanics
guide (via search snippet, pvpoke.com itself returned 403 to direct fetch) says throwing a charged
move "resets all Pokemon cooldowns/animations," i.e. control returns cleanly at duration's end, not
duration-plus-something.

**Tier: [community-consensus], not [confirmed].** Niantic has never published frame-level move
timing itself (their help-center page 403'd to direct fetch here, but from general knowledge it's
always been mechanic-level, not numeric). Every downstream number (pogoapi.net, PvPoke, GamePress,
Bulbapedia, PokeMiners) traces back to the same datamined GAME_MASTER `durationMs` field — so
"confirmed" isn't really available for any specific number here, only well-established community
reading of the datamine.

**pogoapi.net's `duration` field**: directly passes through GAME_MASTER's raw duration in ms
(verified in `data/raw/charged_moves.json`, e.g. Frenzy Plant, Blast Burn 3500, Hydro Cannon 2000,
Natures Madness 2000). Per the consensus above, this already represents the complete lockout
window — so this project's `ChargedMove.durationSeconds` (`packages/engine/src/types.ts`) is not
silently missing a hidden component, AS LONG AS the community consensus is right.

**One unresolved minor numeric conflict found and not chased further**: a secondary source
(Sportskeeda "Charged Move timing guide," reached only via WebSearch snippet/AI paraphrase, could
not get primary table text — the direct fetch 405'd) described a datamined table showing "Nature's
Madness: Duration 2.1s, Damage Start 1.4s, Damage End 2.0s" vs. pogoapi's own 2000ms (2.0s) exactly
for the same move. Flagged, not resolved — could be simple transcription rounding in the secondary
source, or could indicate the datamine format sportskeeda used separates "total duration" from
"damage end" as genuinely different numbers (which would itself just mean damage lands before
duration ends, not that there's a POST-duration lockout — consistent with the existing
`vulnerableWindowSeconds` field already in this project's data model, not a new gap).

**Practical engine impact if the consensus above is correct**: none — `simulate.ts` already lets
the attacker act (fast move, dodge, re-fire charged) the instant `attacker.chargedMove.durationSeconds`
elapses, which matches "duration = complete window." If the user's suspicion turns out correct on
future research (a real extra fixed lockout exists beyond stated duration), the engine currently
OVERESTIMATES attacker fast-move volume and charged-move cadence, which overestimates both DPS and
teammateDps-derived survivability — compounding rather than one-off.

**Research process note**: gamepress.gg (all subdomains) is DNS-unreachable via WebFetch in this
environment; pvpoke.com and Niantic's own helpshift page both 403 direct fetch. Content from these
had to be gathered via WebSearch snippets (already-summarized, not primary text) — lower confidence
than a direct fetch would give. If this question is revisited, try an alternate access route
(cache, different search phrasing) before concluding a number is unverifiable.
