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

# lumen
export LUMEN_AI_PROVIDER="anthropic"
export LUMEN_AI_MODEL="claude-haiku-4-5"

# secrets
. "$HOME/.zsh_secrets"

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

# executor
export EXECUTOR_URL="https://executor-selfhost-loving-puma.fly.dev/mcp"

# Supabase CLI
export PATH="/home/jliocsar/.supabase/bin:$PATH"
