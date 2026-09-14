# REJECTED_IDEAS.md — things this project deliberately will not do

**Every entry here carries the same note: I don't want this added.** That is the point of the
file. If you are an agent or a future session reading this, an item below is not a gap waiting to
be filled, not an oversight, and not a TODO. It was considered and declined on the merits, and
re-proposing it costs budget that has already been spent at least once.

If you think an entry is wrong, say so to the user and cite what changed — don't quietly build it.

## How this file differs from its neighbours

Keep these lanes separate; merging them is how a "no" turns back into a "maybe".

| File | What lives there |
| :--- | :--- |
| `IDEAS.md` "Open" | Things we **would** build, unscheduled. |
| `IDEAS.md` "Unmodelled real mechanics" | Things we **would** build but **cannot** — blocked on evidence that does not exist. Each names what would unblock it. A source arriving makes these live again. |
| **`REJECTED_IDEAS.md`** (this file) | Things we **would not** build even if they were free and fully unblocked. Evidence does not rescue these; only a deliberate user decision does. |

The distinction that matters: *blocked* is "not yet", *rejected* is "no". An item blocked on a
`LINKS.md` fetch belongs in `IDEAS.md`, not here.

---

## 1. Multi-trainer mega staggering across a raid lobby

Deciding who megas when, across several trainers, since the mega boost doesn't stack.

**Why not:** out of scope as a standing decision in `CLAUDE.md`, ruled out once and re-confirmed
as still ruled out when the single-trainer lineup builder was approved. This tool models one
trainer's own roster.

⚠️ **This is the single most re-proposed item in the project**, usually by `pogo-researcher`
during ideation, because it is genuinely interesting. It is also the easiest to smuggle in under
the word "team". The test is **whether it crosses trainers**, not whether "team" appears in the
name — the Team Raid Simulator and the lineup builder are both single-trainer and both in scope.

## 2. Removing or de-scoping a tab because a casual player wouldn't open it

**Why not:** explicit user instruction, 2026-09-10 — *"we dont care that the casual player doesnt
want some tabs. any audit saying to remove an entire tab should be ignored."* This tool targets
the high-investment player. The deep tabs exist precisely because they answer questions a casual
player never asks.

`pogo-player`'s `casual-optimizer` archetype rejecting a tab on premise is **expected output**,
labelled `STRUCTURAL`. Worth one line, never a fix cycle. Objections to how a tab *works* remain
fully in scope from every archetype.

## 3. Blending stardust and candy into one efficiency score

**Why not:** they are not fungible for a real player. The Power-Up Optimizer ranks them as two
separate numbers on purpose, and the same rule extended to the four TM currencies. One sorted list
over one composite score would destroy the distinction the tab exists to make.

Corollary, same reasoning: a zero-cost candidate (Best Buddy) gets its own presentation rather
than a fabricated denominator.

## 4. A live "is a Taken Over event running right now" check for Frustration

**Why not:** it would make a share link's answer depend on *when it is opened*. A scenario in this
app must decode to the same numbers tomorrow as today. Any event gating must be a **static**
label.

This one is subtle because the live check is more "accurate" in the moment — and that is exactly
why it is wrong here.

## 5. Regular (non-Elite) TM ranking as a single score

