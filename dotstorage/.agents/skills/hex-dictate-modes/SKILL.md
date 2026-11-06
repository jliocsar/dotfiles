---
name: hex-dictate-modes
description: Add, edit, or remove hex-dictate's dictation modes in `~/.config/hex-dictate/modes.json`. Use when the user wants a new tone or format for their Ctrl+Alt+Space dictation, or asks to change or delete a dictation mode.
---

# hex-dictate modes

`hex-dictate` is the user's Hex wrapper. `Ctrl+Alt+Space` records. The second press opens a Quickshell picker that lists the modes. The chosen mode's prompt rewrites the transcript through `claude -p`, and the result is pasted.

Modes live in `~/.config/hex-dictate/modes.json`, which is a symlink into the dotfiles at `~/.dotfiles/dotstorage/.config/hex-dictate/modes.json`. The picker and the "Dictation Modes" editor window read it on their own, so nothing needs restarting.

## Format

```json
{
  "version": 1,
  "modes": [
    {
      "id": "casual",
      "name": "Casual",
      "description": "Chat message to a coworker",
      "model": "haiku",
      "prompt": "Casual, like a chat message to a coworker. Plain text with no formatting."
    }
  ]
}
```

- `id`: lowercase letters, numbers, and hyphens. Unique. `raw` is reserved for the built-in "paste as dictated" entry.
- `name`: shown in the picker.
- `description`: one short line under the name in the picker.
- `model`: optional, any `claude --model` value. Defaults to `haiku`. Use `sonnet` for modes meant for long dictation, since it dropped fewer details in the user's evals.
- `prompt`: the style for this mode only.

The list order is the picker's order, and the first mode is selected by default.

## Writing a prompt

`hex-dictate` already adds the shared rules: never answer the transcript, keep every fact, remove filler, keep identifiers, and spell the user's Hex vocabulary correctly. So a mode's prompt only describes the style. Don't repeat those rules, and don't mention the `<transcript>` tags.

State the formatting explicitly, such as "Plain text with no formatting", or the model may add Markdown.

## After editing

Run `hex-dictate modes check`. It prints each problem and exits non-zero if there are any.

Try a mode without touching the mic or the clipboard:

```sh
printf 'um so can you check whether the deploy passed' | hex-dictate rewrite <id>
```

Run that with several inputs for a new mode, including a question and an instruction, and check that the output restates them instead of answering. Each run uses the user's Claude plan, so keep it to a few.

Don't commit. The user syncs their dotfiles themselves.
