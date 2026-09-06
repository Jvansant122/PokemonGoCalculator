---
name: finding-mega-boost-scope-mislabeling-in-shipped-tool
description: The shipped two-candidate comparator's team-damage UI copy and doc comments describe "teammates"/"your party" — reads as the mega-bringer's own bench, not "other trainers in the raid lobby" per the real mechanic
metadata:
  type: project
---

**Resolved 2026-09-05**, requested by the overseer as a direct follow-up to
[[proposal-sequential-team-raid-tab]]'s flagged concern. Read the actual shipped code/copy (not
guessed): `packages/engine/src/uptime.ts` (`convertUptimeToTeamDamage`),
`packages/engine/src/comparison.ts`, `packages/web/src/AssumptionPanel.tsx`,
`packages/web/src/App.tsx`.

**Verdict: yes, a real mislabeling exists.** Every occurrence of this feature's copy/doc-comments
uses "party"/"teammates" language with zero mention of "other trainers," "raid lobby," or
"simultaneously active Pokémon" anywhere — e.g.:
- `AssumptionPanel.tsx` label: `"Teammates (not counting this candidate)"` (partySize field)
- `AssumptionPanel.tsx` tooltip: `"How many of your party's highest-DPS teammates share the lead
  candidate's boosted type..."` — "your party's teammates" is unambiguous own-bench language.
- `App.tsx` result-card label: `"Team damage from this candidate's boost"`, comment: `"Team damage
  attributable to this candidate's mega/primal boost over its own mean survival... per the
  assumptions panel's party size / matching-teammate-count / teammate DPS."`
- `uptime.ts` doc comment: `"Real teams are rarely all-or-nothing on type"` (re: matchingTeammateCount).

**Why this can't be rescued by a charitable "teammates = other simultaneously-active trainers"
reading**: technically true that only one Pokémon per trainer can be active at once, so any other
simultaneously-fighting Pokémon in a raid necessarily belongs to another trainer — but nothing in
the UI signals that reading, and the UI actively invites the opposite one. The panel presents
`partySize`/`matchingTeammateCount`/`teammateDps` as assumptions the user dials in about **their
own** roster composition (matching the rest of the panel, which is otherwise entirely about the
user's own candidate species/moves/IVs). A real player cannot know or control another random
trainer's box in a public lobby the way this panel implies they can plan around "how many of my
party match this type" — that phrasing only makes sense read as "my own box."

**Consequence, stated plainly**: for a **solo trainer** (the tool's default framing — comparing
two of *your own* candidate species), the real-game value of "team damage from this candidate's
boost" should be **zero**, always — your own mega/primal never boosts your own bench. The
currently-computed nonzero number represents a real, coherent quantity (marginal damage some
group of Pokémon would gain from a boost), but the UI's framing implies it's crediting the
player's own box, when mechanically it can only ever be true for *other trainers present in the
same raid* — an input a solo player fundamentally cannot dial in as a personal "assumption" the
way IVs or dodge skill can be.

**Not a math bug** — `convertUptimeToTeamDamage`'s arithmetic is agnostic to whose Pokémon the
`teammateCount` represents; the function correctly computes "N Pokémon getting marginal boost X
for T seconds." The problem is entirely in the copy/documentation framing implying "own party,"
not in the computation itself.

**Scope-creep caution, flagged explicitly per the task's ask**: the honest fix ("this represents
*other trainers* in the raid lobby, not your own bench") pulls the feature's real meaning close to
the ruled-out **Teambuilding Analyzer** (multi-trainer mega staggering) territory — if the fix
UI/copy starts implying "let's model which other trainers bring megas and when," that's the
ruled-out feature creeping back in through relabeling rather than new-building. A safe fix likely
just needs new copy ("assume N other trainers are also in this raid, with M of their attacks
sharing your mega's type") rather than any new modeling — but that's a product/wording call for
the overseer, not decided here.

**Not proposing the fix myself** (out of role) — reporting the verdict only, for the overseer to
route to `web-developer` (copy/labels) and/or `engine-developer` (doc comments in `uptime.ts`) if
they choose to act on it.
