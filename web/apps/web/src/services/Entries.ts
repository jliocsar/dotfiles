import slugify from '@sindresorhus/slugify'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { flow } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Struct from 'effect/Struct'
import * as SqlClient from 'effect/unstable/sql/SqlClient'
import * as SqlSchema from 'effect/unstable/sql/SqlSchema'

import type { Entry, MeetingRef, Tag } from '../domain.ts'
import {
  EntryId,
  EntryNotFound,
  EntrySlug,
  EntryType,
  MentionTarget,
  TagCount,
  entryId,
  entrySlug,
  timestampTitle,
  VersionConflict,
} from '../domain.ts'
import { Cipher } from './Cipher.ts'
import type { CipherShape } from './Cipher.ts'
import { ObjectStore } from './ObjectStore.ts'

export interface EntriesShape {
  readonly list: (type: EntryType, archived: boolean, tag?: Tag) => Effect.Effect<readonly Entry[]>
  /** Tags carried by entries of one section, most used first (§3.7). */
  readonly distinctTags: (type: EntryType, archived: boolean) => Effect.Effect<readonly TagCount[]>
  readonly recent: (limit: number) => Effect.Effect<readonly Entry[]>
  readonly targets: Effect.Effect<readonly MentionTarget[]>
  readonly existing: (slugs: readonly string[]) => Effect.Effect<ReadonlySet<string>>
  readonly bySlug: (slug: EntrySlug) => Effect.Effect<Entry, EntryNotFound>
  /** Live meeting notes keyed by the calendar event they were created from. */
  readonly byEventIds: (eventIds: readonly string[]) => Effect.Effect<ReadonlyMap<string, Entry>>
  readonly create: (input: EntryCreate) => Effect.Effect<Entry>
  readonly createArtifact: (input: ArtifactInput) => Effect.Effect<Entry>
  readonly put: (input: EntryPut) => Effect.Effect<Entry, EntryNotFound | VersionConflict>
  readonly setMeeting: (input: MeetingPut) => Effect.Effect<Entry, EntryNotFound>
  /** Replaces the whole set. Not an edit: neither `version` nor `updated_at` move (§3.7). */
  readonly setTags: (id: EntryId, tags: readonly Tag[]) => Effect.Effect<Entry, EntryNotFound>
  readonly archive: (slug: EntrySlug) => Effect.Effect<Entry, EntryNotFound>
  readonly restore: (slug: EntrySlug) => Effect.Effect<Entry, EntryNotFound>
  readonly remove: (slug: EntrySlug) => Effect.Effect<Entry, EntryNotFound>
}

export interface ArtifactInput {
  readonly title: string
  readonly objectKey: string
  readonly mime: string
  readonly bytes: number
}

export interface EntryCreate {
  readonly type: EntryType
  /** Slug source when set; otherwise a wall-clock title in `zone`. */
  readonly title: Option.Option<string>
  readonly zone: DateTime.TimeZone
  readonly meeting?: MeetingRef
}

export interface EntryPut {
  readonly id: EntryId
  readonly title: string
  readonly body: string
  readonly expectedVersion: number
}

export interface MeetingPut {
  readonly id: EntryId
  readonly title: string
  readonly meeting: MeetingRef
}

// `tags` is a correlated subquery so every `FROM entries` read carries them in one round trip.
export const ENTRY_COLUMNS = [
  'id, type, slug, title, body, meeting, object_key, mime, bytes, version, updated_at',
  "(SELECT group_concat(tag, ' ') FROM (SELECT tag FROM entry_tags WHERE entry_id = entries.id ORDER BY tag)) AS tags",
].join(', ')

const slugSet = (rows: readonly { readonly slug: string }[]) => new Set(rows.map((row) => row.slug))

const orNotFound = (ref: EntryId | EntrySlug) =>
  Option.match({
    onNone: () => new EntryNotFound({ ref }),
    onSome: Effect.succeed<Entry>,
  })

