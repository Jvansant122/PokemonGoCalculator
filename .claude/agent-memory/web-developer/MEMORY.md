# Web-Developer Memory Index

- [Wiring persistsThroughFaint into the UI](wiring_persists_through_faint.md) — call-site plumbing, the chart's progressive-time formula trick, badge-priority convention
- [Verifying without a browser tool](verification_without_browser_tool.md) — build/serve/curl/node-check ladder, and a scratch-script technique for proving a formula numerically
- [Sensitivity flip-bar + result-card share bar](sensitivity_flip_bar_and_share_bar.md) — two delta-vs-absolute bugs found, per-row independent scan axes, node strip-types' import-resolution ceiling
- [Shared trajectory-interpolation helpers](pattern_shared_trajectory_helpers.md) — DamageOverTimeChart.tsx owns ownDamageAt/teamContributionAt/totalAt; reuse, don't refork, for any new time-series view
- [Weather + boss-moveset-sweep UI](feature_weather_and_boss_moveset_sweep.md) — full add-scenario-assumption checklist for weather, BossMovesetSweep.tsx, which species have 2+ charged moves to test with
- [weather.ts not re-exported from engine index.ts](gap_weather_not_reexported.md) — WeatherCondition/WEATHER_BOOSTED_TYPES unreachable from packages/web; Scenario["weather"] workaround used
