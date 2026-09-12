---
name: docs-redirects
description: docs.claude.com/en/docs/claude-code/* pages 301-redirect to code.claude.com/docs/en/* — fetch the new base directly
metadata:
  type: reference
---

As of 2026-09-12, `https://docs.claude.com/en/docs/claude-code/mcp` and
`https://docs.claude.com/en/docs/claude-code/sub-agents` both 301-redirect to
`https://code.claude.com/docs/en/mcp` and `https://code.claude.com/docs/en/sub-agents`
respectively. WebFetch does not auto-follow the redirect (reports it and asks for a re-fetch with
the new URL). Fetch `code.claude.com/docs/en/<page>` directly next time to save a round trip;
`https://docs.claude.com/en/docs/claude-code/overview` (named in my own instructions) may have
moved the same way — check before assuming it still resolves.
