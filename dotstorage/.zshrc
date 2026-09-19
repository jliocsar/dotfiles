export ZSH="$HOME/.oh-my-zsh"
export EDITOR="nvim"

if [[ -z "$(herdr session list --json | jq '.sessions[0].name')" ]]; then
  exec herdr
elif [[ -z "$HERDR_ENV" ]]; then
  echo "herdr is already running"
fi

# mise — manages tool installs + PATH (node, bun, rust, gcloud, flyctl, neovim, ...).
# Full path because ~/.local/bin isn't on PATH yet at this point in the file.
eval "$($HOME/.local/bin/mise activate zsh)"

# Theme
ZSH_THEME="lambda"

# Plugins
plugins=(git fzf)

# Zinit section
if [ -d $HOME/.local/share/zinit ]; then
  ZINIT_HOME="${XDG_DATA_HOME:-${HOME}/.local/share}/zinit/zinit.git"
  [ ! -d $ZINIT_HOME ] && mkdir -p "$(dirname $ZINIT_HOME)"
  [ ! -d $ZINIT_HOME/.git ] && git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME"
  source "${ZINIT_HOME}/zinit.zsh"
else
  bash -c "$(curl --fail --show-error --silent --location https://raw.githubusercontent.com/zdharma-continuum/zinit/HEAD/scripts/install.sh)"
fi

# cargo (mise-managed rust may not write this; guard it)
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"

# zoxide
eval "$(zoxide init zsh)"

# bun completions
[ -s "/home/jliocsar/.bun/_bun" ] && source "/home/jliocsar/.bun/_bun"

# Extra sources
source $ZSH/oh-my-zsh.sh
source $HOME/.dotfiles/zsh/dotfiles.zsh

# secrets
# .zsh_secrets only holds urls + the infisical project id. the actual secrets are
# pulled from infisical into a tmpfs cache (gone on reboot) and re-fetched hourly.
. "$HOME/.zsh_secrets"
if [[ -n "$INFISICAL_PERSONAL_PROJECT_ID" ]]; then
  infisical_cache="${XDG_RUNTIME_DIR:-/tmp}/infisical-personal.env"
  if [[ -z "$(find "$infisical_cache" -mmin -60 2>/dev/null)" ]]; then
    infisical export --projectId="$INFISICAL_PERSONAL_PROJECT_ID" --env=prod --format=dotenv-export --silent > "$infisical_cache.tmp" 2>/dev/null \
      && mv "$infisical_cache.tmp" "$infisical_cache" \
      || rm -f "$infisical_cache.tmp"
  fi
  [[ -f "$infisical_cache" ]] && . "$infisical_cache"
  unset infisical_cache
fi

# fzf
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh

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

# Added by codebase-memory-mcp install
export PATH="/home/jliocsar/.local/bin:$PATH"


# Supabase CLI
export PATH="/home/jliocsar/.supabase/bin:$PATH"
