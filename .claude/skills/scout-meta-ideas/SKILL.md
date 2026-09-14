---
name: scout-meta-ideas
description: Runs one `meta-researcher` scouting pass for new Claude Code tooling/setup ideas and logs what comes back in `meta_ideas.md`. Use when the user asks to scout, mine, or hunt for tooling ideas, asks what this project's Claude Code setup is still missing, or invokes this skill by name. Built to be re-run — it feeds the already-logged and already-declined ideas back in as an exclusion ledger, so each pass mines new ground instead of re-deriving the last one.
---

# Scout meta ideas

One pass is three steps: build the exclusion ledger, launch `meta-researcher` with it, write the
result into `meta_ideas.md`. The ledger is the whole reason this is repeatable — without it,
pass N+1 re-proposes pass N and you pay a full agent pass to reject something twice.

This is tooling only: agents, skills, hooks, `CLAUDE.md`, `settings.json`, the checkers. Product
feature ideas belong in `IDEAS.md` and are `pogo-researcher`'s side of the house.

## 1. Build the exclusion ledger

Read both files in full:

- **`meta_ideas.md`** — every idea already logged, with its status. Anything not `Declined` is
  still occupying that seam. Note every **zero-result pass** date too: an exhausted seam is itself
  information the agent should have.
- **`REJECTED_IDEAS.md`** — declined outright. The **"Tooling and process rejections"** section
  (entries #15-22) is the relevant half, though a product rejection can still bind a tooling
  proposal.

Pass the contents, or a faithful one-line-per-entry summary, into the prompt. **Summarise the
*reason*, not just the title.** Several of those entries died on a specific measurement (#15 on two
false positives out of the first two paths sampled; #21 on the arithmetic of permanent MCP tool
descriptions), and an agent given only titles will re-derive the idea and hand it back.

## 2. Launch `meta-researcher`

One Agent-tool call, `subagent_type: meta-researcher`. The prompt carries:

- The ledger from step 1, labelled plainly as **already proposed** vs **already declined**.
- **Up to three proposals — never exactly three.** Say this explicitly. Its definition caps at
  three and names padding as its characteristic failure mode, so a prompt that asks for three
  manufactures three. **Zero is a valid, welcome outcome** and must be reported as such.
- Whatever fresh evidence this session has: `HANDOFF.md`'s newest section, this session's own
  failures or friction, recently-edited surfaces, `git log --oneline -15`. Evidence-mined passes
  have produced better findings here than pure platform surveys.
- Nothing about its output format — it already defines one (SURVEYED / RECOMMENDED / RETIRE /
  CONSIDERED AND DROPPED / CONFLICTS WITH STANDING DECISIONS / BLOCKED ON ACCESS). Don't override it.

Never ask it to edit anything. It proposes; `meta-architect` implements.

## 3. Log the result

Prepend a dated section to `meta_ideas.md`, newest first. One block per proposal:

```
### 2026-09-14 — <short title>
- **Evidence:** what in THIS repo it fixes, with the incident, file, or number behind it.
- **Ongoing context cost:** the load point and its price — agent description, `CLAUDE.md` line,
  skill listing, agent body, MCP server, or none (a hook/script costs no context).
- **Status:** Proposed
```

Then, one line each: RETIRE candidates with their evidence, CONSIDERED AND DROPPED with the reason
each lost, and any named standing-decision conflict. A BLOCKED ON ACCESS item gets a row in
`LINKS.md` — that file is the queue for unreachable pages; this one is not.

**A pass that recommends nothing still gets a dated entry.** Record what it surveyed and why each
candidate lost. Skipping it is how the next invocation spends a full agent pass rediscovering
"nothing here".

## Then stop

Logging is the deliverable. Don't implement a proposal in the same pass: `Proposed` becomes
`Accepted` only when the user says so, and `meta-architect` owns the edit. Changing a status is a
one-line edit to `meta_ideas.md`.
