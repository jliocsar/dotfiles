import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as HttpApiBuilder from 'effect/unstable/httpapi/HttpApiBuilder'

import { Api, LIST_LIMIT_DEFAULT } from '../api.ts'
import { artifactFile, contentDisposition } from '../artifacts.ts'
import { EventNotFound, NotAnArtifact, WrongPassword } from '../domain.ts'
import type { ShareLink } from '../domain.ts'
import { attachMeeting, newMeetingNote, todaysSlots } from '../meetings.ts'
import { Auth } from '../services/Auth.ts'
import { Entries } from '../services/Entries.ts'
import type { ArtifactInput } from '../services/Entries.ts'
import { Markdown } from '../services/Markdown.ts'
import { ARTIFACT_PREFIX, ObjectStore } from '../services/ObjectStore.ts'
import { ShareLinks } from '../services/ShareLinks.ts'
import { requestOrigin, requestZone } from '../zone.ts'

const FALLBACK_MIME = 'application/octet-stream'

const mimeOf = (stored: string, title: string) =>
  stored === '' || stored === FALLBACK_MIME ? Bun.file(title).type || FALLBACK_MIME : stored

const shareView = (origin: string) => (link: ShareLink) => ({
  id: link.id,
  url: `${origin}/s/${link.token}`,
  expiresAt: link.expiresAt,
})

const AuthHandlers = HttpApiBuilder.group(
  Api,
  'auth',
  Effect.fn('AuthHandlers')(function* (handlers) {
    const auth = yield* Auth

    return handlers.handle('login', ({ payload }) =>
      Effect.flatMap(
        auth.login(payload.password),
        Option.match({
          onNone: () => Effect.fail(new WrongPassword()),
          onSome: (token) => Effect.succeed({ token }),
        }),
      ),
    )
  }),
)

const EntriesHandlers = HttpApiBuilder.group(
  Api,
  'entries',
  Effect.fn('EntriesHandlers')(function* (handlers) {
    const entries = yield* Entries
    const markdown = yield* Markdown
    const objects = yield* ObjectStore
    const shares = yield* ShareLinks

    return handlers
      .handle('targets', () => entries.targets)
      .handle('list', ({ query }) =>
        Effect.map(
          entries.search({
            type: query.type ?? null,
            tag: query.tag ?? null,
            archived: query.archived === 'true',
            title: query.title ?? null,
            limit: query.limit ?? LIST_LIMIT_DEFAULT,
            after: query.cursor ?? null,
          }),
          (page) => ({ entries: page.entries, cursor: page.next }),
        ),
      )
      .handle('create', ({ payload }) =>
        Effect.flatMap(requestZone, (zone) =>
          entries.create({
            type: payload.type,
            title: Option.fromUndefinedOr(payload.title),
            zone,
            body: payload.body ?? '',
          }),
        ),
      )
      .handle('get', ({ params }) =>
        Effect.gen(function* () {
          const entry = yield* entries.byRef(params.ref)
          const file = artifactFile(entry)

          if (file === undefined) {
            return { entry, url: null, shares: [] }
          }

          const origin = yield* requestOrigin
          const links = yield* shares.active(entry.id)

          return {
            entry,
            url: objects.downloadUrl(
              file.objectKey,
              file.mime,
              contentDisposition(file.mime, entry.title, true),
            ),
            shares: links.map(shareView(origin)),
          }
        }),
      )
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
      .handle('setTags', ({ params, payload }) =>
        Effect.flatMap(entries.byRef(params.ref), (entry) =>
          entries.setTags(entry.id, payload.tags),
        ),
      )
      .handle('archive', ({ params }) =>
        Effect.flatMap(entries.byRef(params.ref), (entry) => entries.archive(entry.slug)),
      )
      .handle('restore', ({ params }) =>
        Effect.flatMap(entries.byRef(params.ref), (entry) => entries.restore(entry.slug)),
      )
      .handle('attach', ({ params, payload }) =>
        Effect.gen(function* () {
          const entry = yield* entries.byRef(params.ref)
          const zone = yield* requestZone
          const attached = yield* attachMeeting(entry.id, payload.eventId, zone)

          return yield* Option.match(attached, {
            onNone: () => Effect.fail(new EventNotFound({ eventId: payload.eventId })),
            onSome: Effect.succeed,
          })
        }),
      )
  }),
)

const TagsHandlers = HttpApiBuilder.group(
  Api,
  'tags',
  Effect.fn('TagsHandlers')(function* (handlers) {
    const entries = yield* Entries

    return handlers.handle('list', ({ query }) => entries.distinctTags(query.type, false))
  }),
)

const MeetingsHandlers = HttpApiBuilder.group(
  Api,
  'meetings',
  Effect.fn('MeetingsHandlers')(function* (handlers) {
    return handlers
      .handle('today', () =>
        Effect.flatMap(requestZone, todaysSlots).pipe(
          Effect.map((slots) =>
            slots.map((slot) => ({
              event: { ...slot.event, link: slot.event.link ?? null },
              note: slot.note?.slug ?? null,
            })),
          ),
        ),
      )
      .handle('start', () => Effect.flatMap(requestZone, newMeetingNote))
  }),
)

const ArtifactsHandlers = HttpApiBuilder.group(
  Api,
  'artifacts',
  Effect.fn('ArtifactsHandlers')(function* (handlers) {
    const entries = yield* Entries
    const objects = yield* ObjectStore
    const shares = yield* ShareLinks

    const inspect = Effect.fn('ArtifactsHandlers.inspect')(function* (
      files: readonly { readonly key: string; readonly title: string }[],
    ) {
      const used = new Set(yield* entries.usedObjectKeys(files.map((file) => file.key)))
      const accepted: ArtifactInput[] = []
      const rejected: string[] = []

      for (const file of files) {
        const fresh = file.key.startsWith(ARTIFACT_PREFIX) && !used.has(file.key)
        const head = fresh ? yield* objects.head(file.key) : Option.none()

        if (Option.isSome(head)) {
          used.add(file.key)
          accepted.push({
            objectKey: file.key,
            title: file.title,
            mime: mimeOf(head.value.mime, file.title),
            bytes: head.value.bytes,
          })
        } else {
          rejected.push(file.title)
        }
      }

      return { accepted, rejected }
    })

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
          const { accepted, rejected } = yield* inspect(payload.files)
          const batch = yield* entries.createArtifacts(accepted)

          yield* Effect.forEach(batch.skipped, (input) => objects.remove(input.objectKey), {
            discard: true,
          })

          return {
            slugs: batch.created.map((entry) => entry.slug),
            skipped: batch.skipped.map((input) => input.title),
            rejected,
          }
        }),
      )
      .handle('share', ({ params, payload }) =>
        Effect.gen(function* () {
          const entry = yield* entries.byRef(params.ref)

          if (entry.type !== 'artifact') {
            return yield* new NotAnArtifact({ ref: params.ref })
          }

          const link = yield* shares.create(entry.id, payload.ttl)

          return shareView(yield* requestOrigin)(link)
        }),
      )
      .handle('unshare', ({ params }) => shares.revoke(params.id))
  }),
)

export const ApiRoutes = HttpApiBuilder.layer(Api).pipe(
  Layer.provide(
    Layer.mergeAll(
      AuthHandlers,
      EntriesHandlers,
      TagsHandlers,
      MeetingsHandlers,
      ArtifactsHandlers,
    ),
  ),
)
