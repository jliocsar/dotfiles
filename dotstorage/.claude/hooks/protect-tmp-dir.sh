#!/usr/bin/env bash
# PreToolUse(Bash) hook: refuse to delete the relative `tmp/` workspace.
# `tmp/` is the agreed throwaway scratch dir — deleting files *inside* it is
# fine, but nuking the directory itself (`rm -rf tmp`, `rmdir tmp`, `trash tmp`,
# `find tmp -delete`) wipes in-flight work and breaks the convention. Deleting
# the system `/tmp` or a nested `build/tmp` is left alone; only the bare
# relative `tmp` argument is protected.
set -euo pipefail

command="$(jq -r '.tool_input.command // empty')"
[ -z "$command" ] && exit 0

# Is this a removal command at all? Bare `rm`/`rmdir`/`trash`, or a `find` that
# deletes. If not, nothing to guard.
removes=0
if grep -Eq '\b(rm|rmdir|trash|trash-put)\b' <<<"$command"; then removes=1; fi
if grep -Eq '\bfind\b.*(-delete|-exec[[:space:]]+rm)' <<<"$command"; then removes=1; fi
[ "$removes" -eq 1 ] || exit 0

# Does it target the relative `tmp` dir *as a whole argument*? Matches `tmp`,
# `tmp/`, `./tmp`, `./tmp/` bounded by whitespace/operators — but NOT
# `tmp/some/file` (a file inside), nor `/tmp` (absolute), nor `foo/tmp`.
grep -Eq '(^|[[:space:]=])(\./)*tmp/?([[:space:];&|)]|$)' <<<"$command" || exit 0

reason=$(cat <<'HINT'
Blocked: don't delete the relative `tmp/` directory — it's the shared throwaway
workspace and may hold in-flight work.

Deleting files *inside* it is fine:
    rm -rf tmp/some-old-run    # ok
    rm tmp/*.log               # ok

Removing the directory itself is what's blocked:
    rm -rf tmp                 # blocked
    rmdir tmp / trash tmp      # blocked

Clean the contents, or if you genuinely need the dir gone, ask the user to do it.
HINT
)

jq -n --arg reason "$reason" '{
	hookSpecificOutput: {
		hookEventName: "PreToolUse",
		permissionDecision: "deny",
		permissionDecisionReason: $reason
	}
}'
exit 0
