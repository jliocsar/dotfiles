import { timingSafeEqual } from 'node:crypto'
import * as Config from 'effect/Config'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Redacted from 'effect/Redacted'

export interface AuthShape {
  readonly login: (password: string) => Effect.Effect<Option.Option<string>>
  readonly verify: (token: string) => Effect.Effect<boolean>
}

export const SESSION_TTL = Duration.days(365)

const FAILED_LOGIN_DELAY = Duration.seconds(2)

const sign = (secret: string, issuedAt: string) =>
  new Bun.CryptoHasher('sha256', secret).update(issuedAt).digest('base64url')

const sameString = (left: string, right: string) => {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)

  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

export class Auth extends Context.Service<Auth, AuthShape>()('app/Auth', {
  make: Effect.gen(function* () {
    const config = yield* Config.all({
      passwordHash: Config.redacted('PASSWORD_HASH'),
      sessionSecret: Config.redacted('SESSION_SECRET'),
    })
    const passwordHash = Redacted.value(config.passwordHash)
    const secret = Redacted.value(config.sessionSecret)

    yield* Effect.promise(() => Bun.password.verify('boot check', passwordHash))

    const issue = Effect.map(DateTime.now, (now) => {
      const issuedAt = DateTime.toEpochMillis(now).toString()

      return `${issuedAt}.${sign(secret, issuedAt)}`
    })

    const login = Effect.fn('Auth.login')(function* (password: string) {
      const matches = yield* Effect.promise(() => Bun.password.verify(password, passwordHash))

      if (matches) {
        return Option.some(yield* issue)
      }

      yield* Effect.sleep(FAILED_LOGIN_DELAY)

      return Option.none()
    })

    const verify = Effect.fn('Auth.verify')(function* (token: string) {
      const dot = token.indexOf('.')

      if (dot < 0) {
        return false
      }

      const issuedAt = token.slice(0, dot)
      const signature = token.slice(dot + 1)

      if (!sameString(signature, sign(secret, issuedAt))) {
        return false
      }

      const now = yield* DateTime.now
      const age = Duration.millis(DateTime.toEpochMillis(now) - Number(issuedAt))

      return Duration.between(age, { minimum: Duration.zero, maximum: SESSION_TTL })
    })

    return { login, verify } satisfies AuthShape
  }),
}) {
  static readonly layer = Layer.effect(this)(this.make)
}
