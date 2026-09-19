import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as HttpRouter from 'effect/unstable/http/HttpRouter'
import * as HttpServerRequest from 'effect/unstable/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'

import { HomePage } from '../pages/Home.tsx'
import { EntryPage, ListPage, MissingPage, TagsFragment, tagOptions } from '../pages/Entries.tsx'
import { page, respond } from '../render.ts'
import {
  EntrySlug,
  NAV,
  normaliseTag,
  sectionOf,
  ShareLinkId,
  ShareToken,
  ShareTtl,
  Tag,
} from '../domain.ts'
import type { Entry, Section } from '../domain.ts'
import { Entries } from '../services/Entries.ts'
import { ObjectStore } from '../services/ObjectStore.ts'
import { ShareLinks } from '../services/ShareLinks.ts'
import { artifactFile, contentDisposition } from '../artifacts.ts'
import { newMeetingNote } from '../meetings.ts'
import { parseTasks, serializeTasks } from '../tasks.ts'
import { requestOrigin, requestZone } from '../zone.ts'

const EntryParams = Schema.Struct({
  slug: EntrySlug,
})

const ShareParams = Schema.Struct({
  slug: EntrySlug,
  id: ShareLinkId,
})

const TaskParams = Schema.Struct({
  slug: EntrySlug,
  index: Schema.FiniteFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
})

const TokenParams = Schema.Struct({
  token: ShareToken,
})

const ShareForm = Schema.Struct({
  ttl: ShareTtl,
})

// `tag` repeats once per checked box; `create` is the search text on Enter.
const TagsForm = Schema.Struct({
  tag: Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
  create: Schema.optionalKey(Schema.String),
})

const tagParam = Schema.decodeUnknownOption(Tag)

const slugParam = Effect.map(HttpRouter.schemaPathParams(EntryParams), (params) => params.slug)

const notFound = (ref: string) => respond(<p>no entry called {ref}</p>, 404)

const badRequest = respond(<p>bad request</p>, 400)

const REJECTED = 'rejected entry request'

const seeOther = (location: string) => HttpServerResponse.redirect(location, { status: 303 })

const entryRoute = Effect.gen(function* () {
  const slug = yield* slugParam
  const origin = yield* requestOrigin
  const zone = yield* requestZone
  const params = yield* HttpServerRequest.ParsedSearchParams

  return yield* page(EntryPage({ slug, origin, zone, openShare: params['share'] !== undefined }))
}).pipe(
  Effect.catchTag('EntryNotFound', (error) =>
    Effect.succeed(respond(MissingPage({ slug: error.ref }), 404)),
  ),
  Effect.tapError((error) => Effect.logWarning(REJECTED, error.message)),
  Effect.orElseSucceed(() => badRequest),
)
const serveArtifact = Effect.fn('serveArtifact')(function* (entry: Entry) {
  const objects = yield* ObjectStore
  const params = yield* HttpServerRequest.ParsedSearchParams
  const file = artifactFile(entry)

  if (file === undefined) {
    return notFound(entry.slug)
  }

  const disposition = contentDisposition(file.mime, entry.title, params['download'] !== undefined)

  return HttpServerResponse.redirect(objects.downloadUrl(file.objectKey, file.mime, disposition), {
    status: 302,
    headers: { 'cache-control': 'no-store' },
  })
})

const artifactRoute = Effect.gen(function* () {
  const entries = yield* Entries
  const slug = yield* slugParam
  const entry = yield* entries.bySlug(slug)

  return yield* serveArtifact(entry)
}).pipe(
  Effect.catchTag('EntryNotFound', (error) => Effect.succeed(notFound(error.ref))),
  Effect.tapError((error) => Effect.logWarning(REJECTED, error.message)),
  Effect.orElseSucceed(() => badRequest),
)

const sharedRoute = Effect.gen(function* () {
  const shares = yield* ShareLinks
  const params = yield* HttpRouter.schemaPathParams(TokenParams)
  const entry = yield* shares.resolve(params.token)

  return yield* serveArtifact(entry)
}).pipe(
  Effect.catchTag('ShareNotFound', () => Effect.succeed(notFound('that'))),
  Effect.tapError((error) => Effect.logWarning(REJECTED, error.message)),
  Effect.orElseSucceed(() => badRequest),
)

const shareRoute = Effect.gen(function* () {
  const entries = yield* Entries
  const shares = yield* ShareLinks
  const slug = yield* slugParam
  const form = yield* HttpServerRequest.schemaBodyUrlParams(ShareForm)
  const entry = yield* entries.bySlug(slug)

  yield* shares.create(entry.id, form.ttl)

  return seeOther(`/e/${entry.slug}?share`)
}).pipe(
  Effect.catchTag('EntryNotFound', (error) => Effect.succeed(notFound(error.ref))),
  Effect.tapError((error) => Effect.logWarning(REJECTED, error.message)),
  Effect.orElseSucceed(() => badRequest),
)

const revokeRoute = Effect.gen(function* () {
  const shares = yield* ShareLinks
  const params = yield* HttpRouter.schemaPathParams(ShareParams)

  yield* shares.revoke(params.id)

  return seeOther(`/e/${params.slug}?share`)
}).pipe(
  Effect.tapError((error) => Effect.logWarning(REJECTED, error.message)),
  Effect.orElseSucceed(() => badRequest),
)

