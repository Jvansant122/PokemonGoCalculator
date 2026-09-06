# Web-Developer Memory Index

- [Wiring persistsThroughFaint into the UI](wiring_persists_through_faint.md) — call-site plumbing, the chart's progressive-time formula trick, badge-priority convention
- [Verifying without a browser tool](verification_without_browser_tool.md) — build/serve/curl/node-check ladder, and a scratch-script technique for proving a formula numerically
- [Sensitivity flip-bar + result-card share bar](sensitivity_flip_bar_and_share_bar.md) — two delta-vs-absolute bugs found, per-row independent scan axes, node strip-types' import-resolution ceiling
- [Shared trajectory-interpolation helpers](pattern_shared_trajectory_helpers.md) — DamageOverTimeChart.tsx owns ownDamageAt/teamContributionAt/totalAt; reuse, don't refork, for any new time-series view
- [Prefer cumulative totals over rate columns](feedback_cumulative_not_rate.md) — a per-row DPS/rate column decays toward zero once a candidate dies but elapsed time keeps growing; use running totals instead; row step later fixed to always-1s (superseded pickRowStep)
- [Weather + boss-moveset-sweep UI](feature_weather_and_boss_moveset_sweep.md) — full add-scenario-assumption checklist for weather, BossMovesetSweep.tsx, which species have 2+ charged moves to test with
- [Disable-mega-boost toggle + undefined-boost N/A convention](feature_disable_mega_boost_toggle.md) — candidateMegaBoostDisabled checklist, resolveBoost(species,disabled) helper, "N/A not 0" display rule, a real tsx cwd-resolution gotcha
- [Attack/Defense/Stamina IV sensitivity checks](feature_iv_sensitivity_checks.md) — copied Level check's exact pattern, runSustained gained ivs override, tsx now proven to clear the strip-types import ceiling
- [IV-input spinner + layout QA fixes](bugfix_iv_input_spinner_and_layout_qa.md) — narrow number-input spinner ate clicks and hid the digit; also grid/caption/flex-shrink fixes
- [Mega-boost copy said "your party", real mechanic boosts other trainers](fix_teammate_boost_copy_backwards.md) — copy-only fix across 5 files; uptime.ts doc comments flagged to engine-developer, not edited
- [Hide inert boost UI + move EPS/efficiency metrics](feature_hide_inert_boost_ui_and_move_efficiency_metrics.md) — anyBoostActive-gated party fields/columns, local hasActiveBoost (not imported, avoids circular import), MoveSelect EPS/DPS×DPE additions
- [Team Raid Simulator tab + tab-switcher scaffold](feature_team_raid_simulator_tab.md) — isMega validation-only gotcha, per-tier bossEffectiveHp, trajectories already stacked (no shared-helper reuse needed), normalizeTeamAssumptions pattern
- [weather.ts re-export gap](gap_weather_not_reexported.md) — RESOLVED 2026-09-06, engine now exports it directly; old workaround is obsolete, don't reintroduce it
- [Species Report tab (reverse lookup)](feature_species_report_tab.md) — ComparatorPrefill hand-off, why its Scenario codec lives in web not engine, scope cuts on bossStartsPrimed for multi-boss sweeps
