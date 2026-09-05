---
name: proposal-dps-tdo-vocabulary
description: Proposed web UI change — label existing result-card metrics with the community-standard raid-attacker vocabulary (DPS, TDO) alongside this project's own metric names, so real players' existing mental model transfers immediately; status as of 2026-09-05 is proposed, not yet routed/built
metadata:
  type: project
---

Proposed 2026-09-05 (third ideation pass, first UI-focused pass, by this agent). Not yet built,
rejected, or routed — status: **proposed, pending overseer decision**.

**What it would show:** community raid-attacker tools (GamePress-style rankings; confirmed via web
search 2026-09-05, [community-consensus] tier — see aggregator sites like Dittobase, PoGoMate,
DoctorPokeGoGo's published "rating methodology" page) universally reason about attackers along two
named axes: **DPS** (damage per second — the sustained fast+charged output rate) and **TDO** (total
damage output — how much damage one attacker deals in total before fainting, which folds in its own
bulk). Some go further with a blended "eDPS"/"Score" that weights DPS more heavily for tight-timer
raids and TDO more for solo/duo survivability-matters scenarios — i.e., real players already have a
two-axis mental model that's strikingly close to this tool's own "own DPS" vs "own total damage"
split. This app's result cards currently use only its own home-grown labels ("Own damage per
second", "Mean own total (charged+fast)") with no bridge to the vocabulary a player coming in from
GamePress/PvPoke already has memorized. Proposed: append the community term in parentheses —
"Own damage per second (DPS)" and "Mean own total (charged+fast) (TDO)" — no behavior change, just
a label change, so an incoming player recognizes their own existing two numbers immediately instead
of re-deriving that mapping themselves.

**Why it sharpens the thesis:** the whole product's pitch is that DPS and TDO alone are not enough
— team-attributable damage is a third term neither captures. That pitch lands far harder for a
player who already recognizes DPS/TDO as "the two numbers I already compare attackers by" and can
immediately see this tool adding a third, rather than a player who has to first figure out that this
tool's unlabeled metrics are the same two things they already know under different names. This is a
zero-risk, low-effort change that makes the "own + team" headline metric read as "here's the number
beyond DPS and TDO," not just another unfamiliar figure among several.

**Standing-decision check:** presentation-only (label text), zero `Scenario`/engine impact, no new
setting. Doesn't touch the 1.3 mega-boost constant, doesn't reintroduce a combat-phase selector, not
the ruled-out Teambuilding Analyzer.
