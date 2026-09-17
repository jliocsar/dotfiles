# elementary OS setup

Provisions a fresh elementary OS box with [mise](https://mise.jdx.dev).

Migrated from a set of `justfile`s — versioned tools moved to mise's `[tools]`
table (mise owns install/PATH/upgrade), and the imperative remainder (apt, `.deb`
apps, system services, gsettings, shell) lives as file tasks under `mise-tasks/`.

## Run

From a fresh machine, the top-level [`setup.sh`](../setup.sh) bootstraps `gh` +
`mise`, clones this repo, then runs the equivalent of:

```sh
cd elementaryos
mise trust
mise run setup    # installs [tools] (first step) then runs every task
```

`setup` runs the `tools` task first (`mise install`), so tools are provisioned
as part of the flow — no separate step. Re-running is safe: `mise install`
skips already-installed tools and the tasks keep their idempotency guards.

`setup.sh` symlinks this config as mise's **global** config
(`~/.config/mise/config.toml` → this `mise.toml`), so the `[tools]` are on PATH
in every shell — not only inside this directory. One source of truth, version
controlled here.

The `setup` shell wrapper dispatches a single argument to either a task or a
tool: `setup dev:docker` runs the task, `setup bun` installs the tool.

## Layout

- `mise.toml` — `[tools]` (declarative installs) + the `setup` orchestrator and
  per-group runner tasks (`base`, `system`, `web`, `dev`, `term`).
- `mise-tasks/<group>/<task>` — one executable bash file per imperative step.
  The path maps to the task name: `mise-tasks/dev/docker` → `dev:docker`.

## Common commands

```sh
mise tasks ls            # list every task
mise run setup           # full setup (sequential; avoids apt-lock races)
mise run dev             # just the dev-apps group
mise run dev:docker      # a single task
mise run system:pantheon # standalone, not part of `setup`

mise install             # install all [tools]
mise install bun         # install ONE tool (note: `mise install`, not `mise run`)
mise install rust@1.80   # install a specific version
mise upgrade             # bump all [tools] to latest
```

## Tools vs tasks

A tool belongs in `[tools]` when mise can resolve and install it (registry, or a
`github:`/`npm:`/`cargo:`/`aqua:` backend). It stays a task when it's a `.deb`
GUI app, a system service, or a vendor `install.sh` with no listable versions
(e.g. `amp`, `docker`, `brave`, `obsidian`, `ghostty`).

Tools are **declarative** — `mise run bun` does not exist. Install one with
`mise install bun` (or `setup bun`); run a task with `mise run <task>`.
