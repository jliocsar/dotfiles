#!/usr/bin/env bash
# PreToolUse(Bash) hook: refuse to commit or push credentials.
#
# Secrets enter history at the moment something is committed or pushed, so this
# guards those commands rather than every file write. It covers `dotfiles sync`
# too, which runs `git add . && git commit && git push` internally — the exact
# path that once published a copy of ~/.claude.json to a public repo.
#
# Scope of the scan depends on the command: a plain `git commit` only looks at
# what is staged, while anything that sweeps the tree (`commit -a`, `add .`,
# `dotfiles sync`) also reads unstaged and untracked files. `git push` checks
# every commit the remote has not seen yet.
#
# Matches are reported truncated — a hook that echoes the secret back into the
# transcript would just relocate the leak.
set -euo pipefail

payload="$(cat)"
command="$(jq -r '.tool_input.command // empty' <<<"$payload")"
[ -z "$command" ] && exit 0

cwd="$(jq -r '.cwd // empty' <<<"$payload")"
[ -n "$cwd" ] && cd "$cwd" 2>/dev/null || true
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Does this command publish anything? If not, there's nothing to guard.
publishes=0
grep -Eq '\bgit\b[^|;&]*\b(commit|push)\b' <<<"$command" && publishes=1
grep -Eq '\bdotfiles\b[[:space:]]+sync\b' <<<"$command" && publishes=1
[ "$publishes" -eq 1 ] || exit 0

# Commands that sweep the whole tree need the wider scan.
wide=0
grep -Eq '\bdotfiles[[:space:]]+sync\b' <<<"$command" && wide=1
grep -Eq '\bgit\b[^|;&]*\bcommit\b[^|;&]*(-[a-zA-Z]*a|--all)' <<<"$command" && wide=1
grep -Eq '\bgit\b[^|;&]*\badd\b[^|;&]*([[:space:]]\.|-A|--all)' <<<"$command" && wide=1

scan_file="$(mktemp)"
trap 'rm -f "$scan_file"' EXIT

{
	git diff --cached -U0 2>/dev/null || true

	if [ "$wide" -eq 1 ]; then
		git diff -U0 2>/dev/null || true
		# -I skips binaries, so icons and lockfiles don't drown the scan.
		git ls-files --others --exclude-standard -z 2>/dev/null \
			| xargs -0 -r grep -IHn '' 2>/dev/null || true
	fi

	if grep -Eq '\bgit\b[^|;&]*\bpush\b' <<<"$command"; then
		upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
		if [ -n "$upstream" ]; then
			git diff -U0 "$upstream"...HEAD 2>/dev/null || true
		else
			# No upstream yet: the whole branch is about to be published.
			git log -p -U0 --max-count=100 2>/dev/null || true
		fi
	fi
} | head -c 8000000 >"$scan_file"

# Shapes that are credentials by construction, not by naming convention.
patterns='AIza[0-9A-Za-z_-]{35}'
patterns+='|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,}|ghr_[A-Za-z0-9]{36,}'
patterns+='|figd_[A-Za-z0-9_-]{30,}'
patterns+='|xox[abprs]-[A-Za-z0-9-]{10,}'
patterns+='|(AKIA|ASIA|AROA|AIDA)[A-Z0-9]{16}'
patterns+='|sk-ant-[A-Za-z0-9_-]{20,}|sk-or-v1-[a-f0-9]{48}|sk-proj-[A-Za-z0-9_-]{32,}'
patterns+='|[sr]k_(live|test)_[A-Za-z0-9]{20,}'
patterns+='|npm_[A-Za-z0-9]{36}'
patterns+='|-----BEGIN [A-Z ]*PRIVATE KEY'
patterns+='|(mongodb(\+srv)?|postgres(ql)?|mysql|redis|amqp)://[A-Za-z0-9._%+-]+:[A-Za-z0-9._%+*!~()-]{3,}@'
patterns+='|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'

# Docs, fixtures and env-var indirection routinely look like the real thing.
benign='example|placeholder|your[_-]?|redacted|dummy|sample|changeme|xxxx'
benign+='|user:pass@|:password@|localhost|127\.0\.0\.1'
benign+='|\$\{|\$\(|process\.env|os\.environ|getenv|import\.meta\.env'

hits="$(grep -aEn "$patterns" "$scan_file" 2>/dev/null | grep -aivE "$benign" | head -8 || true)"
[ -z "$hits" ] && exit 0

# Truncate long tokens and strip connection-string passwords before reporting.
report="$(printf '%s\n' "$hits" \
	| sed -E 's#://([A-Za-z0-9._%+-]+):[^@]+@#://\1:***@#g' \
	| sed -E 's/([A-Za-z0-9_-]{6})[A-Za-z0-9_-]{12,}/\1…/g' \
	| cut -c1-150)"

reason=$(cat <<HINT
Blocked: this looks like it would commit or push a credential.

$report

Those lines match known key formats (Google, GitHub, Figma, Slack, AWS,
Anthropic, OpenAI, Stripe, npm, private keys, DB connection strings, JWTs).

If it's real: pull the value into an ignored .env or a secrets manager, then
retry. If it's a fixture or docs example, rename it so it reads as one
(example/placeholder/your-key), or commit that file on your own outside Claude.
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