const sealPlaintextBodies = Effect.fn('Entries.sealPlaintextBodies')(function* (
  sql: SqlClient.SqlClient,
  cipher: CipherShape,
) {
  const rows = yield* SqlSchema.findAll({
    Request: Schema.Void,
    Result: Schema.Struct({ id: EntryId, body: Schema.String }),
    execute: () => sql`SELECT id, body FROM entries WHERE body NOT LIKE 'enc:v1:%'`,
  })(undefined).pipe(Effect.orDie)

  for (const row of rows) {
    yield* sql`UPDATE entries SET body = ${cipher.seal(row.body)} WHERE id = ${row.id}`.pipe(
      Effect.orDie,
    )
  }

  if (rows.length > 0) {
    yield* Effect.log('sealed plaintext bodies').pipe(Effect.annotateLogs({ count: rows.length }))
  }
})

const queries = (sql: SqlClient.SqlClient, Entry: CipherShape['Entry']) => {
  const columns = sql.literal(ENTRY_COLUMNS)

  const selectByType = flow(
    SqlSchema.findAll({
      Request: Schema.Struct({
        type: EntryType,
        archived: Schema.Boolean,
        tag: Schema.NullOr(Schema.String),
      }),
      Result: Entry,
      execute: ({ type, archived, tag }) => sql`
        SELECT ${columns} FROM entries
        WHERE type = ${type} AND (archived_at IS NOT NULL) = ${archived ? 1 : 0}
          AND (${tag} IS NULL OR id IN (SELECT entry_id FROM entry_tags WHERE tag = ${tag}))
        ORDER BY updated_at DESC
      `,
    }),
    Effect.orDie,
  )

  const selectDistinctTags = flow(
    SqlSchema.findAll({
      Request: Schema.Struct({ type: EntryType, archived: Schema.Boolean }),
      Result: TagCount,
      execute: ({ type, archived }) => sql`
        SELECT tag, count(*) AS count FROM entry_tags
        JOIN entries ON entries.id = entry_tags.entry_id
        WHERE type = ${type} AND (archived_at IS NOT NULL) = ${archived ? 1 : 0}
        GROUP BY tag
        ORDER BY count DESC, tag
      `,
    }),
    Effect.orDie,
  )

  const selectRecent = flow(
    SqlSchema.findAll({
      Request: Schema.Int,
      Result: Entry,
      execute: (limit) => sql`
        SELECT ${columns} FROM entries
        WHERE archived_at IS NULL
        ORDER BY updated_at DESC
        LIMIT ${limit}
      `,
    }),
    Effect.orDie,
  )

  const selectTargets = flow(
    SqlSchema.findAll({
      Request: Schema.Void,
      Result: MentionTarget,
      execute: () => sql`
        SELECT id, slug, title, type, updated_at FROM entries
        WHERE archived_at IS NULL
        ORDER BY updated_at DESC
      `,
    }),
    Effect.orDie,
  )

  const selectExisting = flow(
    SqlSchema.findAll({
      Request: Schema.Array(Schema.String),
      Result: Schema.Struct({ slug: EntrySlug }),
      execute: (slugs) => sql`SELECT slug FROM entries WHERE ${sql.in('slug', slugs)}`,
    }),
    Effect.orDie,
  )

  const selectByEventIds = flow(
    SqlSchema.findAll({
      Request: Schema.Array(Schema.String),
      Result: Entry,
      execute: (eventIds) => sql`
        SELECT ${columns} FROM entries
        WHERE type = 'meeting' AND archived_at IS NULL
          AND json_extract(meeting, '$.eventId') IN ${sql.in(eventIds)}
      `,
    }),
    Effect.orDie,
  )

  const selectBySlug = flow(
    SqlSchema.findOneOption({
      Request: EntrySlug,
      Result: Entry,
      execute: (slug) => sql`SELECT ${columns} FROM entries WHERE slug = ${slug}`,
    }),
    Effect.orDie,
  )

  const selectById = flow(
    SqlSchema.findOneOption({
      Request: EntryId,
      Result: Entry,
      execute: (id) => sql`SELECT ${columns} FROM entries WHERE id = ${id}`,
    }),
    Effect.orDie,
  )

  const selectSlug = flow(
    SqlSchema.findOneOption({
      Request: Schema.String,
      Result: Schema.Struct({ slug: EntrySlug }),
      execute: (slug) => sql`SELECT slug FROM entries WHERE slug = ${slug}`,
    }),
    Effect.orDie,
  )

  return {
    selectByType,
    selectDistinctTags,
    selectRecent,
    selectTargets,
    selectExisting,
    selectByEventIds,
    selectBySlug,
    selectById,
    selectSlug,
  }
}

