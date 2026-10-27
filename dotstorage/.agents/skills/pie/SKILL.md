---
name: pie
description: How pie works from the laptop, and how to bootstrap new exe.dev machines that run it. Use when the user mentions pie, pods, recipes, the config repo, or setting up a new machine for agents.
---

# pie

pie is a recipe manager for exe.dev VMs. A recipe says what a pod gets: pinned tools, tasks,
repositories, dotfiles, Claude agents and settings, skills and MCPs. Recipes are TOML in a config repo, which
is `jliocsar/agents-machines` unless the user says otherwise. There's no server: each pod pulls its
own config.

Run `pie --help`, and `pie <command> --help`, for the commands and their arguments. Don't guess
them.

Machines live on exe.dev unless the user says otherwise. Load the `using-exe-dev` skill before
running any `ssh exe.dev` command. It covers exe.dev's CLI, its docs, and SSH from a non-interactive
shell.

## How it works

- Two exe.dev tags make a VM a pod: `pie`, plus `pie-recipe-<name>` for `recipes/<name>.toml` in the
  config repo.
- `pie pod up` runs on the pod. It reads the VM's tags through exe.dev's reflection integration,
  fetches the config repo through exe.dev's GitHub integration, and applies the recipe: mise
  installs the tools, the home sets land in `~`, mise runs the tasks, missing repos are cloned into
  `~/workspace`, Claude's agents, settings, skills and MCPs are written, and a `## pie` block in
  `~/.claude/CLAUDE.md` tells Claude it's on a pod, followed by the recipe's own `claude_md` text.
  Re-running it is how a pod picks up new config.
- Secrets never live on a pod. exe.dev integrations add them at the network edge. The config repo's
  integration attaches to the `pie` tag, and a recipe's own integrations attach to its
  `pie-recipe-<name>` tag. An integration several recipes share attaches to a tag of its own, listed
  in each recipe's `tags` (`tags = ["work-gh"]`). `pod up` fails on a VM missing one of them and
  prints the `ssh exe.dev tag <vm> <tag> …` line that adds them.
- pie never creates VMs, tags or integrations. Integrations are made by hand in exe.dev, and that's
  the user's job: tell them exactly which one to make and which tag it attaches to.
- pie's errors name what's missing, such as the integration a clone needs and its tag. Read them
  before debugging anything else.

## Dotfiles

`home/<name>/` in the config repo mirrors `~`: `home/shell/.config/starship.toml` lands on
`~/.config/starship.toml`. A recipe's `home` list picks the sets:

```toml
home = ["shell", { name = "zsh", mode = "append" }]
```

- A bare name copies. pie owns the whole file, and fails if one it didn't write is already there.
- `mode = "append"` keeps the file and replaces only pie's `# >>> pie: home/<name> >>>` block. Use it
  for files a fresh VM already has, and always for `.zshrc` and `.profile`.
- Dropping a file or a set removes it on the next `pod up`.
- Paths pie writes itself (`.claude/`, `.config/mise/`, `workspace/`...) can't go in a set. Claude
  config goes through the recipe.

Run `pie sync` after adding a set, then `pie check`, which names any rule a set breaks.

## CLAUDE.md

A recipe adds its own instructions to `~/.claude/CLAUDE.md` from `claude/claude_md/<name>.md`:

```toml
[claude]
claude_md = ["work", "gcp"]
```

They land inside pie's block, after its fixed `## pie` text, in the order listed. Dropping a name
removes its text on the next `pod up`, and anything outside the block stays. Run `pie sync` after
adding a file; `pie check` names any listed file that doesn't exist.

## Repositories

A recipe's `repositories` clone into `~/workspace` over https, only when the directory is missing:

```toml
repositories = [
  "jliocsar/pie",
  { repo = "jliocsar/nidus", dir = "nidus" },
  { repo = "some-org/some-repo", integration = "some-org-git" },
]
```

Without `integration`, a repo clones through exe.dev's GitHub App integration. For an org that won't
install the App, name an `http-proxy` integration instead, and pie clones from
`https://<integration>.int.exe.xyz/<repo>.git`. The user makes it, attached to the recipe's tag:

```sh
ssh exe.dev "integrations add http-proxy --name some-org-git \
  --target https://github.com \
  --header 'Authorization:Basic <base64 of x-access-token:PAT>' \
  --attach tag:pie-recipe-<recipe>"
```

The PAT is a fine-grained token with Contents: read on the repo. A 403 or 404 through a proxy that
answers otherwise means the token can't see the repo: it's still pending the org's approval, or it
doesn't cover that repo.

## From the laptop

The laptop isn't a pod. It edits the config repo and validates it:

1. Edit the config as plain git.
2. After adding or renaming a config file, run `pie sync`, so the editor schemas know the new name.
3. Run `pie check`. The config repo's pre-push hook and CI run it too.
4. Push, then re-apply on each pod that should get the change: `ssh <vm>.exe.xyz pie pod up`.

## Bootstrapping a new pod

1. Create the VM with both tags, plus each one in `recipes/<recipe>.toml`'s `tags`:

   ```sh
   ssh exe.dev new --name <vm> --tag pie,pie-recipe-<recipe>,<tag>,…
   ```

2. Install pie on it and apply the recipe:

   ```sh
   ssh <vm>.exe.xyz 'curl -fsSL https://github.com/jliocsar/pie/releases/latest/download/setup.sh | sh -s -- jliocsar/agents-machines'
   ```

   pie installs through mise, which updates it on its own. A pod installed before v0.14.0 has a
   plain binary instead, and re-running the line once moves it to mise.

3. Ask the user to log into `claude` on the box. It's interactive, and it's the one credential that
   lives on a pod.
4. If the user drives pods from herdr: `herdr machine add <vm>.exe.xyz`.

Integrations a recipe needs go on `pie-recipe-<recipe>`, or on one of its `tags` when recipes share
them, before step 2:

- a GitHub integration reaching the repos it clones, or the `http-proxy` integration a repo names.
  Without one, step 2 fails and names the repo and integration.
- an HTTP proxy integration for each MCP that needs a secret. pie can't tell when one is missing,
  so the MCP just fails inside Claude.

The config repo's GitHub integration on `pie` is made once, and every pod shares it.
