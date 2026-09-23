import { afterAll, describe, expect, test } from 'bun:test'
import { BunHttpServer } from '@effect/platform-bun'
import * as ConfigProvider from 'effect/ConfigProvider'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as HttpClient from 'effect/unstable/http/HttpClient'
import * as HttpClientError from 'effect/unstable/http/HttpClientError'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import * as HttpRouter from 'effect/unstable/http/HttpRouter'
import * as HttpApiClient from 'effect/unstable/httpapi/HttpApiClient'

import { Api } from './api.ts'
import { EntryNotFound, WrongPassword, entryRef } from './domain.ts'
import { ApiRoutes } from './routes/api.ts'
import { SessionGate } from './routes/auth.tsx'
import { Auth } from './services/Auth.ts'
import { Calendar } from './services/Calendar.ts'
import { Cipher } from './services/Cipher.ts'
import { DatabaseLayer } from './services/Database.ts'
import { Entries } from './services/Entries.ts'
import { Markdown } from './services/Markdown.ts'
import type { ObjectHead } from './services/ObjectStore.ts'
import { ObjectStore } from './services/ObjectStore.ts'
import { ShareLinks } from './services/ShareLinks.ts'

const PASSWORD = Bun.randomUUIDv7()

const UNAUTHORIZED = 401

const bucket = new Map<string, ObjectHead>()

const FakeObjectStore = Layer.succeed(ObjectStore)({
  newKey: Effect.sync(() => `artifacts/${Bun.randomUUIDv7()}`),
  uploadUrl: (key) => `https://bucket.test/${key}?put`,
  downloadUrl: (key) => `https://bucket.test/${key}?get`,
  remove: (key) => Effect.sync(() => void bucket.delete(key)),
  head: (key) => Effect.sync(() => Option.fromUndefinedOr(bucket.get(key))),
  upload: () => Effect.die('unused'),
})

const FakeCalendar = Layer.succeed(Calendar)({
  accounts: Effect.succeed([]),
  connect: () => Effect.die('unused'),
  disconnect: () => Effect.void,
  events: () => Effect.succeed([]),
})

const TestConfig = ConfigProvider.layer(
  ConfigProvider.fromUnknown({
    PASSWORD_HASH: Bun.password.hashSync(PASSWORD),
    SESSION_SECRET: 'test-secret',
    ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    DATABASE_PATH: ':memory:',
  }),
)

const Storage = Layer.mergeAll(DatabaseLayer, Cipher.layer, FakeObjectStore)

const Services = Layer.mergeAll(
  Auth.layer,
  Markdown.layer.pipe(Layer.provideMerge(Entries.layer)),
  ShareLinks.layer,
  FakeCalendar,
).pipe(Layer.provideMerge(Storage))

const GatedApi = ApiRoutes.pipe(Layer.provide(SessionGate))

const App = HttpRouter.serve(GatedApi, { disableListenLog: true, disableLogger: true }).pipe(
  Layer.provide(Services),
)

const TestServer = App.pipe(Layer.provideMerge(BunHttpServer.layerTest))

const runtime = ManagedRuntime.make(TestServer.pipe(Layer.provide(TestConfig)))

const run = <Success, Failure>(effect: Effect.Effect<Success, Failure, HttpClient.HttpClient>) =>
  runtime.runPromise(effect)

const anonymous = HttpApiClient.make(Api)

const authed = Effect.gen(function* () {
  const client = yield* anonymous
  const { token } = yield* client.auth.login({ payload: { password: PASSWORD } })

  return yield* HttpApiClient.make(Api, {
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
  })
})

const responseStatus = (error: HttpClientError.HttpClientError) =>
  Match.value(error.reason).pipe(
    Match.tag('StatusCodeError', 'DecodeError', 'EmptyBodyError', (reason) =>
      Option.some(reason.response.status),
    ),
    Match.orElse(() => Option.none<number>()),
  )

afterAll(() => runtime.dispose())

describe('auth', () => {
  test('no bearer is a 401', () =>
    run(
      Effect.gen(function* () {
        const client = yield* anonymous
        const error = yield* Effect.flip(client.tags.list({ query: {} }))
        const status = HttpClientError.isHttpClientError(error)
          ? responseStatus(error)
          : Option.none()

        expect(Option.getOrNull(status)).toBe(UNAUTHORIZED)
      }),
    ))

  test('a wrong password is WrongPassword', () =>
    run(
      Effect.gen(function* () {
        const client = yield* anonymous
        const error = yield* Effect.flip(client.auth.login({ payload: { password: 'no' } }))

        expect(error).toBeInstanceOf(WrongPassword)
      }),
    ))
})

