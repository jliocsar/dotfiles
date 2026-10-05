if command -v herdr >/dev/null 2>&1; then
  if [[ -z "$(herdr session list --json 2>/dev/null | jq -r '.sessions[0].name // empty')" ]]; then
    exec herdr
  elif [[ -z "$HERDR_ENV" ]]; then
    echo "herdr is already running"
  fi
fi

# dotfiles
source $HOME/.dotfiles/zsh/dotfiles.zsh

# secrets
# .zsh_secrets only holds urls + the infisical project id. the actual secrets are
# pulled from infisical into a tmpfs cache (gone on reboot) and re-fetched hourly.
. "$HOME/.zsh_secrets"
if [[ -n "$INFISICAL_PERSONAL_PROJECT_ID" ]]; then
  infisical_cache="${XDG_RUNTIME_DIR:-/tmp}/infisical-personal.env"
  if [[ -z "$(find "$infisical_cache" -mmin -60 2>/dev/null)" ]]; then
    # stdin from /dev/null: an expired session makes infisical start an interactive
    # login that waits on the tty forever, invisible because output is redirected.
    timeout 10 infisical export --projectId="$INFISICAL_PERSONAL_PROJECT_ID" --env=prod --format=dotenv-export --silent < /dev/null > "$infisical_cache.tmp" 2>/dev/null \
      && mv "$infisical_cache.tmp" "$infisical_cache" \
      || { rm -f "$infisical_cache.tmp"; echo "infisical: fetch failed (run \`infisical login\`), using stale cache" >&2; }
  fi
  [[ -f "$infisical_cache" ]] && . "$infisical_cache"
  unset infisical_cache
fi

# go
export PATH="$PATH:/usr/local/go/bin"

# Amp CLI
export PATH="/home/jliocsar/.amp/bin:$PATH"

# The next line updates PATH for the Google Cloud SDK.
if [ -f '/home/jliocsar/.local/opt/google-cloud-sdk/path.zsh.inc' ]; then . '/home/jliocsar/.local/opt/google-cloud-sdk/path.zsh.inc'; fi

# The next line enables shell command completion for gcloud.
if [ -f '/home/jliocsar/.local/opt/google-cloud-sdk/completion.zsh.inc' ]; then . '/home/jliocsar/.local/opt/google-cloud-sdk/completion.zsh.inc'; fi

if command -v wt >/dev/null 2>&1; then eval "$(command wt config shell init zsh)"; fi

# Work
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/tools

# Supabase CLI
export PATH="/home/jliocsar/.supabase/bin:$PATH"
