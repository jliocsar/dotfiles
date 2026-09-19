import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as HttpApiBuilder from 'effect/unstable/httpapi/HttpApiBuilder'

import { Api } from '../api.ts'
import { Entries } from '../services/Entries.ts'
import { Markdown } from '../services/Markdown.ts'
import { ObjectStore } from '../services/ObjectStore.ts'

const EntriesHandlers = HttpApiBuilder.group(
  Api,
  'entries',
  Effect.fn('EntriesHandlers')(function* (handlers) {
    const entries = yield* Entries
    const markdown = yield* Markdown

    return handlers
      .handle('targets', () => entries.targets)
      .handle('save', ({ params, payload }) =>
        Effect.flatMap(
          entries.put({
            id: params.id,
            title: payload.title,
            body: payload.body,
            expectedVersion: payload.version,
          }),
          (entry) =>
            Effect.map(markdown.render(entry.body), (html) => ({ version: entry.version, html })),
        ),
      )
  }),
)

const ArtifactsHandlers = HttpApiBuilder.group(
  Api,
  'artifacts',
  Effect.fn('ArtifactsHandlers')(function* (handlers) {
    const entries = yield* Entries
    const objects = yield* ObjectStore

    // Conflicts are caught before any bytes move; register re-checks and drops late losers' objects.
    return handlers
      .handle('presign', ({ payload }) =>
        Effect.gen(function* () {
          const taken = yield* entries.takenTitles('artifact', payload.titles)
          const skipped = payload.titles.filter((title) => taken.has(title))
          const fresh = payload.titles.filter((title) => !taken.has(title))
          const targets = yield* Effect.forEach(fresh, (title) =>
            Effect.map(objects.newKey, (key) => ({ title, key, url: objects.uploadUrl(key) })),
          )

          return { targets, skipped }
        }),
      )
      .handle('register', ({ payload }) =>
        Effect.gen(function* () {
          const batch = yield* entries.createArtifacts(
            payload.files.map((file) => ({
              objectKey: file.key,
              title: file.title,
              mime: file.mime,
              bytes: file.bytes,
            })),
          )

          yield* Effect.forEach(batch.skipped, (input) => objects.remove(input.objectKey), {
            discard: true,
          })

          return {
            slugs: batch.created.map((entry) => entry.slug),
            skipped: batch.skipped.map((input) => input.title),
          }
        }),
      )
  }),
)

export const ApiRoutes = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(Layer.mergeAll(EntriesHandlers, ArtifactsHandlers)),
)
