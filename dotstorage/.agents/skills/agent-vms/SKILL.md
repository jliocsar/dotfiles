---
name: agent-vms
description: "How Julio's exe.dev Agent VMs work and how to change them from the laptop, covering the agents-machines NixOS flake, the alchemy stack, deploys from the Builder, Recipes, lock bumps and dotfiles. Use when the user mentions agent VMs, pods, the work or personal VM, jc-ci-builder, the Updater, agents-machines, or setting up a new machine for agents."
---

# Agent VMs

Julio's coding-agent machines are exe.dev VMs running NixOS, declared in
[jliocsar/agents-machines](https://github.com/jliocsar/agents-machines) (`~/Projects/agents-machines`, branch `main`).
The repo's `CONTEXT.md` is the glossary, and `docs/` plus `docs/adr/` explain the decisions. Read them before a
change that isn't routine.

pie and its TOML recipes are gone. `jliocsar/pie` is a public archive, and the old config lives at the
`pie-archive` tag. "Pod" now means Agent VM.

## The machines

| machine | VM | what it is |
|---|---|---|
| `agent-vm-work` | `jc-agent-vm-work` | the work Agent VM: hapana repos, Julio's work loops in Rex |
| `agent-vm-personal` | none yet | the personal Agent VM Recipe |
| `ci-builder` | `jc-ci-builder` | the Builder: self-hosted GitHub runners, the Cache, Deploys |
| `agent-vm-updater` | `jc-agent-vm-updater` | the Updater: daily lock-bump PRs |

A VM's machine is the one exe.dev tag that names a `nixosConfigurations` entry. Agent VMs also carry `agent-vm`,
and their Recipe tag `agent-vm-<recipe>` picks the integrations attached in `jliocsar/iac`.

## Where things live

```
flake.nix                     inputs (nixpkgs, home-manager, dotfiles, llm-agents, rex, ...)
alchemy.run.ts                the exe.dev stack: gathers every machines/*/vm.ts
machines/<name>/default.nix   the machine's NixOS + home-manager config
machines/<name>/vm.ts         its exe.dev VM (size, tags), when it has one
modules/                      shared modules: exe-dev.nix, agent-vm/, cache.nix, announce.nix
secrets/                      agenix secrets, readable only by the Builder
updater/                      the lock-bump bot and lock-check
```

Shared integrations (the tailnet, hapana proxies, the work dashboard, ...) are in `jliocsar/iac`, another alchemy
stack. Change those there, not here.

## Changing a VM

Every change is a PR to `main`. Merging it runs `.github/workflows/deploy.yml` on the Builder, which builds
every machine first, then switches each online Agent VM over `tailscale ssh`, then the Builder itself.

```sh
gh workflow run deploy.yml -R jliocsar/agents-machines --ref main -f vm=<vm>   # one VM; empty = all
```

- Packages, services, repos to clone and Claude Code config go in `machines/<name>/default.nix`. Claude Code is
  home-manager's `programs.claude-code` (ADR 0005). Settings merge into `settings.json`, and MCP servers come in
  through a generated plugin, so their tools are named `mcp__plugin_hm_<server>__*`.
- `~/.dotfiles` on a VM is a read-only nix store copy of the `dotfiles` flake input. Edits on the VM don't stick.
  Change `jliocsar/dotfiles`: a push to its `main` dispatches `bump-dotfiles`, which bumps the input and deploys.
- Check before you push: `nix flake check`. Build on the Builder or a VM, not the laptop (small disk).
- Never restart `rex.service` on a VM with live sessions. Its unit uses `X-SwitchMethod=keep-old`, so a deploy
  leaves it running on the old version.

## Creating or replacing a VM

1. Add `machines/<name>/vm.ts` and add it to `alchemy.run.ts`. Add `machines/<name>/default.nix` and a
   `nixosConfigurations` entry in `flake.nix`.
2. Attach the integrations its Recipe tag needs in `jliocsar/iac`.
3. From the laptop: `bun install && bun run plan`, then `bun run deploy`. exe.dev auth is a one-hour token signed
   with `~/.ssh/id_ed25519`. State is in `.alchemy/` and committed.
4. The VM boots the Image (`ghcr.io/jliocsar/agents-machines`), joins the tailnet, announces itself, and the
   Builder deploys its machine. A new Builder needs `mise run bootstrap-builder` instead (`docs/builder.md`).

Say what you'll create or delete, and why, before touching exe.dev VMs. Never change a Tailscale WIF integration's
`args`.

## Secrets and logins

- Personal VMs: no secrets on the box. Every credential arrives through an exe.dev integration on a tag.
- The work VM: Julio logs in by hand (gh, gcloud, Claude, PostHog), plus `~/.config/work/secrets.env` (0600),
  which zsh sources. Never print or copy those values.
- The Builder's own secrets are agenix files in `secrets/`. `bootstrap-builder` rekeys them.

## Lock bumps

The Updater opens one `lock/<input>` PR per input each day and merges it once `check` and `lock-check` pass.
`lock-check` allows only `flake.lock` changes whose revs sit on their upstream ref, or tarballs from a trusted host
(`updater/updater.py` `TRUSTED_TARBALLS`). A PR labelled `needs-review` waits for a person (`docs/lock-bumps.md`).
