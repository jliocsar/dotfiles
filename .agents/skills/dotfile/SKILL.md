---
name: dotfile
description: Add, link or remove a dotfile tracked in dotstorage. Use when asked to track a config file in this repo, to move a file from $HOME into version control, or when editing the dotfiles manifest or anything under dotstorage/.
---

# dotfile

`dotstorage/` mirrors `$HOME` and is the source of truth. The `dotfiles`
manifest at the repo root lists what gets symlinked. `dotfiles.pl` (`dotfiles`) links
manifest → `$HOME`.

## Check whether it's already covered

The manifest tracks directories as well as files. `.claude/skills/` is one
entry, so a new skill inside it needs **no** manifest change — it's already
linked. Read the `dotfiles` manifest before touching it; adding a redundant
entry for a file under an already-linked directory does nothing.

## Adding one

1. Put the file at `dotstorage/<path>`, mirroring its `$HOME` location:
   `~/.config/foo/config.toml` → `dotstorage/.config/foo/config.toml`.
2. Add `<path>` to the `dotfiles` manifest — relative, no leading `~/` or `/`.
   Group it under the existing `# Comment` headings; `#` lines and blanks are
   skipped by the parser.
3. **Directories need a trailing `/`.** `.config/nvim/`, not `.config/nvim`.
   Without it `dotfiles.pl` refuses to link and prints a bespoke error about it.
4. Link it: `dotfiles link`

## Linking is interactive

`link` shells out to `ln -sfi`, which prompts before clobbering an existing
file — so it hangs when Claude runs it. Hand it to the user instead:
`! dotfiles link`

It's safe to re-run: already-linked paths are skipped, and a manifest entry
missing from `dotstorage` is reported and skipped rather than fatal. Directory
entries link the whole directory into its parent.

## Other operations

```sh
dotfiles list           # what's tracked
dotfiles edit           # open the manifest in $EDITOR
dotfiles unlink <path>  # remove the $HOME symlink AND its manifest line
```

`unlink` takes the `$HOME`-relative path and edits the manifest as a side
effect — don't also delete the line by hand.

Nothing here commits. `dotfiles sync` does (`git add . && commit -m 'sync' && push`).
