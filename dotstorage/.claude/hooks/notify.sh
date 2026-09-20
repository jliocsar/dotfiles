#!/usr/bin/env bash
# Notification hook: notify-send the session title + message; on click, raise
# the existing Ghostty window (Wayland → Gala DesktopIntegration.FocusWindow)
# and jump to the session's tmux pane.
# Maps claude session_id → {sessionTitle, tmuxPaneId} via claude-session-metadata.
set -euo pipefail

# Self-heal: elementary renders the notification icon from a desktop-entry, and
# ~/.local isn't symlinked from dotstorage — so on a fresh machine install the
# hicolor icon + claude.desktop from the versioned source. No-op once present.
desktop="$HOME/.local/share/applications/claude.desktop"
if [ ! -f "$desktop" ] || ! find "$HOME/.local/share/icons/hicolor" -name claude.png -print -quit 2>/dev/null | grep -q .; then
	xdg-icon-resource install --novendor --mode user --size 256 "$HOME/.claude/hooks/claude.png" claude 2>/dev/null || true
	mkdir -p "$(dirname "$desktop")"
	cat >"$desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Claude
Icon=claude
NoDisplay=true
Exec=$HOME/.local/bin/claude
EOF
fi

input="$(cat)"
session_id="$(jq -r '.session_id // empty' <<<"$input")"
message="$(jq -r '.message // "Claude needs your attention"' <<<"$input")"

record="$(claude-session-metadata get "$session_id" 2>/dev/null || true)"
title="$(jq -r '.sessionTitle // empty' <<<"$record")"
pane="$(jq -r '.tmuxPaneId // empty' <<<"$record")"
# Fall back to the tmux pane title (then window name) when the session is untitled.
if [ -z "$title" ] && [ -n "$pane" ]; then
	title="$(tmux display-message -p -t "$pane" '#{pane_title}' 2>/dev/null || true)"
	[ -n "$title" ] || title="$(tmux display-message -p -t "$pane" '#{window_name}' 2>/dev/null || true)"
fi
[ -n "$title" ] || title="Claude"

# Fire-and-forget: no --action, so notify-send returns immediately instead of
# blocking until the notification is clicked/dismissed. --expire-time=10000
# fades it after 10s. (Dropped click-to-focus: --action left ~300 blocked
# notify-send + bash waiters piling up, eating ~1.8GB RAM.)
# elementary's daemon ignores --icon paths; it renders the icon of the app
# named by the desktop-entry hint (claude.desktop → Icon=claude in hicolor).
notify-send --app-name=Claude --urgency=normal \
	--expire-time=10000 \
	--icon=claude \
	--hint=string:desktop-entry:claude \
	"$title" "$message" >/dev/null 2>&1 || true

exit 0
