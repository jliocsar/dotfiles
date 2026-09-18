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
  EntryId,
  ShareLink,
  ShareNotFound,
  ShareToken,
  shareLinkId,
  shareToken,
  shareTtlDuration,
} from '../domain.ts'
import type { Entry, ShareLinkId, ShareTtl } from '../domain.ts'
import { Cipher } from './Cipher.ts'
import { ENTRY_COLUMNS } from './Entries.ts'

export interface ShareLinksShape {
  readonly active: (entryId: EntryId) => Effect.Effect<readonly ShareLink[]>
  readonly create: (entryId: EntryId, ttl: ShareTtl) => Effect.Effect<ShareLink>
  readonly revoke: (id: ShareLinkId) => Effect.Effect<void>
  readonly resolve: (token: ShareToken) => Effect.Effect<Entry, ShareNotFound>
}

const TOKEN_BYTES = 16

const newToken = Effect.sync(() =>
  shareToken(
    Buffer.from(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES))).toString('base64url'),
  ),
)

export class ShareLinks extends Context.Service<ShareLinks, ShareLinksShape>()('app/ShareLinks', {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const { Entry } = yield* Cipher
    const columns = sql.literal('id, entry_id, token, expires_at, revoked_at, created_at')
    const entryColumns = sql.literal(ENTRY_COLUMNS)

    const selectActive = flow(
      SqlSchema.findAll({
        Request: Schema.Struct({ entryId: EntryId, now: Schema.String }),
        Result: ShareLink,
        execute: ({ entryId, now }) => sql`
          SELECT ${columns} FROM share_links
          WHERE entry_id = ${entryId} AND revoked_at IS NULL
            AND (expires_at IS NULL OR expires_at > ${now})
          ORDER BY created_at DESC
        `,
      }),
      Effect.orDie,
    )

    const selectShared = flow(
      SqlSchema.findOneOption({
        Request: Schema.Struct({ token: ShareToken, now: Schema.String }),
        Result: Entry,
        execute: ({ token, now }) => sql`
          SELECT ${entryColumns} FROM entries
          WHERE archived_at IS NULL AND id = (
            SELECT entry_id FROM share_links
            WHERE token = ${token} AND revoked_at IS NULL
              AND (expires_at IS NULL OR expires_at > ${now})
          )
        `,
      }),
      Effect.orDie,
    )

    const active = Effect.fn('ShareLinks.active')(function* (entryId: EntryId) {
      const now = yield* DateTime.now

      return yield* selectActive({ entryId, now: DateTime.formatIso(now) })
    })

    const create = Effect.fn('ShareLinks.create')(
      function* (entryId: EntryId, ttl: ShareTtl) {
        const now = yield* DateTime.now
        const link: ShareLink = {
          id: shareLinkId(Bun.randomUUIDv7()),
          entryId,
          token: yield* newToken,
          expiresAt: Option.getOrNull(
            Option.map(shareTtlDuration(ttl), (duration) => DateTime.addDuration(now, duration)),
          ),
          revokedAt: null,
          createdAt: now,
        }
        const row = yield* Effect.orDie(Schema.encodeEffect(ShareLink)(link))

        yield* sql`INSERT INTO share_links ${sql.insert(row)}`

        return link
      },
      Effect.catchTag('SqlError', Effect.die),
    )

    const revoke = Effect.fn('ShareLinks.revoke')(
      function* (id: ShareLinkId) {
        const now = yield* DateTime.now

        yield* sql`
          UPDATE share_links SET revoked_at = ${DateTime.formatIso(now)}
          WHERE id = ${id} AND revoked_at IS NULL
        `
      },
      Effect.catchTag('SqlError', Effect.die),
    )

    const resolve = Effect.fn('ShareLinks.resolve')(function* (token: ShareToken) {
      const now = yield* DateTime.now
      const found = yield* selectShared({
        token,
        now: DateTime.formatIso(now),
      })

      return yield* Option.match(found, {
        onNone: () => new ShareNotFound({ token }),
        onSome: Effect.succeed,
      })
    })

    return { active, create, revoke, resolve } satisfies ShareLinksShape
  }),
}) {
  static readonly layer = Layer.effect(this)(this.make)
}
