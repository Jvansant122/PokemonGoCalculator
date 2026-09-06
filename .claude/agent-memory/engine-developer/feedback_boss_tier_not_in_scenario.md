---
name: feedback-boss-tier-not-in-scenario
description: Deliberately did NOT add a Scenario field for the boss's real raid tier — it's derived data about the target (like baseAttack/imageUrl), not an independent user-facing setting, since there's no UI control for it
metadata:
  type: feedback
---

When wiring real per-tier raid-boss stats through to the web UI ([[fact-raid-boss-tier-math]]), I
considered but rejected adding a `Scenario.targetRaidTier` field, even though the standing
CLAUDE.md rule is "every user-facing assumption must round-trip through Scenario."

**Reasoning**: a boss's tier isn't an independent setting a user picks anywhere in the UI — it's
resolved automatically from `target` (species id) via the live active-raid feed
(`registry.ts`'s new `raidTierForSpeciesId`), exactly the same way `boss.baseAttack`/`imageUrl`/
every other boss stat is already re-derived fresh from `target` on every load and never separately
serialized into `Scenario`. Adding a field for it without a corresponding UI control would be
inconsistent with how every other derived-boss-data field already works, and would invite drift
(a stored tier string silently going stale/wrong if a future UI control is added without updating
this field's meaning).

**How to apply**: if a future request asks for an explicit tier-override control (a real UI
picker, so the user can say "treat this as a 5-star even though the live feed marks it something
else"), THAT is the point a new `Scenario` field becomes correct — the missing-round-trip rule
applies to actual user-facing settings with a control, not to every derived fact about the
target. Flag this distinction if a future session is unsure whether some new boss-derived value
needs a Scenario field.
