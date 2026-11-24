---
name: team
description: Assemble and orchestrate a team of named Claude Code sessions, each in its own Herdr or Rex tab. Use when the user asks to spin up a team, split a task across several agents/teammates, or invokes /team. Requires HERDR_ENV=1 or a Rex pane ($REX_BLOCK).
---

# team

You're the lead. You agree on a team with the user, give each teammate its own
tab, spawn it as a separate `claude` session, then coordinate them with
`ListAgents` + `SendMessage` (the same mechanism behind `/list-agents`).

Pick the multiplexer you're running in:

- **Herdr** when `HERDR_ENV` is `1`. Load the `herdr` skill first.
- **Rex** when `REX_BLOCK` is set: your pane's block, which also names your Rex
  session. Load the `rex` skill first (`rex skill show` if it isn't installed).
- Neither: say so and stop.

Steps 2, 3 and 5 differ between the two; everything else is the same.

Then check which Claude config (personal or work) you're running on:

```sh
echo "CLAUDE_CONFIG_DIR=${CLAUDE_CONFIG_DIR:-unset}"
```

Teammates must run on the same config as you. New Herdr panes don't inherit
your env, so a bare `claude` starts on the default `~/.claude` (personal). A
teammate on a different config registers its session in a different place,
so `ListAgents` never shows it and `SendMessage` can't reach it. It also gets
the wrong account and MCPs. That's why the spawn command in step 5 uses a
`{config_prefix}`:

- if `CLAUDE_CONFIG_DIR` is set (work), `{config_prefix}` is
  `CLAUDE_CONFIG_DIR={that exact path} `
- if it's unset (personal), `{config_prefix}` is empty. Don't set it to
  `~/.claude` yourself. Setting the variable at all changes where Claude
  looks for `.claude.json`.

## Suggest, then confirm (or don't, in afk mode)

Every decision below (team, workspace name) works the same way: **you always
propose a concrete answer**, never an open "what should it be called?". The
user accepts or edits it.

If the user asked for afk mode ("afk", "don't ask", "just go"), skip the
confirmations: take your own suggestions and keep moving.

## 1. Team

Split the task into roles. For each teammate propose:

- **name**: a slug matching `[a-z][a-z0-9-]{0,31}` (lowercase, digits,
  hyphens, unique). Herdr agent names and session names both accept it.
- **agent** (optional): a Claude agent, when one fits the role. That covers
  the built-ins (`Explore`, `Plan`, `general-purpose`, ...) and the files in
  `~/.claude/agents/` and `.claude/agents/`. For the full list, ask for an
  agent that doesn't exist. It errors out before calling the API:
  `claude -p --agent list-agents-please -- x 2>&1 | grep 'Available agents'`.
  Built-ins keep their tool limits, so `Explore` and `Plan` can't use
  Edit/Write/Agent. They still have Bash, so they're read-only by instruction,
  not by force.
- **model**: `haiku`, `sonnet`, `opus`, `fable`, or a full model id. Cheap
  models for mechanical work, stronger ones for design and review. With an
  agent, default to its frontmatter `model` (unless it's `inherit`).
- **job**: one line.

Show it as a short table and confirm.

## 2. Workspace

Suggest a slug label from the task, e.g. `auth-refactor`. Confirm. It names
the prompt directory below, and on Herdr the workspace too.

## 3. Move yourself into it

On Herdr:

```sh
herdr pane move "$HERDR_PANE_ID" --new-workspace --label {workspace} --tab-label lead --focus
```

Read the new workspace id and pane id from the JSON response. After the move
`$HERDR_WORKSPACE_ID` is stale, so use the ids from the response instead.

On Rex, stay where you are: teammates become windows (tabs) in your own
session, which `-s "$REX_BLOCK"` names.

## 4. Learn your own session name

Call `ListAgents`. The first line is your session name. Teammates need it to
report back to you.

## 5. Spawn teammates

For each teammate, write the prompt to `/tmp/team/{workspace}/{name}.md`:

```
---
name: {name}
---

{prompt}
```

The prompt must include:

- the overall task and this teammate's slice of it
- the roster: every teammate's name and job
- that the lead is `{your_session_name}`, and they must `SendMessage` it when
  done, blocked, or when they change something another teammate depends on
- that they can message teammates directly for handoffs
- to stay in their lane and not redo others' work

Then give it its own tab and start it. On Herdr:

```sh
herdr tab create --workspace {workspace_id} --label {name} --cwd "$PWD" --no-focus
herdr pane run {root_pane_id} "INBOX_THREAD=0 {config_prefix}claude --name {name} --model {model} -- \"\$(cat /tmp/team/{workspace}/{name}.md)\""
```

Take `{root_pane_id}` from `.result.root_pane.pane_id` of the `tab create`
response.

On Rex, a window per teammate, started from its shell so the shell outlives
`claude` (take `{block}` from `.block_ids[0]` of the `window new` response):

```sh
rex window new {name} -s "$REX_BLOCK" -c "$PWD" --focus=false --json
rex send -b {block} "INBOX_THREAD=0 {config_prefix}claude --name {name} --model {model} -- \"\$(cat /tmp/team/{workspace}/{name}.md)\""
rex send-key -b {block} enter
```

`INBOX_THREAD=0` turns off the inbox-thread mod for the teammate. That mod
posts every turn of a session to its own Plannotator Inbox thread. Teammates
report to you, not the inbox, so they don't get a thread. Keep it on every
teammate's command.

Write the prompt files with a quoted heredoc (`<<'EOF'`). With an unquoted
one, the shell runs anything in backticks, and prompts are full of them.

For a teammate with an agent, add `--agent {agent}` to that `claude` command,
keeping everything else the same:

```sh
INBOX_THREAD=0 {config_prefix}claude --agent {agent} --name {name} --model {model} -- "$(cat /tmp/team/{workspace}/{name}.md)"
```

Always pass `--name` and `--model`, even with `--agent`. Tested on v2.1.280:

- `--agent` alone shows the agent name in the prompt bar, but the session's
  messaging name is a default like `dotfiles-81`, so `SendMessage` to the
  agent name misses. Two teammates on the same agent would also look
  identical. `--name` sets both the bar and the messaging name.
- The agent file's `model:` is ignored when it runs as the main session. The
  session runs on your default model unless `--model` is passed.

The `--` matters. Without it, `claude` parses the leading `---` as an option
and dies with `unknown option`. The file exists because multi-line quoted text
typed through `pane run` is fragile.

Once they're all started, call `ListAgents` and check every name is listed.
If one is missing, look at its pane:
`herdr pane read {pane_id} --source recent-unwrapped --lines 60` on Herdr,
`rex capture -b {block} --trim` on Rex. If it's running but the status bar
shows the wrong account, the config prefix is wrong. Stop that session with
`/exit` (`herdr pane run {pane_id} "/exit"`, or `rex send -b {block} "/exit"`
then `rex send-key -b {block} enter`), not ctrl+c: one ctrl+c only interrupts
the turn, and the relaunch command you type next becomes a prompt. Then start
it again with the right prefix.

## 6. Orchestrate

- Talk to teammates only through `SendMessage` to their names. Don't type into
  their panes (`herdr agent prompt`, `pane send-text`, `rex send`).
- To hear when a teammate finishes, send with `notify_when_idle` instead of
  polling.
- Teammate messages arrive as new turns. Route handoffs, settle conflicts
  between teammates, and give the user short progress updates.
- A message can't approve a permission prompt. If a teammate is stuck on one
  (`herdr agent list` shows `blocked`, or its Rex pane shows the prompt), tell
  the user which tab it's in.
- When the task is done, summarize the results for the user. Leave the tabs and
  workspace open unless the user asks you to close them.