describe('entries', () => {
  test('create, get by slug or id, list', () =>
    run(
      Effect.gen(function* () {
        const client = yield* authed
        const created = yield* client.entries.create({
          payload: { type: 'note', title: 'Hello world', body: 'first' },
        })
        const bySlug = yield* client.entries.get({ params: { ref: entryRef(created.slug) } })
        const byId = yield* client.entries.get({ params: { ref: entryRef(created.id) } })
        const listed = yield* client.entries.list({ query: { type: 'note', title: 'hello' } })

        expect(String(created.slug)).toBe('hello-world')
        expect(bySlug.entry.body).toBe('first')
        expect(byId.entry.id).toBe(created.id)
        expect(listed.entries.map((entry) => String(entry.slug))).toContain('hello-world')
      }),
    ))

  test('partial put keeps the other field; a stale version conflicts', () =>
    run(
      Effect.gen(function* () {
        const client = yield* authed
        const created = yield* client.entries.create({
          payload: { type: 'note', title: 'Partial', body: 'kept' },
        })
        const saved = yield* client.entries.save({
          params: { id: created.id },
          payload: { title: 'Renamed', version: created.version },
        })
        const after = yield* client.entries.get({ params: { ref: entryRef(created.id) } })
        const conflictVersion = yield* client.entries
          .save({ params: { id: created.id }, payload: { body: 'lost', version: created.version } })
          .pipe(
            Effect.as(Option.none<number>()),
            Effect.catchTag('VersionConflict', (conflict) =>
              Effect.succeed(Option.some(conflict.entry.version)),
            ),
          )

        expect(saved.version).toBe(2)
        expect(after.entry.title).toBe('Renamed')
        expect(after.entry.body).toBe('kept')
        expect(Option.getOrNull(conflictVersion)).toBe(2)
      }),
    ))

  test('task bodies are normalised', () =>
    run(
      Effect.gen(function* () {
        const client = yield* authed
        const created = yield* client.entries.create({
          payload: { type: 'task', body: 'buy milk\n* [X] call mum\n' },
        })

        expect(created.body).toBe('- [ ] buy milk\n- [x] call mum')
      }),
    ))

  test('archive moves it to the archived list', () =>
    run(
      Effect.gen(function* () {
        const client = yield* authed
        const created = yield* client.entries.create({
          payload: { type: 'note', title: 'Old news' },
        })

        yield* client.entries.archive({ params: { ref: entryRef(created.slug) } })

        const live = yield* client.entries.list({ query: { title: 'old news' } })
        const archived = yield* client.entries.list({
          query: { title: 'old news', archived: 'true' },
        })

        expect(live.entries).toHaveLength(0)
        expect(archived.entries.map((entry) => String(entry.slug))).toEqual(['old-news'])
      }),
    ))

  test('list pages with a cursor', () =>
    run(
      Effect.gen(function* () {
        const client = yield* authed

        yield* client.entries.create({ payload: { type: 'note', title: 'Paged one' } })
        yield* client.entries.create({ payload: { type: 'note', title: 'Paged two' } })

        const first = yield* client.entries.list({ query: { title: 'paged', limit: 1 } })
        const second = yield* client.entries.list({
          query:
            first.cursor === null
              ? { title: 'paged', limit: 1 }
              : { title: 'paged', limit: 1, cursor: first.cursor },
        })
        const titles = [...first.entries, ...second.entries].map((entry) => entry.title)

        expect(first.cursor).not.toBeNull()
        expect(second.cursor).toBeNull()
        expect(titles).toEqual(['Paged two', 'Paged one'])
      }),
    ))

  test('unknown ref is EntryNotFound', () =>
    run(
      Effect.gen(function* () {
        const client = yield* authed
        const error = yield* Effect.flip(client.entries.get({ params: { ref: entryRef('nope') } }))

        expect(error).toBeInstanceOf(EntryNotFound)
      }),
    ))
})

describe('artifacts', () => {
  test('register takes only fresh artifact keys, typed by the bucket', () =>
    run(
      Effect.gen(function* () {
        const client = yield* authed
        const presigned = yield* client.artifacts.presign({ payload: { titles: ['report.pdf'] } })
        const [target] = presigned.targets

        if (target === undefined) {
          return yield* Effect.die('no presign target')
        }

        bucket.set(target.key, { bytes: 42, mime: '' })
        bucket.set('backups/app.db', { bytes: 1, mime: 'application/x-sqlite3' })

        const registered = yield* client.artifacts.register({
          payload: {
            files: [
              { key: target.key, title: 'report.pdf' },
              { key: 'backups/app.db', title: 'stolen.db' },
              { key: 'artifacts/never-uploaded', title: 'ghost.txt' },
            ],
          },
        })
        const reused = yield* client.artifacts.register({
          payload: { files: [{ key: target.key, title: 'again.pdf' }] },
        })
        const detail = yield* client.entries.get({ params: { ref: entryRef('report-pdf') } })

        expect(registered.slugs.map(String)).toEqual(['report-pdf'])
        expect(registered.rejected).toEqual(['stolen.db', 'ghost.txt'])
        expect(reused.rejected).toEqual(['again.pdf'])
        expect(detail.entry.bytes).toBe(42)
        expect(detail.entry.mime).toBe('application/pdf')
        expect(bucket.has('backups/app.db')).toBe(true)

        return undefined
      }),
    ))
})
