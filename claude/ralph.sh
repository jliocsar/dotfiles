#!/usr/bin/env zsh
limit=5
ralph_md="tmp/RALPH.md"
loop=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    -l|--loops)
      limit="$2"
      shift 2
      ;;
    -p|--prompt)
      ralph_md="$2"
      shift 2
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done

if [[ ! -f "$ralph_md" ]]; then
  echo "Missing $ralph_md!"
  exit 1
fi

RALPH_STATE_FILE=/tmp/ralph-state
trap 'rm -f "$RALPH_STATE_FILE"' EXIT INT TERM

# Detect print mode: -p in forwarded args or OPENCODE=1
use_opencode="${OPENCODE:-0}"
extra_args=()
use_print=0
for arg in "$@"; do
  if [[ "$arg" == "-p" ]]; then
    use_print=1
  else
    extra_args+=("$arg")
  fi
done

while [[ $loop -le $limit ]]
do
  export RALPH_LOOP_CURRENT=$loop
  export RALPH_LOOP_MAX=$limit
  echo "$loop/$limit" > "$RALPH_STATE_FILE"
  echo "Ralph loop: $loop/$limit | Starting..."
  if [[ "$use_opencode" == "1" ]]; then
    opencode run "$(cat $ralph_md)" "${extra_args[@]}"
  elif [[ $use_print -eq 1 ]]; then
    claude \
      --dangerously-skip-permissions \
      -p "$(cat $ralph_md)" \
      "${extra_args[@]}"
  else
    claude \
      --append-system-prompt "Once done with your main task, output the text: <promise>COMPLETE</promise>." \
      --dangerously-skip-permissions \
      "$(cat $ralph_md)" \
      "${extra_args[@]}"
  fi
  echo "Ralph loop: $loop/$limit | Done."
  sleep 1
  (( loop++ ))
done
