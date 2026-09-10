# `real-users` — growth file

Additions to the archetype in `.claude/agents/pogo-player.md`. **This file is read at run time**,
so it takes effect immediately; the agent body only reloads on a session restart. Same rules as
the body: every bullet tagged, quotes verbatim, `[inference]` marked separately, nothing unsourced.

Added 2026-09-10 from two earlier logs — `the first message log` (2026-09-04) and
`the second message log` (2026-09-04 evening). These predate the tool: they are this player doing
the analysis **by hand, in spreadsheets**, which is why they say more about how they think than
the later log does.

---

## How they actually reason

- **They build adversarial pairs on purpose. They are not looking for a winner — they are looking
  for the flip.** *"first scenario was a proof for Mega Y dps advantage second scenario will be
  favoured towards Mega X tank advantage"*, then *"This was the better case scenario for Y to be
  stronger now I have to go find where X is stronger -_-"*. An output that names a winner without
  naming the conditions under which it stops winning has answered the wrong question for this
  archetype. `[sourced: 2026-09-04 log]`

- **They track the direction of their own error bias, not just its size.** *"some assumptions are
  made by double calculating with the floor function but those calculations skewed in favour of
  Raichu Y"*; *"have to make an assumption on this next part since I'm technically using a FLOOR()
  function on top of another source already using said function"*. A stated number is incomplete
  to them unless they can tell which way its assumptions lean. `[sourced: 2026-09-04 log]`

- **Breakpoints are the first thing they reach for.** *"Setting aside the Damage breakpoints that I
  normally gravitate toward first"*, and in the same breath the detail: *"Raichu Y's breakpoint of
  1 extra fast damage per 0.5s even with imperfect IVs for attack (13-15) putting it at 5 damage
  per fast attack over X's 4"*. `[sourced: 2026-09-04 log]`

- **Party size is a variable they vary, not a setting they leave alone.** *"for FOUR teammates
  specifically (possible group size of 5 total to handily beat raid)... This scenario would favour
  Mega X even more as the group size increases"*. `[sourced: 2026-09-04 log]`

- **They want the tool to be willing to say "don't bring this".** *"I can technically calculate
  dodges into the math but lord save me if you have to dodge every fast attack from kyogre just
  choose a different mega"*. A recommendation surface that only ever ranks, and never rejects,
  under-serves them. `[sourced: 2026-09-04 log]`

- **Type-chart pragmatism over theory.** *"Electric doesnt actually resist water so for a glass
  cannon with a 3.5 second charge move both forms get popped"*; *"So many flyers have dual typing
  making electric not even the best type against them"*. `[sourced: 2026-09-04 log]`

## Why two standing decisions exist — cite this when either is questioned

- **The mega/primal `1.3` is load-bearing because their own conclusion flipped on it.** *"at the
  very end of the final calculation I was still under the impression that mega boost only boosts
  teammates 10% and not 30% which wouldve bricked the whole tank advantage ngl"* / *"but it is
  indeed 30% and I thus I do not have to gouge my eyeballs out with a spoon"*. This is the actual
  incident behind CLAUDE.md's "a real conclusion in this project flips at 1.1."
  `[sourced: 2026-09-04 log]`

- **The product thesis is what they wanted from the start and could not do by hand.** *"that would
  be better done after merging DPS and survivability sheets into a simulated battle which I'm not
  doing rn altho I wanted to from the start. This was a more straightforward approach acknowledging
  one particular advantage of survivability for megas"*. Survivability-counted-as-team-DPS was not
  designed for them after the fact — it is the thing they were reaching for.
  `[sourced: 2026-09-04 log]`

## Playstyle detail

- **They dodge more than a model would assume.** *"I stim a lot and dodge before every charge
  attack if I'm really paranoid during boss fights and thats even when I'm not on glass cannon"*.
  Dodge assumptions that treat perfect dodging as exotic do not describe this player.
  `[sourced: 2026-09-04 log]`

## A gap they identified themselves, and excluded

Being punished during their **own** charged-move cast:
*"its charged move damage windows are so quick that if it decides to charge move after you charge
on Raichu youre fucked"*; *"also concept of guaranteed ass whooping from fast attacks while you
charge attack same way"*; and then, explicitly, *"not factored into my survivability comparison for
X and Y tho"*. They also named it, memorably, *"self Morgana Q eternal snare prison self cc"*.
`[sourced: 2026-09-04 log]`

`[inference]` They already know this effect is real and already know their own numbers omitted it.
If a feature's value depends on cast-window vulnerability, that is a known-interesting area for
them — but check `MECHANICS.md` (which carries a related open question about time lost around one's
own charged-move cast) before assuming the engine does or doesn't model it.

## BELIEFS TO VERIFY (-> pogo-researcher)

State these as **this player's belief**, never as fact:

- **Dodge window duration.** *"I think dodge only lasts 0.7 seconds from what I read"* — hedged by
  the player themselves. Not checked against `MECHANICS.md`'s `## Dodging` section.
  `[sourced: 2026-09-04 log]`
