#!/usr/bin/env bash
# SessionStart hook. Two jobs:
#  1. Put Node on PATH for the whole session (via CLAUDE_ENV_FILE) so no skill, agent, or
#     hook has to repeat the "fresh shells don't have node" workaround.
#  2. Print the orientation a fresh session is supposed to read first: HANDOFF.md's newest
#     section and the working-tree state. Output goes to the model's context as the hook
#     result; it must stay short.
NODE_DIR="/c/Program Files/nodejs"
if [ -n "$CLAUDE_ENV_FILE" ] && [ -d "$NODE_DIR" ]; then
  echo "export PATH=\"$NODE_DIR:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi
export PATH="$NODE_DIR:$PATH"

cd "$(dirname "$0")/../.." || exit 0

echo "== git status (short) =="
git status --short --branch 2>/dev/null | head -25
echo
echo "== HANDOFF.md — newest section (read the full file before starting unfinished work) =="
# Print from the first "## " heading up to (not including) the second one, capped.
awk 'BEGIN{n=0} /^## /{n++} n==1{print} n==2{exit}' HANDOFF.md | head -60
echo
plans=$(ls PLAN_*.md 2>/dev/null)
if [ -n "$plans" ]; then echo "== Pending PLAN_*.md =="; echo "$plans"; fi
exit 0
