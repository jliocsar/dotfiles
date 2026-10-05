import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as HttpServerRequest from 'effect/unstable/http/HttpServerRequest'

import { ZONE_HEADER } from './api.ts'

export const ZONE_COOKIE = 'tz'
export const UTC = DateTime.zoneMakeOffset(0)

export const requestZone = Effect.map(HttpServerRequest.HttpServerRequest, (request) =>
  Option.fromUndefinedOr(request.headers[ZONE_HEADER] ?? request.cookies[ZONE_COOKIE]).pipe(
    Option.flatMap(DateTime.zoneMakeNamed),
    Option.getOrElse((): DateTime.TimeZone => UTC),
  ),
)

export const requestOrigin = Effect.map(HttpServerRequest.HttpServerRequest, (request) => {
  const proto = request.headers['x-forwarded-proto'] ?? 'http'
  const host = request.headers['host'] ?? 'localhost'

  return `${proto}://${host}`
})

export const clock = (at: DateTime.Utc, zone: DateTime.TimeZone) =>
  DateTime.format(DateTime.setZone(at, zone), {
    locale: 'en-GB',
    hour: '2-digit',
    minute: '2-digit',
  })