// Split out of `make` only to keep that function readable; same closure otherwise.
const creators = (
  sql: SqlClient.SqlClient,
  cipher: CipherShape,
  uniqueSlug: (base: string, suffix: string) => Effect.Effect<EntrySlug>,
) => {
  const blank = Effect.fn('Entries.blank')(function* (type: EntryType, title: string) {
    const now = yield* DateTime.now
    const id = entryId(Bun.randomUUIDv7())
    const base = slugify(title)
    const slug = yield* uniqueSlug(base === '' ? type : base, id.slice(-4))

    return {
      id,
      type,
      slug,
      title,
      body: '',
      meeting: null,
      objectKey: null,
      mime: null,
      bytes: null,
      version: 1,
      updatedAt: now,
      tags: [],
    } satisfies Entry
  })

  const insert = Effect.fn('Entries.insert')(function* (entry: Entry) {
    const row = yield* Effect.orDie(Schema.encodeEffect(cipher.Entry)(entry))
    const columns = Struct.omit(row, ['tags'])

    yield* sql`
      INSERT INTO entries ${sql.insert({ ...columns, created_at: row.updated_at })}
    `

    return entry
  })

  const create = Effect.fn('Entries.create')(
    function* (input: EntryCreate) {
      const now = yield* DateTime.now
      const entry = yield* blank(
        input.type,
        Option.getOrElse(input.title, () => timestampTitle(now, input.zone)),
      )

      return yield* insert({ ...entry, meeting: input.meeting ?? null })
    },
    sql.withTransaction,
    Effect.catchTag('SqlError', Effect.die),
  )

  const createArtifact = Effect.fn('Entries.createArtifact')(
    function* (input: ArtifactInput) {
      const entry = yield* blank('artifact', input.title)

      return yield* insert({
        ...entry,
        objectKey: input.objectKey,
        mime: input.mime,
        bytes: input.bytes,
      })
    },
    sql.withTransaction,
    Effect.catchTag('SqlError', Effect.die),
  )

  return { create, createArtifact }
}

