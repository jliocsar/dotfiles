import * as SqliteClient from '@effect/sql-sqlite-bun/SqliteClient'
import * as SqliteMigrator from '@effect/sql-sqlite-bun/SqliteMigrator'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as SqlClient from 'effect/unstable/sql/SqlClient'

const createEntries = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`
    CREATE TABLE entries (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    )
  `

  yield* sql`CREATE INDEX entries_section ON entries (type, archived_at, updated_at DESC)`
})

const addArtifactColumns = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`ALTER TABLE entries ADD COLUMN object_key TEXT`
  yield* sql`ALTER TABLE entries ADD COLUMN mime TEXT`
  yield* sql`ALTER TABLE entries ADD COLUMN bytes INTEGER`
})

const createShareLinks = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`
    CREATE TABLE share_links (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    )
  `

  yield* sql`CREATE INDEX share_links_entry ON share_links (entry_id, revoked_at)`
})

const addMeetings = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`ALTER TABLE entries ADD COLUMN meeting TEXT`
  yield* sql`
    CREATE TABLE google_accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      calendar_ids TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `
})

// Plaintext on purpose: tags are filtered and grouped on, bodies are not (§3.7).
const createEntryTags = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`
    CREATE TABLE entry_tags (
      entry_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (entry_id, tag)
    )
  `

  yield* sql`CREATE INDEX entry_tags_tag ON entry_tags (tag, entry_id)`
})

const ClientLayer = SqliteClient.layerConfig({
  filename: Config.string('DATABASE_PATH').pipe(Config.withDefault('app.db')),
})

export const DatabaseLayer = SqliteMigrator.layer({
  loader: SqliteMigrator.fromRecord({
    '1_entries': createEntries,
    '2_artifacts': addArtifactColumns,
    '3_share_links': createShareLinks,
    '4_meetings': addMeetings,
    '5_tags': createEntryTags,
  }),
}).pipe(Layer.provideMerge(ClientLayer))
