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

    return handlers
      .handle('presign', () =>
        Effect.map(objects.newKey, (key) => ({ key, url: objects.uploadUrl(key) })),
      )
      .handle('register', ({ payload }) =>
        Effect.map(
          entries.createArtifact({
            objectKey: payload.key,
            title: payload.title,
            mime: payload.mime,
            bytes: payload.bytes,
          }),
          (entry) => ({ slug: entry.slug }),
        ),
      )
  }),
)

export const ApiRoutes = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(Layer.mergeAll(EntriesHandlers, ArtifactsHandlers)),
)
