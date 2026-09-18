import * as Config from 'effect/Config'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { flow } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'
import * as FetchHttpClient from 'effect/unstable/http/FetchHttpClient'
import * as HttpClient from 'effect/unstable/http/HttpClient'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import * as HttpClientResponse from 'effect/unstable/http/HttpClientResponse'

import type { Attendee } from '../domain.ts'

/**
 * Raw Google OAuth + Calendar REST. Knows nothing about accounts or the
 * database; Calendar.ts owns those. Every call takes the token it needs.
 */
export interface GoogleShape {
  readonly authUrl: (redirectUri: string, state: string) => string
  readonly exchange: (code: string, redirectUri: string) => Effect.Effect<Grant, GoogleError>
  readonly refresh: (refreshToken: string) => Effect.Effect<AccessToken, GoogleError>
  readonly primaryEmail: (accessToken: string) => Effect.Effect<string, GoogleError>
  readonly selectedCalendars: (accessToken: string) => Effect.Effect<readonly string[], GoogleError>
  readonly events: (
    accessToken: string,
    calendarId: string,
    from: DateTime.Utc,
    to: DateTime.Utc,
  ) => Effect.Effect<readonly GoogleEvent[], GoogleError>
}

export interface AccessToken {
  readonly token: string
  readonly expiresAt: DateTime.Utc
}

export interface Grant extends AccessToken {
  readonly refreshToken: string
}

/** A timed (non all-day, not cancelled, not declined) event, times still in Google's shape. */
export interface GoogleEvent {
  readonly id: string
  readonly title: string
  readonly start: DateTime.Utc
  readonly end: DateTime.Utc
  readonly attendees: readonly Attendee[]
  readonly link: string | undefined
}

export class GoogleError extends Schema.TaggedError<GoogleError>()('GoogleError', {
  cause: Schema.Unknown,
}) {}

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'

const CALENDAR_URL = 'https://www.googleapis.com/calendar/v3'

const TokenResponse = Schema.Struct({
  access_token: Schema.String,
  expires_in: Schema.Number,
  refresh_token: Schema.optionalKey(Schema.String),
})

const CalendarResponse = Schema.Struct({ id: Schema.String })

const CalendarListResponse = Schema.Struct({
  items: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        id: Schema.String,
        selected: Schema.optionalKey(Schema.Boolean),
      }),
    ),
  ),
})

const EventTime = Schema.Struct({
  dateTime: Schema.optionalKey(Schema.String),
})

const EventAttendee = Schema.Struct({
  email: Schema.String,
  displayName: Schema.optionalKey(Schema.String),
  self: Schema.optionalKey(Schema.Boolean),
  responseStatus: Schema.optionalKey(Schema.String),
  resource: Schema.optionalKey(Schema.Boolean),
})

const EventsResponse = Schema.Struct({
  items: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        id: Schema.String,
        status: Schema.optionalKey(Schema.String),
        summary: Schema.optionalKey(Schema.String),
        start: EventTime,
        end: EventTime,
        attendees: Schema.optionalKey(Schema.Array(EventAttendee)),
        hangoutLink: Schema.optionalKey(Schema.String),
        location: Schema.optionalKey(Schema.String),
      }),
    ),
  ),
})

type RawEvent = NonNullable<typeof EventsResponse.Type.items>[number]

const declined = (event: RawEvent) =>
  event.attendees?.some(
    (attendee) => attendee.self === true && attendee.responseStatus === 'declined',
  ) === true

const linkOf = (event: RawEvent) => {
  if (event.hangoutLink !== undefined) {
    return event.hangoutLink
  }

  return event.location?.startsWith('https://') === true ? event.location : undefined
}

const attendeesOf = (event: RawEvent): readonly Attendee[] =>
  (event.attendees ?? [])
    .filter((attendee) => attendee.resource !== true)
    .map((attendee) => ({
      email: attendee.email,
      ...(attendee.displayName === undefined ? {} : { name: attendee.displayName }),
    }))

