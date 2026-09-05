# Meta-Architect Memory Index

- [Project config shape](project-config-shape.md) — 4 agents, 2 skills, 1 hook, settings.json as of 2026-09-05; sizes and what each covers.
- [CLAUDE.md changelog drift](claude-md-changelog-drift.md) — recurring pattern: incident narrative creeps into CLAUDE.md instead of staying in HANDOFF.md/git history.
- [Agent-doc fossilization](agent-doc-fossilization.md) — agent bodies can describe a designed-but-never-built mechanism; verify against actual code, not just against CLAUDE.md. Fixed 2026-09-04 (uncommitted until 2026-09-05).
- [Site-builder push guardrail](site-builder-push-guardrail.md) — prompt-only "ask before push" rule; re-flagged 2026-09-05 now that settings.json precedent exists, still not applied.
- [data-sync normalize gap](data-sync-normalize-gap.md) — data-sync.md never says to run `npm run sync-data`; reads as hand-normalizing, duplicating scripts/sync-data.ts's canonical transform. Flagged 2026-09-05, not fixed.
- [engine-verifier/hook overlap](engine-verifier-hook-overlap.md) — the new PostToolUse test hook mechanically covers engine-verifier's reactive trigger; retarget its description proposed, not applied.
