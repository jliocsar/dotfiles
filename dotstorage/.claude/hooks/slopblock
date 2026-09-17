#!/usr/bin/env bash
# Stop hook: reject LLM slop vocabulary in the final message and make Claude
# rewrite it in plain English.
#
# This can only fire *after* the message is rendered — there is no pre-output
# hook — so the block shows up as a correction, not a censor. Fenced and inline
# code are stripped first: a file named `escape-hatch.ts` is not slop.
set -euo pipefail

payload="$(cat)"

# Claude Code is already re-prompting because of this hook. Let the turn end
# instead of looping.
[ "$(jq -r '.stop_hook_active // false' <<<"$payload")" = "true" ] && exit 0

message="$(jq -r '.last_assistant_message // ""' <<<"$payload")"
[ -n "$message" ] || exit 0

prose="$(
	printf '%s\n' "$message" |
		awk '/^[[:space:]]*```/ { inside_fence = !inside_fence; next } !inside_fence' |
		sed 's/`[^`]*`//g'
)"

banned='\b(seams?|load[ -]bearing|escape hatch(es)?|leverag(e|es|ed|ing)|tractable|red herrings?|push back|probe|smoking guns?|silver linings?|north stars?|rabbit holes?|delv(e|es|ed|ing)|landscapes?|orthogonal(ly)?|sharp edges?|surface area|intricate|intricately|intricacies)\b'

hits="$(grep -oiE "$banned" <<<"$prose" | tr 'A-Z' 'a-z' | sort -u | paste -sd, - | sed 's/,/, /g' || true)"
[ -n "$hits" ] || exit 0

reason="Slop words in your last message: ${hits}

Rewrite the message without them. Say the plain thing instead, like a human would.

Say the same content again, plainly. Do not apologise and do not explain the rewrite."

jq -n --arg reason "$reason" '{decision: "block", reason: $reason}'
