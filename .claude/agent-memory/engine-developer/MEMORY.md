# Engine-Developer Memory Index

- [Boost-persists-through-faint feature](feature_boost_persists_through_faint.md) — SpeciesDefinition.boost.persistsThroughFaint, uptime.ts's fightDurationSeconds, PRIMAL_KYOGRE fixture change
- [Shadow stat multipliers](constant_shadow_multipliers.md) — SHADOW_ATTACK_MULTIPLIER/SHADOW_DEFENSE_MULTIPLIER, pre-floor application, mega/primal mutual-exclusion throw
- [Stepwise tick-timing audit](investigation_stepwise_tick_timing.md) — tick-alignment assertTickAligned, DODGE_WINDOW_SECONDS confirmed dead-by-design, same-tick animation-vs-fatal-hit tie-break bug fixed
- [damageTakenTrajectory field](feature_damage_taken_trajectory.md) — StepwiseRunResult's damage-taken time series, flows to representativeRun with zero comparison.ts changes; DPS-definition ambiguity flagged
- [Weather + boss moveset sweep](feature_weather_and_boss_moveset_sweep.md) — weather.ts's WeatherCondition/isWeatherBoosted wired into comparison.ts per-move both-sides; compareAcrossBossChargedMoves; +5-levels omission documented
- [Team Raid wipe-and-revive](feature_team_raid_wipe_and_revive.md) — teamRaid.ts's cycling orchestrator, MAX_TEAM_RAID_CYCLES cap, reviveCostSeconds; teamWiped deleted (not a real loss condition)
- [Species reverse-lookup](feature_species_reverse_lookup.md) — speciesReport.ts's runSpeciesReverseLookup, caller-supplied typeMatchupCorpus (no-I/O call I had to make), no team-boost attribution
- [Real raid-boss tier stats](fact_raid_boss_tier_math.md) — RAID_BOSS_CPM=1.0/iv=0 only applies to precomputed bosses; real species need per-tier math, HP is a flat table not effectiveStat
- [Test-fixture boss flag ripple](feedback_test_fixture_precomputed_flag.md) — hand-authored SpeciesDefinition boss literals across the whole test suite needed statsArePrecomputed:true too, not just the 4 product fixtures
- [Boss tier is derived data, not a Scenario setting](feedback_boss_tier_not_in_scenario.md) — deliberately did not add a Scenario field for raid tier; judgment call, flag if a future request wants a real tier-override UI control
- [Fixture deletion: hypothetical duo](fixture_deletion_hypothetical_duo.md) — deleted MEGA_RAICHU_X/Y/PRIMAL_KYOGRE/MEGA_SKARMORY, replaced with test-only fixtures
- [Real vs hypothetical fixture tradeoff](real_vs_hypothetical_fixture_tradeoff.md) — prefer hand-authored pins over real synced species for exact regression numbers
- [Mid-animation-death vs zero-charged-damage investigation](investigation_charged_damage_mid_animation_contradiction.md) — skeptic-reported "contradiction" was real mechanic (2 casts/run), actual bug was in web's caveat text, not engine
- [IV comparison feature](feature_iv_comparison.md) — ivComparison.ts's compareIvSpreads, exact signature, non-monotonic divergence finding, no Scenario field added (engine-only task)
- [CPM table extended to level 50](fact_cpm_table_extended_to_50.md) — cpm.ts's CPM_TABLE 1-50, values pre-verified by pogo-researcher (not re-derived), 50.5+ deliberately excluded
- [Dead-code audit 2026-09-06](dead_code_audit_2026_09_06.md) — deleted Combatant/accumulateEnergy/EnergyEvent/energyFromFastMove; kept+documented runComparison/simulateOpeningBurst cluster as intentional acceptance-pin
