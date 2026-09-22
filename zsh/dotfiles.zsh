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

notes() {
  current_tmux_window_title=$(tmux display-message -p '#W')

  if [ "$current_tmux_window_title" != "notes" ]; then
    tmux rename-window notes
  fi

  nvim $HOME/.timov/

  if [ $? -eq 0 ]; then
      tmux rename-window "$current_tmux_window_title"
  fi
}

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

# Ask for a value in a tmux popup (plain readline when outside tmux). The
# default is prefilled and editable in place; Ctrl-U clears it. Prints the
# answer on stdout.
dotfiles_prompt() {
  local title=$1 default=$2
  local answer_file=$(mktemp)
  local reader='read -e -i "$1" -p "> " answer; printf %s "$answer" > "$2"'

  if [[ -n $TMUX ]]; then
    tmux display-popup -E -w 60 -h 3 -T " $title " \
      "bash -c ${(q)reader} _ ${(q)default} ${(q)answer_file}"
  else
    bash -c "$reader" _ "$default" "$answer_file"
  fi

  local answer=$(<$answer_file)
  rm -f $answer_file
  print -r -- "${answer:-$default}"
}

## claude
alias _claude="claude"

dotfiles_custom_claude() {
  local system_prompt="$(cat $HOME/.dotfiles/claude/SYSTEM_PROMPT.md)"

  # CLAUDE_CONFIG_DIR is only set by the claude@<profile> wrappers below.
  if [[ -n $CLAUDE_CONFIG_DIR ]]; then
    system_prompt+=$'\n'"$(cat $HOME/.dotfiles/claude/WORK_SYSTEM_PROMPT.md)"
  fi

  local disallowed_tools=("Artifact" "NotebookEdit" "ScheduleWakeup" "PushNotification" "AskUserQuestion" "CronCreate" "CronList" "CronDelete" "WebFetch" "RemoteTrigger" "DesignSync" "EnterPlanMode")

  _claude \
    --enable-auto-mode \
    --allow-dangerously-skip-permissions \
    --permission-mode auto \
    --model opus \
    --effort high \
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

## conan — pi harness
conan() {
  local lock_file="/tmp/conan-the-librarian.lock"
  if [[ -f $lock_file ]]; then
    tmux select-window -t "conan"
    return 0
  fi

  local previous_window_title=$(tmux display-message -p '#W')
  tmux rename-window "conan"
  echo "1" > $lock_file

  cd "$HOME/Projects/conan/knowledge-base"
  PI_CODING_AGENT_DIR="$HOME/Projects/conan/pi" pi --system-prompt "$(cat "$HOME/Projects/conan/pi/SYSTEM.md")" "$@"

  tmux rename-window "$previous_window_title"
  rm -f $lock_file
  cd -
}

conan:query() {  # one-shot headless
  cd "$HOME/Projects/conan/knowledge-base"
  PI_CODING_AGENT_DIR="$HOME/Projects/conan/pi" pi -p --system-prompt "$(cat "$HOME/Projects/conan/pi/SYSTEM.md")" "$@"
  cd -
}

conan:compact() { conan "/compact"; }

## misc
alias n="nvim ."
alias .f="dotfiles"
