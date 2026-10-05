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

import type { Entry, EntryRef, MeetingRef, Tag } from '../domain.ts'
import {
  EntryId,
  EntryNotFound,
  EntrySlug,
  EntrySummary,
  EntryType,
  MentionTarget,
  TagCount,
  entryId,
  entrySlug,
  timestampTitle,
  VersionConflict,
} from '../domain.ts'
import { parseTasks, serializeTasks } from '../tasks.ts'
import { Cipher } from './Cipher.ts'
import type { CipherShape } from './Cipher.ts'
import { ObjectStore } from './ObjectStore.ts'
import type { ObjectStoreShape } from './ObjectStore.ts'

export interface EntriesShape {
  readonly list: (
    type: EntryType,
    archived: boolean,
    tags: readonly Tag[],
  ) => Effect.Effect<readonly Entry[]>
  readonly distinctTags: (
    type: EntryType | undefined,
    archived: boolean,
  ) => Effect.Effect<readonly TagCount[]>
  readonly recent: (limit: number) => Effect.Effect<readonly Entry[]>
  readonly targets: Effect.Effect<readonly MentionTarget[]>
  readonly existing: (slugs: readonly string[]) => Effect.Effect<ReadonlySet<string>>
  readonly takenTitles: (
    type: EntryType,
    titles: readonly string[],
  ) => Effect.Effect<ReadonlySet<string>>
  readonly bySlug: (slug: EntrySlug) => Effect.Effect<Entry, EntryNotFound>
  readonly byRef: (ref: EntryRef) => Effect.Effect<Entry, EntryNotFound>
  readonly search: (query: EntrySearch) => Effect.Effect<SearchPage>
  readonly usedObjectKeys: (keys: readonly string[]) => Effect.Effect<ReadonlySet<string>>
  readonly byEventIds: (eventIds: readonly string[]) => Effect.Effect<ReadonlyMap<string, Entry>>
  readonly create: (input: EntryCreate) => Effect.Effect<Entry>
  readonly createArtifacts: (inputs: readonly ArtifactInput[]) => Effect.Effect<ArtifactBatch>
  readonly put: (input: EntryPut) => Effect.Effect<Entry, EntryNotFound | VersionConflict>
  readonly setMeeting: (input: MeetingPut) => Effect.Effect<Entry, EntryNotFound>
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

export interface ArtifactBatch {
  readonly created: readonly Entry[]
  readonly skipped: readonly ArtifactInput[]
}

export interface EntryCreate {
  readonly type: EntryType
  readonly title: Option.Option<string>
  readonly zone: DateTime.TimeZone
  readonly body?: string
  readonly meeting?: MeetingRef
}

export interface EntryPut {
  readonly id: EntryId
  readonly title?: string | undefined
  readonly body?: string | undefined
  readonly expectedVersion: number
}

export interface SearchCursor {
  readonly updatedAt: string
  readonly id: EntryId
}

export interface EntrySearch {
  readonly type: EntryType | null
  readonly tag: Tag | null
  readonly archived: boolean
  readonly title: string | null
  readonly limit: number
  readonly after: SearchCursor | null
}

export interface SearchPage {
  readonly entries: readonly EntrySummary[]
  readonly next: SearchCursor | null
}

export interface MeetingPut {
  readonly id: EntryId
  readonly title: string
  readonly meeting: MeetingRef
}

export const ENTRY_COLUMNS = [
  'id, type, slug, title, body, meeting, object_key, mime, bytes, version, updated_at',
  "(SELECT group_concat(tag, ' ') FROM (SELECT tag FROM entry_tags WHERE entry_id = entries.id ORDER BY tag)) AS tags",
].join(', ')

const SUMMARY_COLUMNS = [
  'id, type, slug, title, mime, bytes, updated_at',
  "(SELECT group_concat(tag, ' ') FROM (SELECT tag FROM entry_tags WHERE entry_id = entries.id ORDER BY tag)) AS tags",
].join(', ')

const normaliseBody = (type: EntryType, body: string) =>
  type === 'task' ? serializeTasks(parseTasks(body)) : body

const likePattern = (text: string) => `%${text.replaceAll(/[\\%_]/gu, (match) => `\\${match}`)}%`

const slugSet = (rows: readonly { readonly slug: string }[]) => new Set(rows.map((row) => row.slug))

const titleSet = (rows: readonly { readonly title: string }[]) =>
  new Set(rows.map((row) => row.title))

const orNotFound = (ref: EntryId | EntrySlug | EntryRef) =>
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
        everyTagJson: Schema.String,
      }),
      Result: Entry,
      execute: ({ type, archived, everyTagJson }) => sql`
        SELECT ${columns} FROM entries
        WHERE type = ${type} AND (archived_at IS NOT NULL) = ${archived ? 1 : 0}
          AND (json_array_length(${everyTagJson}) = 0 OR id IN (
            SELECT entry_id FROM entry_tags
            WHERE tag IN (SELECT value FROM json_each(${everyTagJson}))
            GROUP BY entry_id
            HAVING count(*) = json_array_length(${everyTagJson})
          ))
        ORDER BY updated_at DESC
      `,
    }),
    Effect.orDie,
  )

  const selectDistinctTags = flow(
    SqlSchema.findAll({
      Request: Schema.Struct({ type: Schema.NullOr(EntryType), archived: Schema.Boolean }),
      Result: TagCount,
      execute: ({ type, archived }) => sql`
        SELECT tag, count(*) AS count FROM entry_tags
        JOIN entries ON entries.id = entry_tags.entry_id
        WHERE (${type} IS NULL OR type = ${type})
          AND (archived_at IS NOT NULL) = ${archived ? 1 : 0}
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

  const selectTakenTitles = flow(
    SqlSchema.findAll({
      Request: Schema.Struct({ type: EntryType, titles: Schema.Array(Schema.String) }),
      Result: Schema.Struct({ title: Schema.String }),
      execute: ({ type, titles }) => sql`
        SELECT title FROM entries WHERE type = ${type} AND ${sql.in('title', titles)}
      `,
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

  const selectByRef = flow(
    SqlSchema.findOneOption({
      Request: Schema.String,
      Result: Entry,
      execute: (ref) => sql`SELECT ${columns} FROM entries WHERE slug = ${ref} OR id = ${ref}`,
    }),
    Effect.orDie,
  )

  const selectPage = flow(
    SqlSchema.findAll({
      Request: Schema.Struct({
        type: Schema.NullOr(EntryType),
        tag: Schema.NullOr(Schema.String),
        archived: Schema.Boolean,
        title: Schema.NullOr(Schema.String),
        limit: Schema.Int,
        afterUpdatedAt: Schema.NullOr(Schema.String),
        afterId: Schema.NullOr(Schema.String),
      }),
      Result: EntrySummary,
      execute: (query) => sql`
        SELECT ${sql.literal(SUMMARY_COLUMNS)} FROM entries
        WHERE (${query.type} IS NULL OR type = ${query.type})
          AND (archived_at IS NOT NULL) = ${query.archived ? 1 : 0}
          AND (${query.tag} IS NULL OR id IN (SELECT entry_id FROM entry_tags WHERE tag = ${query.tag}))
          AND (${query.title} IS NULL OR title LIKE ${query.title} ESCAPE '\\')
          AND (${query.afterUpdatedAt} IS NULL OR (updated_at, id) < (${query.afterUpdatedAt}, ${query.afterId}))
        ORDER BY updated_at DESC, id DESC
        LIMIT ${query.limit + 1}
      `,
    }),
    Effect.orDie,
  )

  const selectUsedKeys = flow(
    SqlSchema.findAll({
      Request: Schema.Array(Schema.String),
      Result: Schema.Struct({ object_key: Schema.String }),
      execute: (keys) => sql`SELECT object_key FROM entries WHERE ${sql.in('object_key', keys)}`,
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
    selectTakenTitles,
    selectByEventIds,
    selectBySlug,
    selectById,
    selectByRef,
    selectPage,
    selectUsedKeys,
    selectSlug,
  }
}

const creators = (
  sql: SqlClient.SqlClient,
  cipher: CipherShape,
  uniqueSlug: (base: string, suffix: string) => Effect.Effect<EntrySlug>,
  takenTitles: EntriesShape['takenTitles'],
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

      return yield* insert({
        ...entry,
        body: normaliseBody(input.type, input.body ?? ''),
        meeting: input.meeting ?? null,
      })
    },
    sql.withTransaction,
    Effect.catchTag('SqlError', Effect.die),
  )

  const createArtifacts = Effect.fn('Entries.createArtifacts')(
    function* (inputs: readonly ArtifactInput[]) {
      const taken = yield* takenTitles(
        'artifact',
        inputs.map((input) => input.title),
      )
      const skipped = inputs.filter((input) => taken.has(input.title))
      const fresh = inputs.filter((input) => !taken.has(input.title))
      const created = yield* Effect.forEach(fresh, (input) =>
        Effect.flatMap(blank('artifact', input.title), (entry) =>
          insert({ ...entry, objectKey: input.objectKey, mime: input.mime, bytes: input.bytes }),
        ),
      )

      return { created, skipped } satisfies ArtifactBatch
    },
    sql.withTransaction,
    Effect.catchTag('SqlError', Effect.die),
  )

  return { create, createArtifacts }
}

const lifecycle = (
  sql: SqlClient.SqlClient,
  objects: ObjectStoreShape,
  bySlug: EntriesShape['bySlug'],
) => {
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

  return { archive, restore, remove }
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
      selectTakenTitles,
      selectByEventIds,
      selectBySlug,
      selectById,
      selectByRef,
      selectPage,
      selectUsedKeys,
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
      (type: EntryType, archived: boolean, tags: readonly Tag[]) =>
        selectByType({ type, archived, everyTagJson: JSON.stringify(tags) }),
    )

    const distinctTags = Effect.fn('Entries.distinctTags')(
      (type: EntryType | undefined, archived: boolean) =>
        selectDistinctTags({ type: type ?? null, archived }),
    )

    const recent = Effect.fn('Entries.recent')((limit: number) => selectRecent(limit))

    const targets = selectTargets(undefined)

    const existing = flow(selectExisting, Effect.map(slugSet))

    const takenTitles = Effect.fn('Entries.takenTitles')(
      (type: EntryType, titles: readonly string[]) =>
        titles.length === 0
          ? Effect.succeed(new Set<string>())
          : Effect.map(selectTakenTitles({ type, titles }), titleSet),
    )

    const bySlug = Effect.fn('Entries.bySlug')((slug: EntrySlug) =>
      Effect.flatMap(selectBySlug(slug), orNotFound(slug)),
    )

    const byId = Effect.fn('Entries.byId')((id: EntryId) =>
      Effect.flatMap(selectById(id), orNotFound(id)),
    )

    const byRef = Effect.fn('Entries.byRef')((ref: EntryRef) =>
      Effect.flatMap(selectByRef(ref), orNotFound(ref)),
    )

    const search = Effect.fn('Entries.search')(function* (query: EntrySearch) {
      const rows = yield* selectPage({
        type: query.type,
        tag: query.tag,
        archived: query.archived,
        title: query.title === null ? null : likePattern(query.title),
        limit: query.limit,
        afterUpdatedAt: query.after?.updatedAt ?? null,
        afterId: query.after?.id ?? null,
      })
      const entries = rows.slice(0, query.limit)
      const last = entries.at(-1)

      return {
        entries,
        next:
          rows.length > query.limit && last !== undefined
            ? { updatedAt: DateTime.formatIso(last.updatedAt), id: last.id }
            : null,
      } satisfies SearchPage
    })

    const usedObjectKeys = Effect.fn('Entries.usedObjectKeys')((keys: readonly string[]) =>
      keys.length === 0
        ? Effect.succeed(new Set<string>())
        : Effect.map(selectUsedKeys(keys), (rows) => new Set(rows.map((row) => row.object_key))),
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

    const { create, createArtifacts } = creators(sql, cipher, uniqueSlug, takenTitles)

    const put = Effect.fn('Entries.put')(
      function* (input: EntryPut) {
        const current = yield* byId(input.id)

        if (current.version === input.expectedVersion) {
          const now = yield* DateTime.now
          const next: Entry = {
            ...current,
            title: input.title ?? current.title,
            body: input.body === undefined ? current.body : normaliseBody(current.type, input.body),
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

    const { archive, restore, remove } = lifecycle(sql, objects, bySlug)

    return {
      list,
      distinctTags,
      recent,
      targets,
      existing,
      takenTitles,
      bySlug,
      byRef,
      search,
      usedObjectKeys,
      byEventIds,
      create,
      createArtifacts,
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
