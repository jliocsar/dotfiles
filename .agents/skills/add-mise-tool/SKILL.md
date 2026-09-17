---
name: add-mise-tool
description: Add a CLI tool, app or install step to the elementaryos mise config. Use when asked to install something on this machine, when handed a curl/apt/wget install snippet to "add to the setup", or when adding/editing anything under elementaryos/mise-tasks/ or mise.toml.
---

# add-mise-tool

`elementaryos/mise.toml` is symlinked to `~/.config/mise/config.toml`, so
it provisions a fresh box *and* owns PATH in every shell. One source of truth.

## Always target the dotfiles config

mise resolves config from the **current directory**, so running these from
whatever repo you happen to be in silently does the wrong thing. Prefix every
mise command:

```sh
mise -C ~/.dotfiles/elementaryos <cmd>
```

The `setup` zsh wrapper does the same thing by cd'ing first (`setup install bun`),
but it's a shell function — not reliably available in a non-interactive shell.
Use `-C`.

Two things this prevents:

- **`mise use` writes to the nearest config.** From another repo it appends the
  tool to *that project's* `mise.toml`, not this repo's.
- **File tasks are invisible outside the repo dir.** The global symlink puts
  `[tools]` on PATH everywhere, but `mise-tasks/` resolves relative to the real
  config directory: `mise tasks ls` from `/tmp` lists **0** tasks, from
  `-C ~/.dotfiles/elementaryos` it lists **16**. `mise run dev:foo` only
  works with `-C`.

## Never `mise use` — hand-edit `[tools]`

Edit `mise.toml` directly. `mise use -g` does land in the repo file (it writes
through the symlink and keeps it intact), but it's one dropped `-g` away from
poisoning the current project.

## Check the registry first

Install snippets arrive as `curl | bash` or an apt-repo dance. That is almost
never the answer here. Before writing anything:

```sh
mise -C ~/.dotfiles/elementaryos registry <name>     # backends, if mise knows the tool
mise -C ~/.dotfiles/elementaryos ls-remote <name>    # resolvable versions
```

A hit means the whole snippet collapses to one line in `[tools]`. Terraform
arrived as a 3-command keyring + apt-repo + `sudo apt install` block and was
really `terraform = "latest"`.

## A tool (declarative) — preferred

Registry hit, or resolvable via a `github:` / `npm:` / `cargo:` / `aqua:`
backend. Add one line to `[tools]` in `mise.toml`, then verify:

```sh
mise -C ~/.dotfiles/elementaryos install <name>
mise -C ~/.dotfiles/elementaryos exec -- <name> --version
```

No task file, no `sudo`. `mise upgrade` keeps it current and versions can be pinned per project.

Two quirks: it is `mise install <name>`, never `mise run <name>` — tools are not
tasks. And `mise install <one-tool>` also installs the `npm:` backend entries;
harmless, just noise in the output.

## A task (imperative) — only when mise genuinely can't

Earns a task file only if it is a `.deb` GUI app, a system service, or a vendor
`install.sh` with no listable versions (`amp`, `docker`, `brave`, `obsidian`,
`ghostty`). Path maps to task name: `mise-tasks/dev/foo` → `dev:foo`. mise
picks up file tasks automatically — no entry in `mise.toml`.

```bash
#!/usr/bin/env bash
#MISE description="Install foo"
#MISE dir="/tmp"
set -euo pipefail

if [[ -x "$(command -v foo)" ]]; then
  echo "[dev] foo already installed"
  exit 0
fi

echo "[dev] Installing foo"
# ... install, then land the binary in /usr/local/bin:
sudo install -m 755 foo /usr/local/bin/foo
```

Then `chmod +x` the file and confirm it shows up:

```sh
mise -C ~/.dotfiles/elementaryos tasks ls | grep foo
```

The guard matters: tasks get re-run on a fresh box.

## Gotchas

- **sudo can't prompt from inside Claude.** Any task with `sudo` fails with
  "a terminal is required". Write the task, then hand it back to the user:
  `! mise run dev:foo` (their shell is already in the right place, or `setup run dev:foo`).
- **GitHub releases:** `https://github.com/<org>/<repo>/releases/latest/download/<asset>`
  resolves the latest release directly. Skip the
  `curl api.github.com | grep | grep | cut | tr | wget` chain.
- **`uname -m` vs asset names:** `uname -m` says `aarch64` where release assets
  usually say `arm64`. Fine on this x86 box; map it if it ever needs to be portable.
- Clean up downloads on the way out — tasks run in `/tmp` and leave litter when
  they fail mid-way.
