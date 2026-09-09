---
name: fact-damage-window-post2024-semantics-resolved
description: Resolves the open question left by fact_damage_window_fields_and_2024_decoupling.md — a direct re-fetch of the same Sept 2024 Pokémon GO Hub article shows its "damage window" sentence explicitly covers DAMAGE timing, not just energy, correcting the earlier "genuinely unclear" hedge
metadata:
  type: project
---

Researched 2026-09-09, round 3 overnight dodging/damage-window pass (answers Q1). Builds directly
on [[fact_damage_window_fields_and_2024_decoupling]] — do not read that note as still fully
current on this one specific point; this note supersedes its "damage application status is less
clear" conclusion.

## Headline: the same single Sept 2024 sentence covers damage AND energy — a re-fetch surfaced the
## leading clause the earlier pass's quote had cut off

Direct re-fetch of `pokemongohub.net`'s "Niantic quietly updates Raid Move durations, massively
shaking up Raid Battles" (2024-09-01/06, the article behind the whole "0.5 second cycle" finding
chain) on 2026-09-09, with a prompt specifically asking for every sentence mentioning damage
timing verbatim, returns this **full** sentence:

> "Damage is dealt at regular 0.5 second intervals, moves generate and consume full energy as soon
> as they are activated, rather than observing the 'damage window start' and 'damage window end'
> timers."

The earlier research pass's own quote of this article ("moves generate and consume full energy as
soon as they are activated, rather than observing the 'damage window start' and 'damage window
end' timers") **omitted the leading clause** ("Damage is dealt at regular 0.5 second intervals").
With the leading clause included, this is one sentence making **two** claims, not one: damage
timing changed to the 0.5s-cycle model, AND energy timing changed to instant-on-cast — both
explicitly contrasted against the old damageWindowStart/End "timers," which the sentence says are
no longer "observed." This directly answers the open half of Q1 that the earlier note flagged as
unresolved: **damage application is not gated by the per-move damageWindowStartMs/EndMs fields in
raids/gyms, post-Sept-2024** — same as energy, not a separate, still-window-gated mechanic.

Tier: `[community-consensus]`, one article, directly fetched and verbatim-quoted this pass (not a
WebSearch synthesis). Same citation-convergence caveat as the rest of this event's sourcing
applies — this Pokémon GO Hub piece is the ultimate source the Sportskeeda/Dexerto/Massively
Overpowered chain all trace back to, so this is still "one report," not independently
corroborated by a second outlet. No newer (2025/2026) article found revisiting or reversing this
— a fresh search this pass came up empty on that specific question, consistent with the existing
`fact_boss_energy_multiplier_still_unsourced_2026.md` negative finding that nothing has re-tuned
the Sept 2024 settlement since.

## Reconciling this against the Dec 2024 dodge-window article's continued use of "damage window"

[[fact_dodge_dec2024_window_fix]] already records a **later**, Dec 2024 Pokémon GO Hub article
that still names "damage window" as a live concept ("any time between the text notification...
and the actual damage window occurring"). This is a genuine terminology tension across two
articles from the same outlet, three months apart, and I did not find a source that explicitly
reconciles it. **My reading (labelled as my own synthesis, not a citation):** "damage window" in
the Dec 2024 piece most plausibly survives as informal player-facing shorthand for "the moment
damage actually lands during the animation" — which still exists as *some* specific moment in
time even under the new 0.5s-cycle model — rather than a claim that the literal
damageWindowStartMs/EndMs GAME_MASTER values are still the governing mechanism. The Sept 2024
article's wording ("rather than observing... timers") is the more technically precise of the two
and should be weighted higher on this specific point. Flag this as resolved-with-a-caveat, not
airtight — a genuine ambiguity remains about the exact within-move moment damage lands under the
new model (start of the rounded 0.5s duration? end? some other rounding rule?); no source
quantifies that.

## Correction to the earlier note's data-layer recommendation — this is the actionable part

[[fact_damage_window_fields_and_2024_decoupling]] closed by flagging damageWindowStartMs/EndMs as
"one sync-data change away from being real, sourced data" for `packages/engine`'s
`ChargedMove.vulnerableWindowSeconds`, i.e. treating it as a plausible improvement worth
routing to `data-sync`/`engine-developer`. **This pass's finding reverses the actionability of
that framing, not the field's existence:** if damage no longer observes these timers in raids/gyms
at all (per the fuller quote above), then wiring damageWindowStartMs/EndMs into
`vulnerableWindowSeconds` would be modelling a **mechanic the source itself says is no longer
observed** for the exact format this engine simulates (raids) — actively less correct, not more,
despite the field being real, current, and schema-confirmed. The engine's current choice
(`vulnerableWindowSeconds: durationSeconds`, i.e. treating the whole move duration as the
vulnerable window) is the better-supported default under this reading, not a placeholder waiting
to be replaced by richer per-move data. Do not route "sync damageWindowStartMs/EndMs into the
engine" as a finding going forward without flagging this correction alongside it.

## Engine status (updated)

No change recommended to `packages/engine/src/types.ts`'s
`vulnerableWindowSeconds: durationSeconds` — this pass's finding argues *for* keeping it as-is,
not against it. `DODGE_WINDOW_SECONDS` (flat 0.7s, prose-only) remains unaffected by this finding
either way — it's about dodge-flash telegraph timing, a separate question this note doesn't
touch.
