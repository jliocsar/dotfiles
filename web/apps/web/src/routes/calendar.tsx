import { randomBytes } from 'node:crypto'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as HttpRouter from 'effect/unstable/http/HttpRouter'
import * as HttpServerRequest from 'effect/unstable/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'

import { EntrySlug, GoogleAccountId } from '../domain.ts'
import { attachMeeting } from '../meetings.ts'
import { MeetingPicker, TodayFragment } from '../pages/Calendar.tsx'
import { page, respond } from '../render.ts'
import { Calendar } from '../services/Calendar.ts'
import { Entries } from '../services/Entries.ts'
import { Google } from '../services/Google.ts'
import { requestOrigin, requestZone } from '../zone.ts'

// Ties the callback to the browser that started the dance (CSRF).
const STATE_COOKIE = 'oauth_state'

const CALLBACK_PATH = '/oauth/google/callback'

const STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/oauth',
  maxAge: '10 minutes',
} as const

const CallbackParams = Schema.Struct({
  code: Schema.optionalKey(Schema.String),
  state: Schema.optionalKey(Schema.String),
  error: Schema.optionalKey(Schema.String),
})

const AccountParams = Schema.Struct({ id: GoogleAccountId })

const EntryParams = Schema.Struct({ slug: EntrySlug })

const AttachForm = Schema.Struct({ eventId: Schema.String })

const REJECTED = 'rejected calendar request'

const seeOther = (location: string) => HttpServerResponse.redirect(location, { status: 303 })

const badRequest = respond(<p>bad request</p>, 400)

const redirectUri = Effect.map(requestOrigin, (origin) => `${origin}${CALLBACK_PATH}`)

const startRoute = Effect.gen(function* () {
  const google = yield* Google
  const state = randomBytes(16).toString('base64url')

  return yield* HttpServerResponse.setCookie(
    seeOther(google.authUrl(yield* redirectUri, state)),
    STATE_COOKIE,
    state,
    STATE_COOKIE_OPTIONS,
  )
}).pipe(Effect.orDie)

const callbackRoute = Effect.gen(function* () {
  const calendar = yield* Calendar
  const request = yield* HttpServerRequest.HttpServerRequest
  const params = yield* HttpServerRequest.schemaSearchParams(CallbackParams)
  const expected = request.cookies[STATE_COOKIE]

  if (params.error !== undefined) {
    yield* Effect.logWarning('google oauth declined', params.error)

    return seeOther('/')
  }

  if (params.code === undefined || expected === undefined || params.state !== expected) {
    return badRequest
  }

  const account = yield* calendar.connect(params.code, yield* redirectUri)

  yield* Effect.log('google account connected').pipe(Effect.annotateLogs({ email: account.email }))

  return yield* HttpServerResponse.expireCookie(seeOther('/'), STATE_COOKIE, STATE_COOKIE_OPTIONS)
}).pipe(
  Effect.tapError((error) => Effect.logWarning(REJECTED, error.message)),
  Effect.orElseSucceed(() => badRequest),
)

const disconnectRoute = Effect.gen(function* () {
  const calendar = yield* Calendar
  const params = yield* HttpRouter.schemaPathParams(AccountParams)

  yield* calendar.disconnect(params.id)

  return seeOther('/')
}).pipe(
  Effect.tapError((error) => Effect.logWarning(REJECTED, error.message)),
  Effect.orElseSucceed(() => badRequest),
)

const todayRoute = Effect.gen(function* () {
  const zone = yield* requestZone

  return yield* page(TodayFragment({ zone }))
})

const pickerRoute = Effect.gen(function* () {
  const entries = yield* Entries
  const params = yield* HttpRouter.schemaPathParams(EntryParams)
  const zone = yield* requestZone
  const entry = yield* entries.bySlug(params.slug)

  return yield* page(MeetingPicker({ entry, zone }))
}).pipe(
  Effect.tapError((error) => Effect.logWarning(REJECTED, error.message)),
  Effect.orElseSucceed(() => badRequest),
)

const attachRoute = Effect.gen(function* () {
  const entries = yield* Entries
  const params = yield* HttpRouter.schemaPathParams(EntryParams)
  const form = yield* HttpServerRequest.schemaBodyUrlParams(AttachForm)
  const zone = yield* requestZone
  const entry = yield* entries.bySlug(params.slug)
  const attached = yield* attachMeeting(entry.id, form.eventId, zone)

  if (Option.isNone(attached)) {
    yield* Effect.logWarning('meeting event not in today', form.eventId)
  }

  return seeOther(`/e/${entry.slug}`)
}).pipe(
  Effect.tapError((error) => Effect.logWarning(REJECTED, error.message)),
  Effect.orElseSucceed(() => badRequest),
)

export const CalendarRoutes = Layer.mergeAll(
  HttpRouter.add('GET', '/oauth/google', startRoute),
  HttpRouter.add('GET', CALLBACK_PATH, callbackRoute),
  HttpRouter.add('POST', '/google/:id/disconnect', disconnectRoute),
  HttpRouter.add('GET', '/calendar/today', todayRoute),
  HttpRouter.add('GET', '/e/:slug/meeting', pickerRoute),
  HttpRouter.add('POST', '/e/:slug/meeting', attachRoute),
)
