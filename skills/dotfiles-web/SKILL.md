---
name: dotfiles-web
description: Read and write the user's notes, meeting notes, tasks and artifacts (files) through the `dotfiles-web` CLI. Use when the user asks to find, read, create, edit, tag, archive, upload or share something in their notes / tasks / meetings, or mentions dotfiles-web.
---

`dotfiles-web` is a CLI for the user's personal content system. Everything goes through it. Never call the HTTP API yourself.

Every command prints JSON on stdout. Errors print JSON `{error, message, …}` on stderr and exit non-zero (see Exit codes).

## Entries

There are four types: `note`, `meeting`, `task` and `artifact`. Each entry has an `id`, a `slug`, a `title`, a markdown `body` and `tags`. A `ref` is either a slug or an id.

- Link to another entry in a body with `@slug`.
- A task body is only checklist lines, `- [ ] text` or `- [x] text`. Plain lines are turned into unchecked items when you push.
- Tags are lowercase `a-z`, `0-9` and `-`, 1 to 32 characters. `Deep Focus` is turned into `deep-focus`, and anything else is rejected.
- **There is no delete.** Archive instead, and tell the user they can delete it from the web UI.

## Finding and reading

```sh
dotfiles-web list [--type note|meeting|task|artifact] [--tag t] [--archived] [--title text] [--limit n] [--cursor c]
dotfiles-web get <ref>          # full entry, body included
dotfiles-web tags [--type …]    # tags in use, most used first
dotfiles-web meetings           # today's calendar events, with the slug of each one's note (or null)
```

`list` returns summaries without bodies, newest first, 50 per page by default (200 at most). When `cursor` isn't null, pass it back with `--cursor` to get the next page. `--title` matches a substring.

## Editing: pull → edit → push

You never deal with versions. The CLI keeps track of them in a hidden sidecar file.

```sh
dotfiles-web pull <ref>                 # writes /tmp/dotfiles-web/<slug>.md, prints {slug, path}
# edit that file with your normal file tools
dotfiles-web push <slug>                # or: push /path/to/<slug>.md
```

- Pass `--dir <dir>` to use another folder instead of `/tmp/dotfiles-web`. Give the same `--dir` to `push`.
- `push` sends the edits you made. If someone changed the entry in the meantime, the CLI merges their changes in:
  - When the edits don't overlap, it pushes the merge. The output has `"merged": true`, and the file now holds the merged text.
  - When they overlap, it exits with **3** and leaves git-style conflict markers (`<<<<<<< local`, `||||||| base`, `=======`, `>>>>>>> remote`) in the file. Resolve them by keeping the right text and deleting the markers, then run `push` again.
- `pull` refuses to overwrite a file that has unpushed edits and exits with **5**. Push first. Only use `pull --force` when the user wants their local edits thrown away.
- Artifacts can't be pulled. Use `download`.

## Creating

```sh
echo "body" | dotfiles-web new note [--title "Title"] [--tag t]…    # also: new task
dotfiles-web meeting                                              # note for the meeting happening now
```

`new` and `meeting` print the entry plus `path`: they pull it straight away, so you can edit the file and `push`.

- Leave out `--title` and the title is the current date and time.
- Pipe the body in on stdin, or send nothing to start empty.
- `meeting` finds the calendar event happening now. If that event already has a note, it opens that note instead of making a second one. If no event matches, it creates a note titled with the current time.

## Changing

```sh
dotfiles-web rename <ref> "New title"       # the slug stays the same
dotfiles-web tag <ref> t1 t2 …              # replaces every tag; no tags clears them
dotfiles-web attach <ref> <eventId>         # eventId comes from `meetings`
dotfiles-web archive <ref>
dotfiles-web restore <ref>
```

## Artifacts (files)

```sh
dotfiles-web upload <file> [--title name] [--tag t]…   # the title defaults to the file name
dotfiles-web download <ref> [-o path]                  # saves to ./<title> by default
dotfiles-web share <ref> [--ttl 1h|1d|7d|never]         # public link; the default ttl is 7d
dotfiles-web unshare <linkId>                          # linkId comes from `share` or `get`
```

When an artifact with that title already exists, `upload` prints `"skipped": true` and uploads nothing. For an artifact, `get` also includes a short-lived download `url` and its active `shares`.

## Exit codes

| code | meaning                                               | what to do                               |
| ---- | ----------------------------------------------------- | ---------------------------------------- |
| 0    | ok                                                    |                                          |
| 1    | unexpected (network, server)                          | report it                                |
| 2    | bad usage (flag, tag or type), or pulling an artifact | fix the command                          |
| 3    | conflict markers were written into the file           | resolve them, then `push` again          |
| 4    | entry or calendar event not found                     | check the ref with `list --title`        |
| 5    | unpushed local edits would be overwritten             | `push` first                             |
| 6    | not logged in, or the token was rejected              | ask the user to run `dotfiles-web login` |

Login asks for a password, so it's the user's job. Never try to log in yourself.
