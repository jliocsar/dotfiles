import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'
import * as HttpClient from 'effect/unstable/http/HttpClient'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import * as HttpApiClient from 'effect/unstable/httpapi/HttpApiClient'

import { Api, ZONE_HEADER } from '@dotfiles/web/api'

export const Stored = Schema.Struct({ url: Schema.String, token: Schema.String })

export type Stored = typeof Stored.Type

const StoredJson = Schema.fromJsonString(Stored)

export class NotLoggedIn extends Schema.TaggedError<NotLoggedIn>()('NotLoggedIn', {
  message: Schema.String,
}) {}

const CONFIG_FILE_MODE = 0o600
const CONFIG_DIR_MODE = 0o700

export const configPath = Effect.gen(function* () {
  const path = yield* Path.Path
  const home = yield* Config.string('HOME')
  const root = yield* Config.string('XDG_CONFIG_HOME').pipe(
    Config.withDefault(path.join(home, '.config')),
  )

  return path.join(root, 'dotfiles-web', 'config.json')
})

export const readStored = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* configPath

  if (!(yield* Effect.orDie(fs.exists(path)))) {
    return Option.none<Stored>()
  }

  const text = yield* Effect.orDie(fs.readFileString(path))

  return Option.some(yield* Effect.orDie(Schema.decodeEffect(StoredJson)(text)))
})

export const writeStored = Effect.fn('writeStored')(function* (stored: Stored) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const file = yield* configPath
  const json = yield* Effect.orDie(Schema.encodeEffect(StoredJson)(stored))

  yield* Effect.orDie(
    fs.makeDirectory(path.dirname(file), { recursive: true, mode: CONFIG_DIR_MODE }),
  )
  yield* Effect.orDie(fs.writeFileString(file, json, { mode: CONFIG_FILE_MODE }))
  yield* Effect.orDie(fs.chmod(file, CONFIG_FILE_MODE))

  return file
})

export const connection = Effect.gen(function* () {
  const stored = yield* readStored
  const env = yield* Config.all({
    url: Config.option(Config.string('DOTFILES_WEB_URL')),
    token: Config.option(Config.redacted('DOTFILES_WEB_TOKEN')),
  })
  const url = Option.orElse(env.url, () => Option.map(stored, (value) => value.url))
  const token = Option.orElse(
    Option.map(env.token, (value) => Redacted.value(value)),
    () => Option.map(stored, (value) => value.token),
  )

  if (Option.isNone(url) || Option.isNone(token)) {
    return yield* new NotLoggedIn({
      message: 'not logged in; run `dotfiles-web login --url <url>`',
    })
  }

  return { url: url.value, token: token.value }
})

const machineZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export const makeClient = (url: string, token: Option.Option<string>) =>
  HttpApiClient.make(Api, {
    baseUrl: url,
    transformClient: HttpClient.mapRequest((request) => {
      const zoned = HttpClientRequest.setHeader(request, ZONE_HEADER, machineZone())

      return Option.match(token, {
        onNone: () => zoned,
        onSome: (value) => HttpClientRequest.bearerToken(zoned, value),
      })
    }),
  })

export const authedClient = Effect.flatMap(connection, (current) =>
  makeClient(current.url, Option.some(current.token)),
)
