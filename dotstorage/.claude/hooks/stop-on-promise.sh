#!/usr/bin/env bash
# Kills the Claude session when the output contains <promise>COMPLETE</promise>

payload=$(cat)

if echo "$payload" | jq -r '.last_assistant_message // ""' | grep -q '<promise>COMPLETE</promise>'; then
  sleep 2
  kill -TERM $(ps -o ppid= -p $PPID | tr -d ' ')
fi

exit 0
