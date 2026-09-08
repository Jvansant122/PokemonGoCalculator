---
name: blocker-disk-full-playwright-task
description: 2026-09-08 disk-full blocker on the Playwright e2e task — RESOLVED 2026-09-08, suite shipped once free space returned; kept for the disk-space-check habit
metadata:
  type: project
---

**RESOLVED 2026-09-08** (same day, once the host's C: drive had 13GB free again): the
Playwright browser smoke suite shipped — see [[feature_playwright_e2e_suite]] for what it
actually looks like. This entry's only remaining value is the disk-space-check habit below.

Original blocker: attempted to add the suite and hit a hard environment blocker before any
spec file could be written — the host's C: drive (476GB total) had **0 bytes free**, confirmed
three independent ways (`Get-CimInstance Win32_LogicalDisk`, `Get-PSDrive C`, and an actual
`Edit` tool call failing with `ENOSPC`). `@playwright/test: ^1.63.0` landed as a devDependency
before the disk filled; nothing else did.

**How to apply going forward:** before starting ANY session's Playwright/browser-install work
(or any task involving `npm install` of a new heavy devDependency, `vite build`, or writing new
large files) in this environment, check free space first:
`powershell -NoProfile -Command "(Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='C:'\").FreeSpace"`.
If it reports near-zero, stop and tell the user immediately rather than attempting
increasingly risky writes — do NOT start deleting large user directories to "solve" this
without the user's explicit go-ahead.
