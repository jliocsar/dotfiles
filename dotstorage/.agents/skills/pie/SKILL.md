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
  `~/workspace`, and Claude's agents, settings, skills and MCPs are written. Re-running it is how a
  pod picks up new config.
- Secrets never live on a pod. exe.dev integrations add them at the network edge. The config repo's
  integration attaches to the `pie` tag, and a recipe's own integrations attach to its
  `pie-recipe-<name>` tag.
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

## From the laptop

The laptop isn't a pod. It edits the config repo and validates it:

1. Edit the config as plain git.
2. After adding or renaming a config file, run `pie sync`, so the editor schemas know the new name.
3. Run `pie check`. The config repo's pre-push hook and CI run it too.
4. Push, then re-apply on each pod that should get the change: `ssh <vm>.exe.xyz pie pod up`.

## Bootstrapping a new pod

1. Create the VM with both tags:

   ```sh
   ssh exe.dev new --name <vm> --tag pie,pie-recipe-<recipe>
   ```

2. Install pie on it and apply the recipe:

   ```sh
   ssh <vm>.exe.xyz 'curl -fsSL https://github.com/jliocsar/pie/releases/latest/download/setup.sh | sh -s -- jliocsar/agents-machines'
   ```

   The same line upgrades pie on an existing pod.

3. Ask the user to log into `claude` on the box. It's interactive, and it's the one credential that
   lives on a pod.
4. If the user drives pods from herdr: `herdr machine add <vm>.exe.xyz`.

Integrations a recipe needs go on `pie-recipe-<recipe>` before step 2:

- a GitHub integration reaching the repos it clones. Without one, step 2 fails and names the repo.
- an HTTP proxy integration for each MCP that needs a secret. pie can't tell when one is missing,
  so the MCP just fails inside Claude.

The config repo's GitHub integration on `pie` is made once, and every pod shares it.
