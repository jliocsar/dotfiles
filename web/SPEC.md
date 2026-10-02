# Personal Content System — v1 spec

Working name: `<app>`. Single user, self-hosted, agent-writable.

Supersedes `plan.md` entirely. What survived from it: one table, CodeMirror + vim,
calendar auto-detect, share links, archive, agent access (now a CLI, not MCP).
Everything else is deleted (folders, dumps, front matter, `type`/`kind` two-level
discriminators, tasks as entities, backlinks, documents/posts, MDX).

---

## 0. Goals / non-goals

**Goals**

- One place for notes, meeting notes, task lists and artifacts, from phone and desktop.
- Capture is one click and zero typing. The server picks the title.
- Agents write here through the `dotfiles-web` CLI and its skill. That's a first-class
  client, not an afterthought.
- One Fly machine, one SQLite file, one Tigris bucket. Backup is one file plus the bucket.

**Non-goals for v1**

- Search (SQLite FTS5 is ~10 lines whenever you want it; not now)
- Backlinks, link index
- Due dates, recurrence, reminders (Google Calendar already nags you)
- Writing to Google Calendar; Drive/Meet transcript ingestion (post-v1)
- `@` autocomplete in the editor (post-v1, and it's the best post-v1 item)
- Multi-user, roles, collaborative editing
- Folders, hierarchy, nested tags. Tags are flat labels (§3.7); sections and `@` links
  do the rest.
- Attachments on notes. A file is an artifact; link to it with `@slug`.

---

## 1. Data model

One table. Four `type` values. A section is `SELECT … WHERE type = ?`.

```sql
entries
  id           TEXT PRIMARY KEY           -- UUIDv7
  type         TEXT NOT NULL              -- 'note' | 'meeting' | 'task' | 'artifact'
  slug         TEXT NOT NULL UNIQUE       -- immutable after creation
  title        TEXT NOT NULL
  body         TEXT NOT NULL DEFAULT ''   -- markdown; always '' for artifacts
  meeting      TEXT                       -- JSON MeetingRef; 'meeting' only
  object_key   TEXT                       -- Tigris key; 'artifact' only
  mime         TEXT                       -- 'artifact' only
  bytes        INTEGER                    -- 'artifact' only
  archived_at  TEXT
  created_at   TEXT NOT NULL
  updated_at   TEXT NOT NULL
  version      INTEGER NOT NULL DEFAULT 1 -- conflict token, bumped every commit

entry_tags   entry_id, tag                -- PK (entry_id, tag); plaintext, indexed

share_links  id, entry_id, token (UNIQUE, >=128 bits), expires_at, revoked_at,
             created_at

google_accounts
             id, label, email, priority, calendar_ids (JSON),
             refresh_token (encrypted), created_at
```

**Indexes:** `entries(type, archived_at, updated_at DESC)`, `entry_tags(tag, entry_id)`,
`share_links(token)`, `share_links(entry_id, revoked_at)`.

Three nullable artifact columns is the price of keeping one table. Worth it —
archive, share links and slugs then work uniformly with no polymorphic foreign keys.

No front matter. No `source` column. `body` is the whole markdown file. Title and
dates are columns, edited through the UI, never through YAML.

### MeetingRef

```ts
interface MeetingRef {
  accountId: string | null // null when created outside any calendar slot
  eventId?: string
  start: string // ISO 8601
  end?: string
  attendees: { email: string; name?: string }[]
  link?: string // Meet / Zoom URL if present
}
```

Snapshotted once. Never re-synced — events get renamed and cancelled.

---

## 2. Entry types

| type       | body                                      | extras                            | section       |
| ---------- | ----------------------------------------- | --------------------------------- | ------------- |
| `note`     | markdown                                  |                                   | Notes         |
| `meeting`  | markdown                                  | `meeting` block, calendar buttons | Meeting Notes |
| `task`     | `- [ ]` lines only, edited as a checklist |                                   | Tasks         |
| `artifact` | empty                                     | Tigris object, no editor          | Artifacts     |

A meeting note _is_ a note. The only differences are the `meeting` JSON and two extra
buttons in the header. A task page stores `- [ ]` lines in `body` but never shows the
markdown: the page is a checklist, one text field per line, no source view. A line that
isn't a task is read as an unchecked task and normalised on the next save.

---

## 3. Behaviours

### 3.1 New note / new task

Click **New** in the section header. Server creates an entry with
`title = "{YYYY-MM-DD HH:mm}"`, empty body, slug derived from the title (plus a short
random suffix on collision). Navigates straight into it, cursor in the body. No prompt,
no dialog, no typing.

### 3.2 New meeting note

```
now      = server time
grace    = 10 minutes
accounts = google_accounts ordered by priority

for account in accounts:
  events      = calendar.list(account, [now - grace, now + grace])
                filtered: not all-day, not declined, not cancelled
  overlapping = events where start <= now + grace and end >= now - grace
  if overlapping:
    event = the one whose start is closest to now
    existing = entry where meeting.eventId = event.id and archived_at is null
    if existing: open it                       # idempotent, click twice = same note
    else: create meeting{ title: event.summary, meeting: snapshot(event) }
    return

# no calendar match
create meeting{ title: "{YYYY-MM-DD HH:mm}", meeting: { accountId: null, start: now, attendees: [] } }
```

No folder prompt, no decisions. If the detection missed, fix it with the meeting
picker (§3.3).

### 3.3 Attach meeting title

Header button on a meeting note. Lists every event from `00:00` to `23:59` today across
all accounts, ordered by start. Picking one sets `title` and overwrites the `meeting`
snapshot. The slug does not change.

### 3.4 New artifact

**New** in the Artifacts header is a file picker. The browser asks the server for a
presigned Tigris PUT, uploads straight to the bucket, then registers the entry with
the file's name as the title. To attach a file to a note, upload it here and link it
with `@slug`.

Register only accepts unused keys under `artifacts/`, and reads `bytes` and
`content-type` from a HEAD on the object (falling back to the title's extension),
never from the client. A title already used by an artifact is skipped. Objects
uploaded but never registered are ignored.

### 3.5 Checklist

A task page is a flat list of `[checkbox] [text]` rows plus a trailing empty row.
Enter inserts a row below, Backspace on an empty row removes it, Escape blurs. Text
saves on the same ~2s idle / blur rule as the editor; a checkbox click commits at
once, one version bump per click. The Tasks list shows `done/total` next to the date
for pages that have any rows.

### 3.6 Archive and delete

Archive from anywhere. Archived entries stay in their own section behind an
"Archived" filter — there is no global Archive view. Delete is only offered on
archived entries. Deleting leaves dangling `@slug` links; the resolver shows a
"missing" page. Acceptable. Deleting also drops the entry's `entry_tags` rows.

### 3.7 Tags

Flat labels on any entry type, for filtering and nothing else. No hierarchy, no
rename, no manage screen: a tag exists while at least one entry carries it.

- A tag is a normalised string: trim, lowercase, spaces → `-`, then `[a-z0-9-]{1,32}`.
  Anything else is rejected on input.
- Stored in `entry_tags`, plaintext, because they are indexed and filtered — unlike
  bodies, which are encrypted at rest. A tag name is no more sensitive than a title.
- Color is derived, never stored: `palette[hash(tag) % palette.length]` over 10–12
  hues tuned for light and dark. Same color everywhere, including agents.
- Lists filter by one tag at a time, `?tag=foo`, composable with `?archived`. The
  tags offered on a list page are the distinct tags of that section in that archived
  state. Rows show their tags as Linear-style pills (colored dot + name).
- The entry page shows the entry's tags as pills in the meta row, as many as fit and a
  `+N` pill for the rest. A `Tags` button (and `+N`) opens a checklist popover: a search
  box, every tag in use across all sections most-used first (a tag made in Notes is
  ready to pick in Artifacts), a `Create "x"` row when the search text is a new tag. Each toggle commits at once, replacing the whole set
  through `setTags`.
- List pages filter through a `Tag ▾` action next to `Archived`: the same popover,
  rows link to `?tag=`, the active tag reads back in the action and clears on a second
  pick.
- `setTags` bumps **neither** `version` nor `updated_at`. Tagging isn't editing: it
  must not reorder the list and must not make the editor's next debounced save fail
  with `VersionConflict`. Tags live outside the conflict token. (`set_meeting` does
  bump `version`: it rewrites `title`.)
- No cap on tags per entry.

---

## 4. Links

- Plain markdown, internal target prefixed with `@`: `[My note](@my-note)`.
- The `@` is the whole rule. No scheme sniffing, no title fallback, no ambiguity with
  real URLs or anchors.
- Any entry can be a target — a note, a meeting note, a task list or an artifact —
  from the body of any note, meeting note or task. Artifact targets resolve to the
  artifact page, not the file.
- Slugs are globally unique and **immutable**. Renaming changes `title` only. Links
  never rot except by deletion.
- Resolution is a lookup at render time. Missing target renders as a broken-link style
  and links to a page offering "create a note with this slug".
- No links table, no backlinks panel.

---

## 5. Saving and concurrency

- The editor debounce-commits at ~2s idle, and on blur.
- Every commit bumps `version`. It's a conflict token, not a history counter — nothing
  displays it.
- All writes, from any client, land in one function: `putEntry(id, patch, expectedVersion)`.
- API writes must pass `expectedVersion`; a write without it is rejected. A stale one
  returns `VersionConflict` carrying the current entry. `title` and `body` are each
  optional on a put; an omitted one keeps its value.
- Task bodies are normalised to `- [ ]` / `- [x]` lines inside `putEntry`, for every
  client.
- SQLite in WAL mode with `busy_timeout` set is the entire concurrency story.
- No revision history in v1. If you want it later it's an append-only `entry_revisions`
  table, coalesced to one row per ~5 minutes of editing.

---

## 6. Routes

| Route                                      | Auth              | Behaviour                                         |
| ------------------------------------------ | ----------------- | ------------------------------------------------- |
| `/`                                        | session           | Home: the four section links and Sign out         |
| `/login` `/logout`                         | none              | Password form; sets or clears the session cookie  |
| `/notes` `/meetings` `/tasks` `/artifacts` | session           | Lists, `?archived`, `?tag=`                       |
| `/e/:slug/tags`                            | session           | POST, replaces the set, returns checklist + pills |
| `/e/:slug`                                 | session           | Entry page. Type comes from the row.              |
| `/a/:slug`                                 | session           | Artifact → 302 to a short-lived signed Tigris URL |
| `/s/:token`                                | none              | Shared artifact → 302 to a signed URL             |
| `/api/…`                                   | session or bearer | JSON over the service layer; the CLI's API        |

Every route except `/login`, `/logout`, `/s/:token` and static assets sits behind
the session gate: pages 303 to `/login?next=`, `/api` answers 401.

Artifacts are always served from a signed Tigris URL, never proxied through the app
origin — uploaded `.html` must not run on the same origin as your session cookie.
Text, images, PDF, video and audio open inline in the browser, everything else
downloads, driven by the `Content-Disposition` on the signed URL; `?download` forces it.

---

## 7. Web UI

Layout: no sidebar. One centered column with a max-width rail; every page has a
back link at the top-left (`← Home` on lists, `← {Section}` on entries).

```
Home               Notes · Meeting Notes · Tasks · Artifacts        [Sign out]
List page          [< Home]  {section title} .......... [New]
                   {rows: title, updated}
Entry page         [< section]  {title, editable inline}   [Attach meeting]
                   {editor — no borders, no chrome, fills the rail}
                   [Source | Preview]
```

- Editor: CodeMirror 6, markdown, vim keybindings. Borderless, reads as page text.
- `Source | Preview` toggle on notes and meetings. Task pages have neither; the body
  is the checklist.
- Artifacts have no editor. The artifact page is metadata, a preview if the mime allows,
  a download link and the share link.
- Mobile: PWA, installable, capture-first. **New** is the thumb-reachable primary
  action. Editing works; capture is the point.
- The Fly machine stays always-on. Cold-starting mid-meeting feels broken.

---

## 8. Sharing

Artifacts can get secret links: `/s/:token`, optionally expiring, always revocable.
The link resolves to a freshly signed Tigris URL at request time, so the bucket
stays private and a revoked link dies on the next request.

`Share` in the artifact's meta row opens an anchored panel listing the active links
(`/s/token`, expiry, `Copy`, revoke `×`) with a pinned `1h 1d 7d ∞` + `New link` row
at the bottom. Tokens are 128 random bits, base64url. A revoked, expired or archived
entry's link answers 404. Hard-deleting the entry deletes its links.

---

## 9. CLI and skill

Agents reach the app through `dotfiles-web`, a CLI, plus a skill at
`skills/dotfiles-web/SKILL.md` (repo root, not `web/`). Anything with a shell can
use it; no MCP.

- `apps/cli`: Effect `unstable/cli` + `HttpApiClient.make(Api)`, sharing `api.ts` and
  `domain.ts` with the server. `bun build --compile` → `apps/cli/dist/dotfiles-web`.
- Talks to `/api` only. `/api` has no delete endpoint; delete stays a web action.
- Auth: `login [--url]` prompts for the password, posts it to `/api/auth/login` (the one
  `/api` route outside the gate) and gets the same `{issuedAt}.{hmac}` token
  the session cookie carries, saved with the URL to `~/.config/dotfiles-web/config.json`
  (mode `0600`). Sent as `Authorization: Bearer`; `SessionGate` accepts cookie or
  bearer. `DOTFILES_WEB_URL` / `DOTFILES_WEB_TOKEN` override the file. Revoking a
  machine = rotating `SESSION_SECRET`.
- Every request sends the machine's IANA zone in `x-time-zone`; the server prefers it over
  the `tz` cookie.
- `ref` anywhere is a slug or an id (a UUIDv7); the server matches either.
- Output is JSON on stdout. Errors are JSON `{error, message, …}` on stderr.

| Command                                                             | Notes                                                                                    |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `login [--url]`                                                     |                                                                                          |
| `list [--type] [--tag] [--archived] [--title] [--limit] [--cursor]` | Summaries. Limit 50, max 200. Keyset cursor on `(updated_at, id)`; `--title` is a `LIKE` |
| `get <ref>`                                                         | Full entry. Artifacts add a signed GET URL and active share links                        |
| `new note\|task [--title] [--tag]… [< body]`                        | Creates, then pulls                                                                      |
| `meeting`                                                           | Runs §3.2 (incl. "already exists"), then pulls                                           |
| `meetings`                                                          | Today's list, as §3.3                                                                    |
| `attach <ref> <eventId>`                                            | Applies §3.3                                                                             |
| `pull <ref> [--dir] [--force]` / `push <slug\|file>`                | See below                                                                                |
| `rename <ref> <title>`                                              | Title-only put; CLI fetches the version itself                                           |
| `tags [--type]` / `tag <ref> <tags…>`                               | `tag` replaces the set                                                                   |
| `archive <ref>` / `restore <ref>`                                   |                                                                                          |
| `upload <file> [--title] [--tag]…` / `download <ref> [-o]`          | Presign → PUT → register in one step; duplicate title is skipped                         |
| `share <ref> [--ttl 1h\|1d\|7d\|never]` / `unshare <linkId>`        |                                                                                          |

**Pull / push.** Agents never see `version`. `pull` writes `/tmp/dotfiles-web/<slug>.md`
(or `--dir`) plus a sidecar `.<slug>.json` holding `{id, version, base}`. It refuses
to overwrite a file that differs from `base` unless `--force`. `push` sends the
sidecar's version; on `VersionConflict` it runs `git merge-file local base remote`:
a clean merge is pushed silently, overlapping edits leave conflict markers in the file
and exit 3. Artifacts can't be pulled.

**Exit codes.** 0 ok, 1 unexpected, 2 usage, 3 conflict markers written, 4 not found,
5 unpushed local changes, 6 auth (run `login`).

**Skill.** `@slug` link syntax, the task body format, tag rules, the pull → edit → push
loop, conflict handling, exit codes, and "no delete, archive instead".

**Tests.** `bun test`: the API through `HttpApiClient` against a temp DB with fake
ObjectStore and Calendar (bearer auth, create, partial put, conflict, archive,
register rejecting a bad key), and the CLI's push/merge logic (clean merge, conflict
markers, unpushed-changes guard).

---

## 10. Stack and ops

- TypeScript, Effect v4 (`effect@rc`, `main` branch line), TS 5.9+.
- SQLite via `@effect/sql-sqlite-bun`, WAL, forward-only migrations run on boot.
- One Fly machine, always-on, one volume. Single process. Infra is `apps/web/alchemy.run.ts`
  (Alchemy): app, bucket, secrets, image, machine, IPs. `bun run deploy` from the root.
- Tigris for artifacts. Private bucket, signed URLs only.
  Read through `Bun.S3Client` from `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  `BUCKET_NAME` and `AWS_ENDPOINT_URL_S3`, set as Fly secrets from the bucket's outputs.
  Objects live at `artifacts/{uuid}`; `Content-Disposition` and `Content-Type`
  are set per signed GET, so a title rename changes the download name.
- Auth: one password → long-lived signed session cookie; the CLI sends the same token
  as a bearer. No
  accounts table, no passkeys. `PASSWORD_HASH` is a `Bun.password.hash` (argon2id)
  string — in `.env` every `$` must be written `\$` because bun expands `$name`
  even inside quotes — and `SESSION_SECRET` signs the `session` cookie
  (`HttpOnly; Secure; SameSite=Lax`, one year, `{issuedAt}.{hmac}` so rotating the
  secret logs everything out). Wrong passwords wait two seconds before answering.
- Secrets: Google OAuth client, token encryption key, session signing key, Tigris creds.
- Google scope: `calendar.readonly`. That's the only one.
- Backup: Fly volume snapshots (daily, 30-day retention) plus `services/Backup.ts`:
  hourly `VACUUM INTO` uploaded to the artifacts bucket as `backups/app-<hour>.db`.
  Restore = download one, place it at `DATABASE_PATH`, restart the machine.

---

## 11. Phases

| Phase     | Scope                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **P0**    | Schema, entry service, auth, Home, Notes + Tasks sections, editor, source/preview, checkbox toggle, archive/delete, `@` links |
| **P1**    | Google OAuth, calendar detection, Meeting Notes section, today's-meetings picker                                              |
| **P2**    | Artifacts: presigned upload, signed serving, artifact list and page                                                           |
| **P3**    | Share links on artifacts                                                                                                      |
| **P3.5**  | Tags: `entry_tags`, `setTags`, list filter and row pills, entry-page picker                                                   |
| **P4**    | `dotfiles-web` CLI + skill                                                                                                    |
| **P5**    | PWA polish, install, mobile capture pass                                                                                      |
| **Later** | `@` autocomplete, FTS search, revision history, Drive/Meet transcripts, calendar writes                                       |

Done: P0 except the broken-`@` page, P1, P2, P3. P3.5 is in progress; P4 is next; P5 waits.

---

## 12. Still open

- Task list ordering is `updated_at DESC`; manual sort only if it starts to hurt.
- Artifact preview: images, PDF, video and audio render inline for now; `text/*`
  opens in a tab, everything else downloads.
- Artifact dedupe by content hash: dropped from the schema until there is a use.
- Share links default to 7 days; `Never expires` is a deliberate pick.
- Whether `@slug` links get a distinct visual style from external links in preview.

---

## 13. Implementation notes

The code carries no comments (lint rule `begone-slop/no-comments`); the non-obvious whys
live here.

- `apps/web/src/api.ts` is shared with the CLI: it may import `domain.ts` and `effect`,
  never a service, or server code ends up in the binary.
- `/api/auth/login` is the one `/api` route `SessionGate` lets through.
- Home's calendar is stale-while-revalidate: the last fetched HTML paints at once from
  `sessionStorage` (so event titles don't outlive the session), fresh HTML replaces it.
  It's fetched after the page paints so Google's latency never blocks Home.
- The `tz` cookie is set by `Layout`; the first visit reloads once to apply it. The CLI
  sends `x-time-zone` instead, which wins.
- Upload dialog: `dragenter`/`dragleave` fire for every child crossed, so a depth counter
  decides "left the window". Drops are `preventDefault`ed or the browser navigates to the
  file. Basecoat's `toast()` exists only after `DOMContentLoaded`, and the reload that
  refreshes the list would eat a toast, so the report is stashed in `sessionStorage` and
  shown on the next page.
- Editor: the page scrolls, not CodeMirror, so nothing needs clipping; the
  `.cm-editor`-prefixed cursor rule exists to outrank the vim plugin's own cursor; vim is
  off on touch screens; only a boosted navigation rebuilds the editor, never an htmx
  fragment swap. Enter in the tag search is swallowed in the capture phase, before the
  browser submits the create form.
- Tag popover rows are `relative` so each sr-only checkbox stays inside its row instead of
  making the panel scroll.
- Google OAuth: the `oauth_state` cookie ties the callback to the browser that started it
  (CSRF). The primary calendar's id is the account email, which saves an email scope.
  All-day events are skipped (§3.2).
- Calendar: access tokens are cached in memory and refreshed a minute early; reconnecting
  an email replaces its token; an event on two accounts shows once, the higher-priority
  account wins.
- Entries: `tags` is a correlated subquery so every read carries them in one round trip;
  `createArtifacts` re-checks titles because another tab may have won the name since
  presign.
- CLI merge: `git merge-file` exits 0 when clean, 1–127 with that many conflicts, higher
  on failure.
