import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as HttpRouter from 'effect/unstable/http/HttpRouter'
import * as HttpServerRequest from 'effect/unstable/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'

import { LoginPage } from '../pages/Login.tsx'
import { respond } from '../render.ts'
import { Auth, SESSION_TTL } from '../services/Auth.ts'

const SESSION_COOKIE = 'session'

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
} as const

const Next = Schema.optional(Schema.String)

const LoginForm = Schema.Struct({ password: Schema.String, next: Next })

const NextParams = Schema.Struct({ next: Next })

const seeOther = (location: string) => HttpServerResponse.redirect(location, { status: 303 })

const safeNext = (next: string | undefined) =>
  next !== undefined && next.startsWith('/') && !next.startsWith('//') ? next : '/'

const loginPage = Effect.gen(function* () {
  const params = yield* HttpServerRequest.schemaSearchParams(NextParams)

  return respond(LoginPage({ next: safeNext(params.next), failed: false }), 200)
}).pipe(Effect.orElseSucceed(() => respond(LoginPage({ next: '/', failed: false }), 200)))

const loginSubmit = Effect.gen(function* () {
  const auth = yield* Auth
  const form = yield* HttpServerRequest.schemaBodyUrlParams(LoginForm)
  const next = safeNext(form.next)
  const token = yield* auth.login(form.password)

  return yield* Option.match(token, {
    onNone: () => Effect.succeed(respond(LoginPage({ next, failed: true }), 401)),
    onSome: (value) =>
      HttpServerResponse.setCookie(seeOther(next), SESSION_COOKIE, value, {
        ...COOKIE_OPTIONS,
        maxAge: SESSION_TTL,
      }),
  })
}).pipe(
  Effect.tapError((error) => Effect.logWarning('rejected login request', error.message)),
  Effect.orElseSucceed(() => respond(LoginPage({ next: '/', failed: false }), 400)),
)

const logout = HttpServerResponse.expireCookie(
  seeOther('/login'),
  SESSION_COOKIE,
  COOKIE_OPTIONS,
).pipe(Effect.orDie)

export const AuthRoutes = Layer.mergeAll(
  HttpRouter.add('GET', '/login', loginPage),
  HttpRouter.add('POST', '/login', loginSubmit),
  HttpRouter.add('POST', '/logout', logout),
)

export const SessionGate = HttpRouter.middleware(
  Effect.gen(function* () {
    const auth = yield* Auth

    return (handler) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const valid = yield* Option.match(Option.fromUndefinedOr(request.cookies[SESSION_COOKIE]), {
          onNone: () => Effect.succeed(false),
          onSome: auth.verify,
        })

        if (valid) {
          return yield* handler
        }

        if (request.url.startsWith('/api/')) {
          return HttpServerResponse.empty({ status: 401 })
        }

        return seeOther(`/login?next=${encodeURIComponent(request.url)}`)
      })
  }),
).layer