export class Entries extends Context.Service<Entries, EntriesShape>()('app/Entries', {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const objects = yield* ObjectStore
    const cipher = yield* Cipher
    const {
      selectByType,
      selectDistinctTags,
      selectRecent,
      selectTargets,
      selectExisting,
      selectByEventIds,
      selectBySlug,
      selectById,
      selectSlug,
    } = queries(sql, cipher.Entry)

    yield* sealPlaintextBodies(sql, cipher)

    const uniqueSlug = Effect.fn('Entries.uniqueSlug')(function* (base: string, suffix: string) {
      const taken = yield* selectSlug(base)

      return Option.match(taken, {
        onNone: () => entrySlug(base),
        onSome: () => entrySlug(`${base}-${suffix}`),
      })
    })

    const list = Effect.fn('Entries.list')(
      (type: EntryType, archived: boolean, tag: Tag | undefined) =>
        selectByType({ type, archived, tag: tag ?? null }),
    )

    const distinctTags = Effect.fn('Entries.distinctTags')((type: EntryType, archived: boolean) =>
      selectDistinctTags({ type, archived }),
    )

    const recent = Effect.fn('Entries.recent')((limit: number) => selectRecent(limit))

    const targets = selectTargets(undefined)

    const existing = flow(selectExisting, Effect.map(slugSet))

    const bySlug = Effect.fn('Entries.bySlug')((slug: EntrySlug) =>
      Effect.flatMap(selectBySlug(slug), orNotFound(slug)),
    )

    const byId = Effect.fn('Entries.byId')((id: EntryId) =>
      Effect.flatMap(selectById(id), orNotFound(id)),
    )

    const byEventIds = Effect.fn('Entries.byEventIds')((eventIds: readonly string[]) =>
      eventIds.length === 0
        ? Effect.succeed(new Map<string, Entry>())
        : Effect.map(
            selectByEventIds(eventIds),
            (rows) =>
              new Map(
                rows.flatMap((row) =>
                  row.meeting?.eventId === undefined ? [] : [[row.meeting.eventId, row] as const],
                ),
              ),
          ),
    )

    const { create, createArtifact } = creators(sql, cipher, uniqueSlug)

    const put = Effect.fn('Entries.put')(
      function* (input: EntryPut) {
        const current = yield* byId(input.id)

        if (current.version === input.expectedVersion) {
          const now = yield* DateTime.now
          const next: Entry = {
            ...current,
            title: input.title,
            body: input.body,
            version: current.version + 1,
            updatedAt: now,
          }

          yield* sql`
            UPDATE entries
            SET title = ${next.title}, body = ${cipher.seal(next.body)}, version = ${next.version},
                updated_at = ${DateTime.formatIso(now)}
            WHERE id = ${next.id} AND version = ${input.expectedVersion}
          `

          return next
        }

        return yield* new VersionConflict({ entry: current })
      },
      sql.withTransaction,
      Effect.catchTag('SqlError', Effect.die),
    )

    // Attaching a calendar event (§3.3): title and snapshot change, slug and body don't.
    const setMeeting = Effect.fn('Entries.setMeeting')(
      function* (input: MeetingPut) {
        const current = yield* byId(input.id)
        const now = yield* DateTime.now
        const next: Entry = {
          ...current,
          title: input.title,
          meeting: input.meeting,
          version: current.version + 1,
          updatedAt: now,
        }
        const row = yield* Effect.orDie(Schema.encodeEffect(cipher.Entry)(next))

        yield* sql`
          UPDATE entries
          SET title = ${row.title}, meeting = ${row.meeting}, version = ${row.version},
              updated_at = ${row.updated_at}
          WHERE id = ${row.id}
        `

        return next
      },
      sql.withTransaction,
      Effect.catchTag('SqlError', Effect.die),
    )

    const setTags = Effect.fn('Entries.setTags')(
      function* (id: EntryId, tags: readonly Tag[]) {
        const current = yield* byId(id)
        const next = [...new Set(tags)].sort()

        yield* sql`DELETE FROM entry_tags WHERE entry_id = ${id}`

        if (next.length > 0) {
          yield* sql`
            INSERT INTO entry_tags ${sql.insert(next.map((tag) => ({ entry_id: id, tag })))}
          `
        }

        return { ...current, tags: next }
      },
      sql.withTransaction,
      Effect.catchTag('SqlError', Effect.die),
    )

    const archive = Effect.fn('Entries.archive')(
      function* (slug: EntrySlug) {
        const entry = yield* bySlug(slug)
        const now = yield* DateTime.now

        yield* sql`
          UPDATE entries SET archived_at = ${DateTime.formatIso(now)} WHERE id = ${entry.id}
        `

        return entry
      },
      sql.withTransaction,
      Effect.catchTag('SqlError', Effect.die),
    )

    const restore = Effect.fn('Entries.restore')(
      function* (slug: EntrySlug) {
        const entry = yield* bySlug(slug)

        yield* sql`UPDATE entries SET archived_at = NULL WHERE id = ${entry.id}`

        return entry
      },
      sql.withTransaction,
      Effect.catchTag('SqlError', Effect.die),
    )

    const remove = Effect.fn('Entries.remove')(
      function* (slug: EntrySlug) {
        const entry = yield* bySlug(slug)

        if (entry.objectKey !== null) {
          yield* objects.remove(entry.objectKey)
        }

        yield* sql`DELETE FROM share_links WHERE entry_id = ${entry.id}`
        yield* sql`DELETE FROM entry_tags WHERE entry_id = ${entry.id}`
        yield* sql`DELETE FROM entries WHERE id = ${entry.id}`

        return entry
      },
      sql.withTransaction,
      Effect.catchTag('SqlError', Effect.die),
    )

    return {
      list,
      distinctTags,
      recent,
      targets,
      existing,
      bySlug,
      byEventIds,
      create,
      createArtifact,
      put,
      setMeeting,
      setTags,
      archive,
      restore,
      remove,
    } satisfies EntriesShape
  }),
}) {
  static readonly layer = Layer.effect(this)(this.make)
}
