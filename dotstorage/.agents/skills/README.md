# skills

Personal agent skills. Symlinked into `~/.claude/skills/` and friends.

## Vendored skills

Some skills here started as copies of someone else's and were patched for this
setup. For each one, `SKILL.md.diff` next to it is `diff -u upstream local`:
the exact set of changes we own, so it's always clear what to carry over when
upstream moves.

| skill     | upstream                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------- |
| `show-me` | https://github.com/humanlayer/skills — `plugins/show-me/skills/show-me/SKILL.md`                    |

### Updating a vendored skill

1. Fetch the current upstream file, e.g.
   `curl -sfL https://raw.githubusercontent.com/humanlayer/skills/main/plugins/show-me/skills/show-me/SKILL.md -o tmp/upstream.md`
2. Merge: apply `SKILL.md.diff` on top of the new upstream file
   (`patch tmp/upstream.md SKILL.md.diff`), fix any rejected hunks by hand,
   and copy the result over `SKILL.md`.
3. Regenerate the diff so it stays honest:
   `diff -u --label upstream/SKILL.md --label local/SKILL.md tmp/upstream.md show-me/SKILL.md > show-me/SKILL.md.diff`

### show-me

Local changes on top of upstream:

- dropped `disable-model-invocation: true` so the model can reach for it on its own
- call trees use a `claude-code-callgraph` fence instead of `text` / `diff`.
  That fence (and `mermaid`) is rendered in the Claude Code TUI by the
  `MessageDisplay` hook at `~/.claude/hooks/render-fences.ts`, using the
  active theme's colors. Transcript and model still see the raw fence.
