# Meta-Architect Memory Index

- [Project config shape](project-config-shape.md) — current: 6 agents as of 2026-09-05 pm; pre-split 4-agent snapshot kept below for history.
- [Six-agent split audit](six-agent-split.md) — 2026-09-05: engine-developer/web-developer added, site-builder narrowed; routing clean, CLAUDE.md cut ~62%, two real findings.
- [Sprite mechanism dropped](sprite-mechanism-dropped.md) — fetchMegaSpriteUrls/mega_sprite_urls.json/kyogre-primal-attacker rename gotcha is live in code but missing from data-sync.md and engine-developer.md. Flagged 2026-09-05, not fixed.
- [web-developer tool mismatch](web-developer-tool-mismatch.md) — body instructs preview_start/read_console_messages, not in its own tools: grant. Flagged 2026-09-05, not fixed, needs env verification.
- [CLAUDE.md changelog drift](claude-md-changelog-drift.md) — recurring pattern: incident narrative creeps into CLAUDE.md instead of staying in HANDOFF.md/git history.
- [Agent-doc fossilization](agent-doc-fossilization.md) — agent bodies can describe a designed-but-never-built mechanism; verify against actual code, not just against CLAUDE.md. Fixed 2026-09-04.
- [Site-builder push guardrail](site-builder-push-guardrail.md) — prompt-only "ask before push" rule; still open, unchanged by the 2026-09-05 split.
- [data-sync normalize gap](data-sync-normalize-gap.md) — RESOLVED 2026-09-05: data-sync.md now has a "## Normalize" section.
- [engine-verifier/hook overlap](engine-verifier-hook-overlap.md) — RESOLVED 2026-09-05: description retargeted to hook-aware framing as recommended.