// All-day events have `date` instead of `dateTime`; those are skipped on purpose (§3.2).
const normalise = (event: RawEvent): GoogleEvent | undefined => {
  if (event.status === 'cancelled' || declined(event)) {
    return undefined
  }

  if (event.start.dateTime === undefined || event.end.dateTime === undefined) {
    return undefined
  }

  return {
    id: event.id,
    title: event.summary ?? '(No title)',
    start: DateTime.makeUnsafe(event.start.dateTime),
    end: DateTime.makeUnsafe(event.end.dateTime),
    attendees: attendeesOf(event),
    link: linkOf(event),
  }
}

const isEvent = (event: GoogleEvent | undefined): event is GoogleEvent => event !== undefined

const expiry = (expiresIn: number) =>
  Effect.map(DateTime.now, (now) => DateTime.addDuration(now, `${expiresIn} seconds`))

export class Google extends Context.Service<Google, GoogleShape>()('app/Google', {
  make: Effect.gen(function* () {
    const config = yield* Config.all({
      clientId: Config.string('GOOGLE_CLIENT_ID'),
      clientSecret: Config.redacted('GOOGLE_CLIENT_SECRET'),
    })
    const clientSecret = Redacted.value(config.clientSecret)
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest(HttpClientRequest.acceptJson),
      HttpClient.filterStatusOk,
    )

    const failed = (cause: unknown) => new GoogleError({ cause })

    const authUrl = (redirectUri: string, state: string) => {
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPE,
        access_type: 'offline',
        prompt: 'consent',
        state,
      })

      return `${AUTH_URL}?${params}`
    }

    const token = flow(
      (grant: Record<string, string>) =>
        client.execute(
          HttpClientRequest.post(TOKEN_URL).pipe(
            HttpClientRequest.bodyUrlParams({
              client_id: config.clientId,
              client_secret: clientSecret,
              ...grant,
            }),
          ),
        ),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(TokenResponse)),
      Effect.mapError(failed),
    )

    const exchange = Effect.fn('Google.exchange')(function* (code: string, redirectUri: string) {
      const granted = yield* token({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      })

      if (granted.refresh_token === undefined) {
        return yield* failed('Google did not return a refresh token')
      }

      return {
        token: granted.access_token,
        expiresAt: yield* expiry(granted.expires_in),
        refreshToken: granted.refresh_token,
      } satisfies Grant
    })

    const refresh = Effect.fn('Google.refresh')(function* (refreshToken: string) {
      const granted = yield* token({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      })

      return {
        token: granted.access_token,
        expiresAt: yield* expiry(granted.expires_in),
      } satisfies AccessToken
    })

    const calendarGet = (accessToken: string, path: string, params: Record<string, string>) =>
      client
        .execute(
          HttpClientRequest.get(`${CALENDAR_URL}${path}`).pipe(
            HttpClientRequest.bearerToken(accessToken),
            HttpClientRequest.setUrlParams(params),
          ),
        )
        .pipe(Effect.mapError(failed))

    // The primary calendar's id is the account's email; saves asking for an email scope.
    const primaryEmail = Effect.fn('Google.primaryEmail')((accessToken: string) =>
      calendarGet(accessToken, '/calendars/primary', {}).pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(CalendarResponse)),
        Effect.mapError(failed),
        Effect.map((calendar) => calendar.id),
      ),
    )

    const selectedCalendars = Effect.fn('Google.selectedCalendars')((accessToken: string) =>
      calendarGet(accessToken, '/users/me/calendarList', {
        minAccessRole: 'reader',
      }).pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(CalendarListResponse)),
        Effect.mapError(failed),
        Effect.map((list) =>
          (list.items ?? []).filter((item) => item.selected === true).map((item) => item.id),
        ),
      ),
    )

    const events = Effect.fn('Google.events')(
      (accessToken: string, calendarId: string, from: DateTime.Utc, to: DateTime.Utc) =>
        calendarGet(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
          singleEvents: 'true',
          orderBy: 'startTime',
          timeMin: DateTime.formatIso(from),
          timeMax: DateTime.formatIso(to),
          maxResults: '50',
        }).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(EventsResponse)),
          Effect.mapError(failed),
          Effect.map((page) => (page.items ?? []).map(normalise).filter(isEvent)),
        ),
    )

    return {
      authUrl,
      exchange,
      refresh,
      primaryEmail,
      selectedCalendars,
      events,
    } satisfies GoogleShape
  }),
}) {
  static readonly layer = Layer.effect(this)(this.make).pipe(Layer.provide(FetchHttpClient.layer))
}
