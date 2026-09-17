---
name: hunk-review
description: Open hunk's terminal diff viewer on the current changeset for a human review, then act on the notes that come back. No notes means approved.
allowed-tools: Bash(~/.claude/skills/hunk-review/hunk-review.sh:*)
---

# Hunk Review

## Review result

!`~/.claude/skills/hunk-review/hunk-review.sh $ARGUMENTS`

## Your task

- `CHANGES REQUESTED`: address every note above in this conversation. Each note is
  anchored to a file and line, so read that code before changing it.
- `APPROVED`: say the review passed and continue.
- Anything else (no session appeared, hunk missing): report it, do not guess.

Arguments are passed straight to `hunk diff`, e.g. `--staged`, `main...HEAD`, or
`-- src/`. Without arguments it reviews the working tree.
