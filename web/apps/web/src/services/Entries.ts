import slugify from '@sindresorhus/slugify'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { flow } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as SqlClient from 'effect/unstable/sql/SqlClient'
import * as SqlSchema from 'effect/unstable/sql/SqlSchema'

import {
  Entry,
  EntryId,
  EntryNotFound,
  EntrySlug,
  EntryType,
  MentionTarget,
  entryId,
  entrySlug,
  VersionConflict,
} from '../domain.ts'
import { ObjectStore } from './ObjectStore.ts'

export interface EntriesShape {
  readonly list: (type: EntryType, archived: boolean) => Effect.Effect<readonly Entry[]>
  readonly recent: (limit: number) => Effect.Effect<readonly Entry[]>
  readonly targets: Effect.Effect<readonly MentionTarget[]>
  readonly existing: (slugs: readonly string[]) => Effect.Effect<ReadonlySet<string>>
  readonly bySlug: (slug: EntrySlug) => Effect.Effect<Entry, EntryNotFound>
  readonly create: (type: EntryType, title: Option.Option<string>) => Effect.Effect<Entry>
  readonly createArtifact: (input: ArtifactInput) => Effect.Effect<Entry>
  readonly put: (input: EntryPut) => Effect.Effect<Entry, EntryNotFound | VersionConflict>
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

export interface EntryPut {
  readonly id: EntryId
  readonly title: string
  readonly body: string
  readonly expectedVersion: number
}

export const ENTRY_COLUMNS =
  'id, type, slug, title, body, object_key, mime, bytes, version, updated_at'

const slugSet = (rows: readonly { readonly slug: string }[]) => new Set(rows.map((row) => row.slug))

const orNotFound = (ref: EntryId | EntrySlug) =>
  Option.match({
    onNone: () => new EntryNotFound({ ref }),
    onSome: Effect.succeed<Entry>,
  })

const pad = (value: number) => value.toString().padStart(2, '0')

const timestampTitle = (at: Date) =>
  `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ` +
  `${pad(at.getHours())}:${pad(at.getMinutes())}`

const queries = (sql: SqlClient.SqlClient) => {
  const columns = sql.literal(ENTRY_COLUMNS)

  const selectByType = flow(
    SqlSchema.findAll({
      Request: Schema.Struct({ type: EntryType, archived: Schema.Boolean }),
      Result: Entry,
      execute: ({ type, archived }) => sql`
        SELECT ${columns} FROM entries
        WHERE type = ${type} AND (archived_at IS NOT NULL) = ${archived ? 1 : 0}
        ORDER BY updated_at DESC
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
    selectRecent,
    selectTargets,
    selectExisting,
    selectBySlug,
    selectById,
    selectSlug,
  }
}

export class Entries extends Context.Service<Entries, EntriesShape>()('app/Entries', {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const objects = yield* ObjectStore
    const {
      selectByType,
      selectRecent,
      selectTargets,
      selectExisting,
      selectBySlug,
      selectById,
      selectSlug,
    } = queries(sql)

    const uniqueSlug = Effect.fn('Entries.uniqueSlug')(function* (base: string, suffix: string) {
      const taken = yield* selectSlug(base)

      return Option.match(taken, {
        onNone: () => entrySlug(base),
        onSome: () => entrySlug(`${base}-${suffix}`),
      })
    })

    const list = Effect.fn('Entries.list')((type: EntryType, archived: boolean) =>
      selectByType({ type, archived }),
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
        objectKey: null,
        mime: null,
        bytes: null,
        version: 1,
        updatedAt: now,
      } satisfies Entry
    })

    const insert = Effect.fn('Entries.insert')(function* (entry: Entry) {
      const row = yield* Effect.orDie(Schema.encodeEffect(Entry)(entry))

      yield* sql`
        INSERT INTO entries ${sql.insert({ ...row, created_at: row.updated_at })}
      `

      return entry
    })

    const create = Effect.fn('Entries.create')(
      function* (type: EntryType, title: Option.Option<string>) {
        const now = yield* DateTime.now
        const entry = yield* blank(
          type,
          Option.getOrElse(title, () => timestampTitle(DateTime.toDate(now))),
        )

        return yield* insert(entry)
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
            SET title = ${next.title}, body = ${next.body}, version = ${next.version},
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
        yield* sql`DELETE FROM entries WHERE id = ${entry.id}`

        return entry
      },
      sql.withTransaction,
      Effect.catchTag('SqlError', Effect.die),
    )

    return {
      list,
      recent,
      targets,
      existing,
      bySlug,
      create,
      createArtifact,
      put,
      archive,
      restore,
      remove,
    } satisfies EntriesShape
  }),
}) {
  static readonly layer = Layer.effect(this)(this.make)
}