**Why not:** the reroll is random over a pool whose size varies per species, and the distribution
has never been confirmed uniform (`LINKS.md` #3). A single expected-value number would inherit
that uncertainty invisibly, and the action is destructive and irreversible — a legacy move lost to
a regular TM can only be restored by an Elite TM.

**If it is ever built** it must show a `[worst, expected, best]` band, never one blended number.
That is a condition, not an invitation.

## 6. Mega Energy as an investment currency for Super Max progression

**Why not:** it would rest on two stacked `[unverified]` numbers — the CP bump and the
"+10% per Mega Level tier" curve — repeating in miniature the fabricated-stats failure this
project was already burned by. `LINKS.md` #1 (one in-game screenshot) is what would unblock the
curve; until then this is guesswork wearing a number.

## 7. An event-worth-attending calculator

**Why not:** needs calendar data this tool does not ingest, and would make the app's answers
time-dependent. A different product.

## 8. Hand-authored or "hypothetical" species reaching the live picker

**Why not:** four hand-authored species were deleted at the user's explicit request (2026-09-06)
after they turned out to be reachable from `packages/web`'s species picker, which was never the
intent. Fabricated stats presented next to real ones is the most damaging failure mode this
project has.

Real content that the automated gates structurally cannot see goes through
`RELEASED_MEGA_PRIMAL_ALLOWLIST` — hand-reviewed and per-entry-cited — never a fabricated entry.
Test-only fixtures live under `packages/engine/test/fixtures/` and are never re-exported from
`packages/engine/src/index.ts`.

## 9. Raising the optimizer's paired-seed iteration count

**Why not:** measured 2026-09-10, not assumed. 20 → 100 iterations costs ~553 ms → ~2643 ms to
move a marginal candidate's stdev from 0.107 to 0.026 — noise the existing floor already absorbs
by reporting "no measurable change" rather than a signed number. A ~5× cost for a reduction that
changes no conclusion.

⚠️ `IDEAS.md` previously claimed this ran at 3 iterations. It had been 20 for some time. That
stale line cost an agent an entire run before it discovered the premise was false — which is why
this entry records the measurement rather than just the verdict.

## 10. Forcing `isMega: false` to resolve the move-change mega conflict

Context: `rosterMoveChange.ts` could field two Mega Evolutions and throw. Three fixes were
available; two were rejected.

**Rejected — suppress the candidate's own mega:** cheap, but it silently evaluates a *different*
Pokémon than the user would actually field, badly understating a strong mega. A wrong number that
looks right is worse than a crash.

**Rejected — exclude the pairing entirely:** this would gut the benched-mega case, which is the
*common* shape of a real roster (the planner fields your best mega and benches the rest), not a
rare edge case.

**Chosen:** displace the fielded mega, and show `displacedFieldedMega` on screen so the row's
changed meaning is visible.

## 11. A joint budget allocator for move changes

**Why not:** deliberate scope cut, not an oversight. Move-change currencies (Fast TM, Charged TM,
Elite Fast, Elite Charged) are non-fungible with each other *and* with stardust/candy, so a joint
allocation would need a four-plus-dimensional constraint solve to say anything honest.

Do not approximate it by decrementing counts as the user reads down a list — that would imply a
joint plan the tool never computed.

## 12. Purging the stray 18 MB GAME_MASTER blob from git history

**Decided by the user, 2026-09-11** — recorded here so it is not re-proposed, though this one is
their call rather than my recommendation.

A scratch dump reached a commit (`983ca15`) via an unchecked `git add -A`. It is untracked now
with a `.gitignore` guard, so the failure mode cannot repeat. Purging the blob itself would need a
history rewrite and a force-push to a public repo. The practical cost of leaving it is small: the
repetitive JSON compresses hard, and `.git` is ~14 MB total.

## 13. Roster-mode Best Buddy candidates

The single-raid half shipped 2026-09-11. The roster/multi-raid half is **open in `IDEAS.md` #5**,
and this entry is my recommendation against scheduling it — not a decision, since the user may
disagree.

**Why I'd hold it:** measured on the default scenario, every Best Buddy candidate landed *inside*
the noise floor — best observed gain +0.49 team DPS against a ±0.73 floor at 20 seeds, shrinking
further at level 50. A single +1 effective level is simply a small effect. The build is also not
cheap: `RosterEntry` has no `isBestBuddy` field and pricing it correctly needs the same
aggregate-across-bosses machinery `RosterPowerUpCandidate` uses.

So the honest expected outcome is a feature that costs real work to produce rows that mostly read
"≈0 (within noise)". **Measure before scheduling, not after.** If a future measurement finds a
scenario where Best Buddy clears the floor, this is worth revisiting.

✅ **OVERTURNED AND BUILT 2026-09-13 (`e861049`) — the escape clause above fired as designed.**
The measurement that killed this was single-raid, and it does NOT generalize: multi-raid
significance is aggregate **OR** per-boss, and against the real active-raid set ~45-55% of a
top-attacker pool clears the PER-BOSS bar (4/49 clear the aggregate one), at magnitudes matching
the Kyurem precedent — Dialga vs Shadow Lampent +1.82 team DPS, ~17.5%, several sigma over a
0.02-0.24 floor. **Left in this file rather than deleted**, because the reasoning is still correct
for the case it was measured on, and because the shape of the error is worth keeping: a floor
measured in one mode was assumed to hold in another with a different significance rule.
Full detail: `.claude/agent-memory/engine-developer/measurement_best_buddy_roster_mode_impact.md`.


## 14. Worktree isolation for every concurrent agent

**Why not:** rejected on cost. This is an npm-workspaces monorepo, so a per-agent worktree needs
its own `npm install` plus a merge back, which outweighs the collision risk for most lanes.
Concurrency is managed by **file ownership** in one shared worktree instead.

⚠️ **That choice has a real, demonstrated failure mode, and the mitigation is a rule rather than
a tool:** on 2026-09-11 an agent ran `git stash` to compare against HEAD and reverted three other
lanes' uncommitted work. Most of it was restored; one file was left in a broken half-state and had
to be recovered from the stash ref.

**So: never run a tree-wide git command in the shared worktree** — no `git stash`, no
`git checkout --`, no `git reset`. To compare one file against a baseline, use
`git show HEAD:<path>`. An agent that needs a genuinely clean tree should create a throwaway
worktree for *verification only*, which is cheap, rather than mutating the shared one.
---

# Tooling and process rejections

Same rule as above — considered and declined on the merits. Separated only because these concern
this repo's *tooling* (hooks, skills, agents, scripts) rather than the product's features; the
lane table above still applies.

Most came out of `meta-researcher` passes on 2026-09-12 through 2026-09-14, run repeatedly until a
pass returned nothing. **Three were killed by evidence gathered specifically to test them** — that
evidence is the valuable part, not the verdict.

## 15. A grep or hook flagging "an agent doc cites a file that no longer exists"

**Why not:** tested, not assumed. ~130 backtick-quoted path-shaped tokens across all eleven agent
bodies were sampled, and the **first two non-trivial ones checked were false positives**:
`data-sync.md` cites `data/raid-bosses.json`, a fallback file that by design does not exist until
the live feed fails, and two agents cite the deleted `scenarioA` files inside prose that correctly
explains they were deleted. A low-noise version must distinguish "cited as currently live" from
"cited and explained as deleted or conditional" — semantic judgement a path regex cannot do.

⚠️ Fossilization itself is real — three instances sit in `meta-architect`'s memory, the latest
being `engine-verifier.md` pointing at a test deleted three days earlier. The *problem* stands;
this *mechanism* does not. A materially better discriminator would reopen it.

## 16. A guard against the GITHUB_PAGES base-path mismatch

Building with `GITHUB_PAGES=true` then running `test:e2e` without it (or the reverse) 404s every
asset and fails all 31 specs at once, looking exactly like a catastrophic regression.

**Why not:** already documented in three places — a comment block in
`packages/web/playwright.config.ts` describing this failure verbatim, `packages/web/e2e/README.md`'s
paired invocation, and `site-builder.md`'s gotcha list — and `npm run verify:full` keeps the two
consistent by construction. The 2026-09-14 incident happened because the operator hand-composed the
steps instead of using it. A guard would also fire on a *correct* workflow: `site-builder.md`
documents deliberately building with the flag and serving `dist` under a matching path to verify
the Pages build locally.

**The rule, not a tool: use `npm run verify:full`; don't compose build and e2e by hand.**

## 17. A hook or lint rule for the "hand-built inputs object missing a field its siblings spread" bug

Four instances landed in one day (2026-09-12): `powerUp.ts`'s ladder call site, `planPowerUpBudget`'s
dominated-level search, `runRosterMoveChange.ts`, and `rosterPlanner.ts`'s memo key omitting
`isBestBuddy`. Every one passed every test.

**Why not:** the bug is semantic — "this object literal should have carried a field its sibling call
sites pass via spread" is not path-matchable, and a hook is a path/tool matcher. The real fix is
product code, scoped as **`IDEAS.md` #25**.

## 18. One shared damage-modifier builder with an optional `friendshipLevel`

The obvious de-duplication of the 12 hand-built modifier sites.

**Why not:** it recreates #17's exact failure shape. An optional field is one a call site can
silently omit — which IS the bug. Only the typed *pair* in `IDEAS.md` #25 is worth building
(outgoing REQUIRES the field; incoming has no such parameter, making the mistake a type error).
This entry exists because "just extract a helper" is the natural first instinct every time someone
reads those 12 sites.

## 19. Annotating Frustration/Return at import instead of adding them to movepools

**Why not:** user decision, 2026-09-13, choosing option 1 of `IDEAS.md` #24's three. An annotation
leaves the wrong number in place: a Purified entry whose real charge move is Return was silently
simulating `CRUNCH`, and a defaulted moveset changes what the whole simulation runs. Accepted blast
radius: both moves are now selectable in every picker — correct behaviour showing a deliberately
terrible move. "Leave it entirely" was declined for the same reason.

## 20. A friendship control on the Species Report

**Why not:** measured 2026-09-13. Friendship moves 32-89% of floored breakpoint CELLS at Good Friend
alone, which is why both Breakpoints tabs and the Power-Up ladder got real controls — but Species
Report sums hundreds of floored hits into a distribution and a uniform 3-12% scale washes out:
Spearman ≥0.989 across 771 bosses, identical top-10, verified against a determinism control. It
carries a caveat sentence instead. **The dividing line is per-FEATURE, not per-tab:** a feature
reading ONE floored value needs a control; one summing many into a distribution needs a caveat.

## 21. The GitHub MCP server

**Why not:** its tool descriptions sit in main context permanently, and the need is better met by
the `gh` CLI (still open, awaiting a user install). The one place this repo creates GitHub issues —
`check-mega-gaps.yml` — does it inside the Actions runner via `actions/github-script`, never through
an agent, so there is no agent-side gap to justify the ongoing cost.

## 22. A dedicated skill for a fact only one agent needs

Proposed twice — a vitest worker-OOM skill for `engine-verifier`, a measure-before-building skill for
`engine-developer` — and declined both times in favour of writing the fact into that agent's own body.

**Why not:** a skill costs a line in the always-loaded listing for *every* session; an agent body is
paid only when that agent runs. Precedents: `5e35bfd`, `56d0bbc`.

⚠️ Corollary: if a fact is ever needed by *several* agents, a skill becomes the right shape, and the
subagent `skills:` frontmatter field (verified real against current docs 2026-09-12 — content is
injected at startup, though invocation by an agent lacking the `Skill` tool is undocumented) is the
mechanism.

