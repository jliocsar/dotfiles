# Personal Content System — v1 spec

Working name: `<app>`. Single user, self-hosted, agent-writable.

Supersedes `plan.md` entirely. What survived from it: one table, CodeMirror + vim,
calendar auto-detect, share links, archive, MCP. Everything else is deleted
(folders, dumps, front matter, `type`/`kind` two-level discriminators, tasks as
entities, backlinks, documents/posts, MDX, the CLI).

---

## 0. Goals / non-goals

**Goals**

- One place for notes, meeting notes, task lists and artifacts, from phone and desktop.
- Capture is one click and zero typing. The server picks the title.
- Agents write here through MCP. That's a first-class client, not an afterthought.
- One Fly machine, one SQLite file, one Tigris bucket. Backup is one file plus the bucket.

**Non-goals for v1**

- Search (SQLite FTS5 is ~10 lines whenever you want it; not now)
- Backlinks, link index
- Due dates, recurrence, reminders (Google Calendar already nags you)
- Writing to Google Calendar; Drive/Meet transcript ingestion (post-v1)
- CLI / `$EDITOR` round-trip (post-v1)
- `@` autocomplete in the editor (post-v1, and it's the best post-v1 item)
- Multi-user, roles, collaborative editing
- Tags. Sections and `@` links are the whole organisation story.
- Attachments on notes. A file is an artifact; link to it with `@slug`.

---

## 1. Data model

One table. Four `type` values. A section is `SELECT … WHERE type = ?`.

```sql
entries
  id           TEXT PRIMARY KEY           -- ULID
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

share_links  id, entry_id, token (UNIQUE, >=128 bits), expires_at, revoked_at,
             created_at

google_accounts
             id, label, email, priority, calendar_ids (JSON),
             refresh_token (encrypted), created_at
```

**Indexes:** `entries(type, archived_at, updated_at DESC)`, `share_links(token)`,
`share_links(entry_id, revoked_at)`.

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
"missing" page. Acceptable.

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
- MCP writes must pass `expectedVersion`; a write without it is rejected. A stale one
  returns `VersionConflict` carrying the current body, so an agent can retry without a
  second round-trip.
- SQLite in WAL mode with `busy_timeout` set is the entire concurrency story.
- No revision history in v1. If you want it later it's an append-only `entry_revisions`
  table, coalesced to one row per ~5 minutes of editing.

---

## 6. Routes

| Route                                      | Auth              | Behaviour                                         |
| ------------------------------------------ | ----------------- | ------------------------------------------------- |
| `/`                                        | session           | Home: the four section links and Sign out         |
| `/login` `/logout`                         | none              | Password form; sets or clears the session cookie  |
| `/notes` `/meetings` `/tasks` `/artifacts` | session           | Lists, `?archived`                                |
| `/e/:slug`                                 | session           | Entry page. Type comes from the row.              |
| `/a/:slug`                                 | session           | Artifact → 302 to a short-lived signed Tigris URL |
| `/s/:token`                                | none              | Shared artifact → 302 to a signed URL             |
| `/api/…`                                   | session or bearer | JSON over the service layer                       |
| `/mcp`                                     | bearer            | MCP endpoint                                      |

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

## 9. MCP server

MCP TypeScript SDK v2 (`@modelcontextprotocol/server`), spec `2026-07-28`, Streamable
HTTP, bearer token. One token per agent so a single one can be revoked.

Tool schemas use Standard Schema — Effect Schema implements it, so one schema
definition covers MCP validation and the service layer.

| Tool                                                              | Notes                                          |
| ----------------------------------------------------------------- | ---------------------------------------------- |
| `list_entries({type?, archived?, limit, cursor})`                 | Summaries, never bodies                        |
| `get_entry({slug\|id})`                                           | Full body and `version`                        |
| `create_note({title?, body?})`                                    |                                                |
| `create_task({title?, body?})`                                    |                                                |
| `create_meeting_note()`                                           | Runs §3.2, including the "already exists" case |
| `put_entry({id, title?, body?, expectedVersion})`                 | `expectedVersion` required                     |
| `list_todays_meetings()`                                          | Same list as §3.3                              |
| `set_meeting({id, eventId})`                                      | Applies §3.3                                   |
| `archive_entry({id})` / `restore_entry({id})`                     | No delete tool for agents                      |
| `presign_artifact_upload()`                                       | `{key, url}`; agent PUTs directly to Tigris    |
| `register_artifact({key, title, mime, bytes})`                    | Creates the entry                              |
| `create_share_link({id, expiresIn?})` / `revoke_share_link({id})` |                                                |

Enforced by the server, not by prompt: slugs immutable, no delete tool,
`expectedVersion` mandatory on writes.

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
- Auth: one password → long-lived signed session cookie. Bearer tokens for MCP. No
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
| **P4**    | MCP server, per-agent tokens                                                                                                  |
| **P5**    | PWA polish, install, mobile capture pass                                                                                      |
| **Later** | `@` autocomplete, FTS search, revision history, CLI, Drive/Meet transcripts, calendar writes                                  |

Done: P0 except the broken-`@` page, P2, P3. P1 is next; P4 after; P5 waits.

---

## 12. Still open

- Task list ordering is `updated_at DESC`; manual sort only if it starts to hurt.
- Artifact preview: images, PDF, video and audio render inline for now; `text/*`
  opens in a tab, everything else downloads.
- Artifact dedupe by content hash: dropped from the schema until there is a use.
- Share links default to 7 days; `Never expires` is a deliberate pick.
- Whether `@slug` links get a distinct visual style from external links in preview.
