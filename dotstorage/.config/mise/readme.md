# mise

mise's global config dir. `~/.config/mise` is a symlink to this folder, so
everything here works from any directory: no `cd`, no `-C`.

- `config.toml`: `[tools]` (declarative installs, auto-updated daily via
  `tool_update.global_auto`) and `[settings]`.
- `tasks/<group>/<task>`: one executable bash file per imperative step
  (apt, `.deb` apps, system services, gsettings, shell). The path maps to the
  task name: `tasks/dev/docker` → `dev:docker`.

On a fresh box, the top-level [`setup.sh`](../../../setup.sh) bootstraps `gh` +
`mise`, clones the repo, links this folder, then runs `mise run setup`.

## Common commands

```sh
mise tasks ls            # list every task
mise run setup           # full setup (sequential; avoids apt-lock races)
mise run dev:docker      # a single task
mise run system:pantheon # standalone, not part of `setup`

mise install             # install all [tools]
mise install bun         # install ONE tool (`mise install`, not `mise run`)
mise upgrade             # bump all [tools] now instead of waiting for auto-update
```

## Tools vs tasks

A tool belongs in `[tools]` when mise can resolve and install it (registry, or a
`github:`/`npm:`/`cargo:`/`aqua:` backend). It stays a task when it's a `.deb`
GUI app, a system service, or a vendor `install.sh` with no listable versions
(e.g. `amp`, `docker`, `brave`, `obsidian`, `ghostty`).
