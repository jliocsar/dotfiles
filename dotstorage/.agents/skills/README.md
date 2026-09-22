# skills

Personal agent skills. Symlinked into `~/.claude/skills/` and friends.

## Vendored skills

Some skills come from someone else's repo and are patched for this setup. Those
are split in two:

- `~/.agents/skills/<skill>/` is the raw upstream copy, untouched.
- `~/.claude/skills/<skill>/` is a real directory (not a symlink) with the
  patched `SKILL.md`, plus `SKILL.md.diff` (`diff -u upstream local`): the
  exact set of changes we own, so it's always clear what to carry over when
  upstream moves.

| skill     | upstream                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------- |
| `show-me` | https://github.com/humanlayer/skills — `plugins/show-me/skills/show-me/SKILL.md`                    |

### Updating a vendored skill

Run from `dotstorage/`:

1. Fetch the current upstream file over the raw copy, e.g.
   `curl -sfL https://raw.githubusercontent.com/humanlayer/skills/main/plugins/show-me/skills/show-me/SKILL.md -o .agents/skills/show-me/SKILL.md`
2. Merge: apply the diff on top of the new upstream file
   (`patch -o .claude/skills/show-me/SKILL.md .agents/skills/show-me/SKILL.md .claude/skills/show-me/SKILL.md.diff`),
   and fix any rejected hunks by hand.
3. Regenerate the diff so it stays honest:
   `diff -u --label upstream/SKILL.md --label local/SKILL.md .agents/skills/show-me/SKILL.md .claude/skills/show-me/SKILL.md > .claude/skills/show-me/SKILL.md.diff`

### show-me

Local changes on top of upstream:

- dropped `disable-model-invocation: true` so the model can reach for it on its own
- call trees use a `claude-code-callgraph` fence instead of `text` / `diff`.
  That fence (and `mermaid`) is rendered in the Claude Code TUI by the
  `MessageDisplay` hook at `~/.claude/hooks/render-fences.ts`, using the
  active theme's colors. Transcript and model still see the raw fence.
