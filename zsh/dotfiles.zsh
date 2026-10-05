# Sourced from ~/.zshrc after oh-my-zsh. Everything custom lives here.

## zinit plugins
zinit ice depth=1
zinit light jeffreytse/zsh-vi-mode
zinit light zdharma-continuum/fast-syntax-highlighting
zinit light zsh-users/zsh-autosuggestions
zinit light zsh-users/zsh-completions

## aliases
## ...
alias breathe="go clean -cache && pnpm store prune && uv cache clean && docker builder prune -af && sudo apt clean"

## git
alias gsl='git switch -'

## neovim
alias nvim:cfg="nvim ~/.config/nvim"

## apt
alias update='sudo apt update -y && sudo apt upgrade -y && sudo apt autoremove -y && sudo apt autoclean -y'

# dotfiles
alias __assert_dotfiles="if [[ ! -d $HOME/.dotfiles ]]; then echo '~/.dotfiles not found'; return 1; fi"
alias dotfiles="__assert_dotfiles && $HOME/.dotfiles/dotfiles.pl"

## functions
ginit() {
    local repo=${1:=$(basename "$PWD")}

    g init
    ga .
    gb -M main
    gcmsg 'source files'
    gh repo create jliocsar/$1 --private --source=. --push
}

bak() {
    cp $1 $1.bak
}

setup() {
  __assert_dotfiles
  $HOME/.dotfiles/setup.sh $@
}

## claude
alias _claude="claude"

dotfiles_custom_claude() {
  local system_prompt="$(cat $HOME/.dotfiles/claude/SYSTEM_PROMPT.md)"

  # CLAUDE_CONFIG_DIR is only set by the claude@<profile> wrappers below.
  if [[ -n $CLAUDE_CONFIG_DIR ]]; then
    system_prompt+=$'\n'"$(cat $HOME/.dotfiles/claude/WORK_SYSTEM_PROMPT.md)"
  fi

  local disallowed_tools=("Artifact" "NotebookEdit" "ScheduleWakeup" "PushNotification" "AskUserQuestion" "WebFetch" "RemoteTrigger" "DesignSync" "EnterPlanMode" "ExitPlanMode" "ReportFindings" "SendFeedback")

  _claude \
    --enable-auto-mode \
    --allow-dangerously-skip-permissions \
    --permission-mode auto \
    --model opus \
    --effort high \
    --plugin-dir "$HOME/Projects/claude-codemode" \
    --disallowed-tools ${disallowed_tools[@]} \
    --system-prompt "$system_prompt" \
    "$@"
}

alias claude="dotfiles_custom_claude"
alias claude:ralph="$HOME/.dotfiles/claude/ralph.sh"

typeset -A CLAUDE_PROFILES=(
  work "$HOME/.claude-work"
)

for _claude_profile in ${(k)CLAUDE_PROFILES}; do
  _claude_dir=${CLAUDE_PROFILES[$_claude_profile]}

  eval "claude@${_claude_profile}() { CLAUDE_CONFIG_DIR=$_claude_dir dotfiles_custom_claude \"\$@\"; }"

  for _claude_variant in ${(k)functions[(I)claude:*]}; do
    eval "claude@${_claude_profile}:${_claude_variant#claude:}() { CLAUDE_CONFIG_DIR=$_claude_dir ${_claude_variant} \"\$@\"; }"
  done
done

unset _claude_profile _claude_dir _claude_variant

alias claude:usage="claude -p '/usage'"

alias c="claude"
alias cw="claude@work"
alias cm="cd ~/.dotfiles && claude && cd -"

## misc
alias n="nvim"
alias .f="dotfiles"
