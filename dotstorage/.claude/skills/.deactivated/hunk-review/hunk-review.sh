#!/usr/bin/env bash
# Opens hunk on the current changeset for a human review, waits for the reviewer
# to close it, and prints the notes they saved. No notes means approved.
#
# Hunk keeps review notes in the live session only: they are gone the moment the
# TUI exits. So this polls the session daemon and keeps the newest snapshot,
# which is what gets printed once the session disappears.
set -uo pipefail

readonly poll_interval_seconds=0.4
readonly session_wait_attempts=300 # 300 * 0.4s = 2 minutes to open the review

repo_root=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$repo_root" ]; then
	printf 'hunk-review: not inside a git repository.\n' >&2
	exit 1
fi

notes_snapshot=$(mktemp -t hunk-review-notes.XXXXXX)
notes_incoming="$notes_snapshot.incoming"
trap 'rm -f "$notes_snapshot" "$notes_incoming"' EXIT

session_is_live() {
	hunk session get --repo "$repo_root" --json >/dev/null 2>&1
}

hunk_command="hunk diff"
for review_argument in "$@"; do
	hunk_command+=$(printf ' %q' "$review_argument")
done

if session_is_live; then
	printf 'Reusing the Hunk session already open on %s.\n' "$repo_root"
elif [ -n "${TMUX:-}" ]; then
	tmux new-window -n hunk-review -c "$repo_root" "$hunk_command"
else
	printf 'Not inside tmux — run this in another terminal:\n  cd %q && %s\n' "$repo_root" "$hunk_command"
fi

printf 'Waiting for the review. Add notes with "c", save each with ^S, then quit with "q".\n'

attempt=0
until session_is_live; do
	attempt=$((attempt + 1))
	if [ "$attempt" -lt "$session_wait_attempts" ]; then
		sleep "$poll_interval_seconds"
	else
		printf 'hunk-review: no Hunk session appeared for %s.\n' "$repo_root" >&2
		exit 1
	fi
done

while hunk session comment list --repo "$repo_root" --type user --json >"$notes_incoming" 2>/dev/null; do
	mv "$notes_incoming" "$notes_snapshot"
	sleep "$poll_interval_seconds"
done

note_count=$(jq '.comments | length' "$notes_snapshot" 2>/dev/null)
if [ "${note_count:-0}" -gt 0 ]; then
	printf '\nCHANGES REQUESTED — %d review note(s):\n\n' "$note_count"
	jq -r '.comments[] | "- \(.filePath) line \((.newRange // .oldRange // [0])[0]):\n  \(.body)"' "$notes_snapshot"
else
	printf '\nAPPROVED — the reviewer closed Hunk without leaving notes.\n'
fi
