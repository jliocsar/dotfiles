import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { flow } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import * as SqlClient from 'effect/unstable/sql/SqlClient'
import * as SqlSchema from 'effect/unstable/sql/SqlSchema'

import { GOOGLE_ACCOUNT_KEYS, googleAccountFields, googleAccountId } from '../domain.ts'
import type { CalendarEvent, GoogleAccount, GoogleAccountId } from '../domain.ts'
import { Cipher } from './Cipher.ts'
import { Google } from './Google.ts'
import type { AccessToken, GoogleError } from './Google.ts'

/**
 * Connected Google accounts and their events. Accounts are ordered by
 * connection time; that order is the §3.2 priority.
 */
export interface CalendarShape {
  readonly accounts: Effect.Effect<readonly GoogleAccount[]>
  readonly connect: (code: string, redirectUri: string) => Effect.Effect<GoogleAccount, GoogleError>
  readonly disconnect: (id: GoogleAccountId) => Effect.Effect<void>
  /** Events across every account in [from, to], sorted by start. A failing account logs and yields nothing. */
  readonly events: (from: DateTime.Utc, to: DateTime.Utc) => Effect.Effect<readonly CalendarEvent[]>
}

const COLUMNS = 'id, email, calendar_ids, refresh_token, created_at'

// Refresh a minute early so a token never expires mid-request.
const TOKEN_SLACK = '1 minute'

export class Calendar extends Context.Service<Calendar, CalendarShape>()('app/Calendar', {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const google = yield* Google
    const cipher = yield* Cipher
    const columns = sql.literal(COLUMNS)
    const Account = Schema.Struct({
      ...googleAccountFields,
      refreshToken: cipher.Sealed,
    }).pipe(Schema.encodeKeys(GOOGLE_ACCOUNT_KEYS))
    // Access tokens live an hour; one process, so a plain map is the cache.
    const tokens = new Map<GoogleAccountId, AccessToken>()

    const selectAll = flow(
      SqlSchema.findAll({
        Request: Schema.Void,
        Result: Account,
        execute: () => sql`SELECT ${columns} FROM google_accounts ORDER BY created_at`,
      }),
      Effect.orDie,
    )

    const accounts = selectAll(undefined)

    const accessToken = Effect.fn('Calendar.accessToken')(function* (account: GoogleAccount) {
      const now = yield* DateTime.now
      const cached = tokens.get(account.id)

      if (
        cached !== undefined &&
        DateTime.toEpochMillis(DateTime.addDuration(now, TOKEN_SLACK)) <
          DateTime.toEpochMillis(cached.expiresAt)
      ) {
        return cached.token
      }

      const fresh = yield* google.refresh(account.refreshToken)

      tokens.set(account.id, fresh)

      return fresh.token
    })

    const connect = Effect.fn('Calendar.connect')(function* (code: string, redirectUri: string) {
      const grant = yield* google.exchange(code, redirectUri)
      const email = yield* google.primaryEmail(grant.token)
      const calendarIds = yield* google.selectedCalendars(grant.token)
      const now = yield* DateTime.now
      const existing = (yield* accounts).find((account) => account.email === email)
      const account: GoogleAccount = {
        id: existing?.id ?? googleAccountId(Bun.randomUUIDv7()),
        email,
        calendarIds: calendarIds.length === 0 ? ['primary'] : calendarIds,
        refreshToken: grant.refreshToken,
        createdAt: existing?.createdAt ?? now,
      }
      const row = yield* Effect.orDie(Schema.encodeEffect(Account)(account))

      // Reconnecting the same email replaces its token instead of adding a duplicate.
      yield* sql`INSERT OR REPLACE INTO google_accounts ${sql.insert(row)}`.pipe(Effect.orDie)

      tokens.set(account.id, grant)

      return account
    })

    const disconnect = Effect.fn('Calendar.disconnect')(function* (id: GoogleAccountId) {
      yield* sql`DELETE FROM google_accounts WHERE id = ${id}`.pipe(Effect.orDie)

      tokens.delete(id)
    })

    const accountEvents = Effect.fn('Calendar.accountEvents')(
      function* (account: GoogleAccount, from: DateTime.Utc, to: DateTime.Utc) {
        const token = yield* accessToken(account)
        const perCalendar = yield* Effect.forEach(
          account.calendarIds,
          (calendarId) => google.events(token, calendarId, from, to),
          { concurrency: 4 },
        )

        return perCalendar.flat().map((event): CalendarEvent => ({
          ...event,
          accountId: account.id,
        }))
      },
      (self, account) =>
        self.pipe(
          Effect.tapError((error) =>
            Effect.logWarning('calendar fetch failed', error.cause).pipe(
              Effect.annotateLogs({ account: account.email }),
            ),
          ),
          Effect.orElseSucceed((): readonly CalendarEvent[] => []),
        ),
    )

    const events = Effect.fn('Calendar.events')(function* (from: DateTime.Utc, to: DateTime.Utc) {
      const connected = yield* accounts
      const perAccount = yield* Effect.forEach(
        connected,
        (account) => accountEvents(account, from, to),
        { concurrency: 'unbounded' },
      )
      // Same event invited to two accounts shows once; the first (highest priority) wins.
      const seen = new Set<string>()

      return perAccount
        .flat()
        .filter((event) => (seen.has(event.id) ? false : (seen.add(event.id), true)))
        .sort(
          (left, right) => DateTime.toEpochMillis(left.start) - DateTime.toEpochMillis(right.start),
        )
    })

    return { accounts, connect, disconnect, events } satisfies CalendarShape
  }),
}) {
  static readonly layer = Layer.effect(this)(this.make).pipe(Layer.provideMerge(Google.layer))
}
