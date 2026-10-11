---
name: add-mise-tool
description: Add a CLI tool, app or install step to the global mise config. Use when asked to install something on this machine, when handed a curl/apt/wget install snippet to "add to the setup", or when adding/editing anything under dotstorage/.config/mise/ (config.toml or tasks/).
---

# add-mise-tool

`dotstorage/.config/mise/` is symlinked to `~/.config/mise`, so it's mise's
**global** config dir. It provisions a fresh box *and* owns PATH in every
shell. One source of truth.

- `config.toml`: `[tools]` and `[settings]`.
- `tasks/`: global file tasks. They're visible from every directory, so plain
  `mise run dev:foo` works anywhere. No `-C`, no wrapper.

## Never `mise use` — hand-edit `[tools]`

Edit `dotstorage/.config/mise/config.toml` directly. `mise use` without `-g`
writes to the nearest project's `mise.toml`, so one dropped flag poisons
whatever repo you're in.

## Check the registry first

Install snippets arrive as `curl | bash` or an apt-repo dance. That is almost
never the answer here. Before writing anything:

```sh
mise registry <name>     # backends, if mise knows the tool
mise ls-remote <name>    # resolvable versions
```

A hit means the whole snippet collapses to one line in `[tools]`. Terraform
arrived as a 3-command keyring + apt-repo + `sudo apt install` block and was
really `terraform = "latest"`.

## A tool (declarative) — preferred

Registry hit, or resolvable via a `github:` / `npm:` / `cargo:` / `aqua:`
backend. Add one line to `[tools]`, then verify:

```sh
mise install <name>
mise exec -- <name> --version
```

No task file, no `sudo`. Use `"latest"` (or a range like `"24"`), not an exact
version: `tool_update.global_auto` keeps every non-exact tool current, and
exact pins are never auto-updated.

Two quirks: it is `mise install <name>`, never `mise run <name>` — tools are not
tasks. And `mise install <one-tool>` also installs the `npm:` backend entries;
harmless, just noise in the output.

## A task (imperative) — only when mise genuinely can't

Earns a task file only if it is a `.deb` GUI app, a system service, or a vendor
`install.sh` with no listable versions (`amp`, `docker`, `brave`, `obsidian`,
`ghostty`). Path maps to task name: `tasks/dev/foo` → `dev:foo`. mise picks up
file tasks automatically — no entry in `config.toml`. Tasks are never
auto-updated.

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
mise tasks ls | grep foo
```

The guard matters: tasks get re-run on a fresh box.

## Gotchas

- **A project can shadow a global task.** A same-named task in the current
  repo wins over the global one. If `mise run dev:foo` does something odd, run
  it from `~`.
- **sudo can't prompt from inside Claude.** Any task with `sudo` fails with
  "a terminal is required". Write the task, then hand it back to the user:
  `! mise run dev:foo`.
- **GitHub releases:** `https://github.com/<org>/<repo>/releases/latest/download/<asset>`
  resolves the latest release directly. Skip the
  `curl api.github.com | grep | grep | cut | tr | wget` chain.
- **`uname -m` vs asset names:** `uname -m` says `aarch64` where release assets
  usually say `arm64`. Fine on this x86 box; map it if it ever needs to be portable.
- Clean up downloads on the way out — tasks run in `/tmp` and leave litter when
  they fail mid-way.
