# Meta-Architect Memory Index

- [Project config shape](project-config-shape.md) — current: 9 agents as of 2026-09-06; also logs the 2026-09-06 "three tabs" stale-doc fix (4th tab, IV Breakpoints, added but CLAUDE.md not updated).
- [pogo-researcher addition](pogo-researcher-addition.md) — 2026-09-05: 7th agent, routing clean, both findings (unscoped Write, Teambuilding-Analyzer decision) fixed same day.
- [skeptic addition](skeptic-addition.md) — 2026-09-06: 8th agent, browser-driving adversarial checker of the live app; routing distinguished from engine-verifier/site-builder/pogo-researcher; description trimmed 760→537 chars.
- [code-simplifier addition](code-simplifier-addition.md) — 2026-09-06: 9th agent, read-only dead-code/duplication auditor for packages/engine+web/scripts, out of .claude/ scope; must cross-check CLAUDE.md Standing Decisions before flagging; no ts-prune/knip installed so relies on Grep.
- [Six-agent split audit](six-agent-split.md) — 2026-09-05: engine-developer/web-developer added, site-builder narrowed; routing clean, CLAUDE.md cut ~62%, two real findings.
- [Sprite mechanism dropped](sprite-mechanism-dropped.md) — RESOLVED (was a false positive): content was already in data-sync.md/engine-developer.md at d1305f6.
- [web-developer tool mismatch](web-developer-tool-mismatch.md) — RESOLVED (was a false positive): web-developer.md already hedges on tool availability at d1305f6.
- [CLAUDE.md changelog drift](claude-md-changelog-drift.md) — recurring pattern: incident narrative creeps into CLAUDE.md instead of staying in HANDOFF.md/git history.
- [Agent-doc fossilization](agent-doc-fossilization.md) — agent bodies can describe a designed-but-never-built mechanism; verify against actual code, not just against CLAUDE.md. Fixed 2026-09-04.
- [Site-builder push guardrail](site-builder-push-guardrail.md) — RESOLVED 2026-09-05: settings.json now has a permissions.ask rule on `git push:*`.
- [data-sync normalize gap](data-sync-normalize-gap.md) — RESOLVED 2026-09-05: data-sync.md now has a "## Normalize" section.
- [engine-verifier/hook overlap](engine-verifier-hook-overlap.md) — RESOLVED 2026-09-05: description retargeted to hook-aware framing as recommended.