const createRoute = (section: Section) =>
  Effect.gen(function* () {
    const entries = yield* Entries
    const zone = yield* requestZone
    const entry =
      section.type === 'meeting'
        ? yield* newMeetingNote(zone)
        : yield* entries.create({
            type: section.type,
            title: Option.none(),
            zone,
          })

    return seeOther(`/e/${entry.slug}`)
  })

const claimRoute = Effect.gen(function* () {
  const entries = yield* Entries
  const slug = yield* slugParam
  const zone = yield* requestZone
  const entry = yield* entries.create({
    type: 'note',
    title: Option.some(slug),
    zone,
  })

  return seeOther(`/e/${entry.slug}`)
}).pipe(
  Effect.tapError((error) => Effect.logWarning(REJECTED, error.message)),
  Effect.orElseSucceed(() => badRequest),
)

const taskDoneRoute = Effect.gen(function* () {
  const entries = yield* Entries
  const params = yield* HttpRouter.schemaPathParams(TaskParams)
  const entry = yield* entries.bySlug(params.slug)
  const tasks = parseTasks(entry.body)

  if (params.index < tasks.length) {
    yield* entries.put({
      id: entry.id,
      title: entry.title,
      body: serializeTasks(
        tasks.map((task, index) => (index === params.index ? { ...task, done: true } : task)),
      ),
      expectedVersion: entry.version,
    })
  }

  return seeOther('/')
}).pipe(
  Effect.catchTag('EntryNotFound', (error) => Effect.succeed(notFound(error.ref))),
  Effect.tapError((error) => Effect.logWarning(REJECTED, error.message)),
  Effect.orElseSucceed(() => badRequest),
)

const listRoute = (section: Section) =>
  Effect.gen(function* () {
    const params = yield* HttpServerRequest.ParsedSearchParams

    return yield* page(
      ListPage({
        section,
        archived: params['archived'] !== undefined,
        tag: tagParam(params['tag']),
      }),
    )
  })

// Replaces the set (§3.7) and answers with the fragment, so the editor island stays put.
const tagsRoute = Effect.gen(function* () {
  const entries = yield* Entries
  const slug = yield* slugParam
  const form = yield* HttpServerRequest.schemaBodyUrlParams(TagsForm)
  const entry = yield* entries.bySlug(slug)
  const kept = Arr.getSomes(Arr.ensure(form.tag ?? []).map(normaliseTag))
  const created = form.create === undefined ? Option.none() : normaliseTag(form.create)
  const next = yield* entries.setTags(entry.id, [...kept, ...Option.toArray(created)])
  const sectionTags = yield* entries.distinctTags(next.type, false)

  return respond(<TagsFragment entry={next} options={tagOptions(next, sectionTags)} />, 200)
}).pipe(
  Effect.catchTag('EntryNotFound', (error) => Effect.succeed(notFound(error.ref))),
  Effect.tapError((error) => Effect.logWarning(REJECTED, error.message)),
  Effect.orElseSucceed(() => badRequest),
)

const mutateRoute = (action: 'archive' | 'restore' | 'remove', suffix: string) =>
  Effect.gen(function* () {
    const entries = yield* Entries
    const slug = yield* slugParam
    const entry = yield* entries[action](slug)

    return seeOther(`${sectionOf(entry.type).path}${suffix}`)
  }).pipe(
    Effect.catchTag('EntryNotFound', (error) => Effect.succeed(notFound(error.ref))),
    Effect.tapError((error) => Effect.logWarning(REJECTED, error.message)),
    Effect.orElseSucceed(() => badRequest),
  )

const sectionRoutes = (section: Section) =>
  Layer.mergeAll(
    HttpRouter.add('GET', section.path, listRoute(section)),
    HttpRouter.add('POST', section.path, createRoute(section)),
  )

export const EntriesRoutes = Layer.mergeAll(
  HttpRouter.add(
    'GET',
    '/',
    Effect.flatMap(requestZone, (zone) => page(HomePage({ zone }))),
  ),
  HttpRouter.add('GET', '/e/:slug', entryRoute),
  HttpRouter.add('GET', '/a/:slug', artifactRoute),
  HttpRouter.add('POST', '/e/:slug/create', claimRoute),
  HttpRouter.add('POST', '/e/:slug/archive', mutateRoute('archive', '')),
  HttpRouter.add('POST', '/e/:slug/restore', mutateRoute('restore', '?archived')),
  HttpRouter.add('POST', '/e/:slug/remove', mutateRoute('remove', '?archived')),
  HttpRouter.add('POST', '/e/:slug/share', shareRoute),
  HttpRouter.add('POST', '/e/:slug/share/:id/revoke', revokeRoute),
  HttpRouter.add('POST', '/e/:slug/tasks/:index/done', taskDoneRoute),
  HttpRouter.add('POST', '/e/:slug/tags', tagsRoute),
  ...NAV.map(sectionRoutes),
)

export const SharedRoutes = HttpRouter.add('GET', '/s/:token', sharedRoute)
