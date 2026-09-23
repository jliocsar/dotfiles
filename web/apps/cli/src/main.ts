import { BunRuntime, BunServices } from '@effect/platform-bun'
import * as Cause from 'effect/Cause'
import * as Console from 'effect/Console'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'
import type * as Types from 'effect/Types'
import * as Argument from 'effect/unstable/cli/Argument'
import * as Command from 'effect/unstable/cli/Command'
import * as Flag from 'effect/unstable/cli/Flag'
import * as Prompt from 'effect/unstable/cli/Prompt'
import * as FetchHttpClient from 'effect/unstable/http/FetchHttpClient'
import * as HttpBody from 'effect/unstable/http/HttpBody'
import * as HttpClient from 'effect/unstable/http/HttpClient'
import type * as HttpClientError from 'effect/unstable/http/HttpClientError'
import * as HttpClientResponse from 'effect/unstable/http/HttpClientResponse'

import {
  CreateRequest,
  Cursor,
  LIST_LIMIT_MAX,
  ListQuery,
  MeetingSlot,
  ShareView,
} from '@dotfiles/web/api'
import {
  EntryId,
  EntrySlug,
  EntryType,
  MeetingRef,
  ShareLinkId,
  ShareTtl,
  Tag,
  TagCount,
  entryRef,
  normaliseTag,
} from '@dotfiles/web/domain'
import type { Entry, EntryRef } from '@dotfiles/web/domain'

import { authedClient, makeClient, readStored, writeStored } from './client.ts'
import { DEFAULT_DIR, PutResult, entryPath, pull, push } from './workspace.ts'

const VERSION = '0.0.1'

const MAX_RENAME_ATTEMPTS = 3

const FALLBACK_MIME = 'application/octet-stream'

const UNAUTHORIZED = 401

const EXIT = { ok: 0, unexpected: 1, usage: 2, conflict: 3, notFound: 4, unpushed: 5, auth: 6 }

const ListQueryParams = Schema.Struct(ListQuery)

const EntryOutput = Schema.Struct({
  id: EntryId,
  type: EntryType,
  slug: EntrySlug,
  title: Schema.String,
  body: Schema.String,
  meeting: Schema.NullOr(MeetingRef),
  mime: Schema.NullOr(Schema.String),
  bytes: Schema.NullOr(Schema.Int),
  updatedAt: Schema.DateTimeUtcFromString,
  tags: Schema.Array(Tag),
})

const PulledOutput = Schema.Struct({ ...EntryOutput.fields, path: Schema.String })

const DetailOutput = Schema.Struct({
  ...EntryOutput.fields,
  url: Schema.NullOr(Schema.String),
  shares: Schema.Array(ShareView),
})

const SummaryOutput = Schema.Struct({
  id: EntryId,
  type: EntryType,
  slug: EntrySlug,
  title: Schema.String,
  mime: Schema.NullOr(Schema.String),
  bytes: Schema.NullOr(Schema.Int),
  updatedAt: Schema.DateTimeUtcFromString,
  tags: Schema.Array(Tag),
})

const ListOutput = Schema.Struct({
  entries: Schema.Array(SummaryOutput),
  cursor: Schema.NullOr(Schema.String),
})

const LoginOutput = Schema.Struct({ url: Schema.String, config: Schema.String })

const PathOutput = Schema.Struct({ slug: EntrySlug, path: Schema.String })

const PushOutput = Schema.Struct({
  path: Schema.String,
  pushed: Schema.Boolean,
  merged: Schema.Boolean,
})

const TitleOutput = Schema.Struct({ slug: EntrySlug, title: Schema.String })

const TagsOutput = Schema.Struct({ slug: EntrySlug, tags: Schema.Array(Tag) })

const ArchivedOutput = Schema.Struct({ slug: EntrySlug, archived: Schema.Boolean })

const SkippedOutput = Schema.Struct({
  title: Schema.String,
  skipped: Schema.Boolean,
  reason: Schema.String,
})

const DownloadOutput = Schema.Struct({ path: Schema.String, bytes: Schema.Int })

const RevokedOutput = Schema.Struct({ revoked: ShareLinkId })

const ErrorOutput = Schema.Struct({
  error: Schema.String,
  message: Schema.String,
  path: Schema.optionalKey(Schema.String),
  ref: Schema.optionalKey(Schema.String),
})

class UsageError extends Schema.TaggedError<UsageError>()('UsageError', {
  message: Schema.String,
}) {}

const printTo =
  (write: (text: string) => Effect.Effect<void>) =>
  <Output, Encoded>(schema: Schema.Codec<Output, Encoded>) =>
  (value: Output) =>
    Effect.flatMap(
      Effect.orDie(Schema.encodeEffect(Schema.fromJsonString(schema, { space: 2 }))(value)),
      write,
    )

const print = printTo(Console.log)

const printError = printTo(Console.error)(ErrorOutput)

const refArgument = Argument.string('ref').pipe(
  Argument.withDescription('slug or id'),
  Argument.map(entryRef),
)

const dirFlag = Flag.string('dir').pipe(
  Flag.withDescription('where pulled files live'),
  Flag.withDefault(DEFAULT_DIR),
)

const tagFlag = Flag.string('tag').pipe(Flag.withDescription('repeatable'), Flag.atLeast(0))

const typeFlag = Flag.choice('type', EntryType.literals).pipe(Flag.optional)

const parseTags = Effect.fn('parseTags')(function* (raw: readonly string[]) {
  const tags: Tag[] = []

  for (const text of raw) {
    const tag = normaliseTag(text)

    if (Option.isNone(tag)) {
      return yield* new UsageError({
        message: `bad tag "${text}": lowercase letters, digits and dashes, up to 32`,
      })
    }

    tags.push(tag.value)
  }

  return tags
})

const readStdinBody = process.stdin.isTTY
  ? Effect.succeed(Option.none<string>())
  : Effect.map(
      Effect.promise(() => Bun.stdin.text()),
      (text) => (text === '' ? Option.none<string>() : Option.some(text)),
    )

const detail = Effect.fn('detail')(function* (ref: EntryRef) {
  const client = yield* authedClient

  return yield* client.entries.get({ params: { ref } })
})

const putBody = Effect.fn('putBody')(function* (id: Entry['id'], body: string, version: number) {
  const client = yield* authedClient

  return yield* client.entries.save({ params: { id }, payload: { body, version } }).pipe(
    Effect.map((saved) => PutResult.Saved({ version: saved.version })),
    Effect.catchTag('VersionConflict', (conflict) =>
      Effect.succeed(
        PutResult.Stale({ version: conflict.entry.version, body: conflict.entry.body }),
      ),
    ),
  )
})

const pullEntry = Effect.fn('pullEntry')(function* (entry: Entry, dir: string, force: boolean) {
  if (entry.type === 'artifact') {
    return yield* new UsageError({ message: 'artifacts can’t be pulled; use `download`' })
  }

  return yield* pull(dir, entry, force)
})

const setTags = Effect.fn('setTags')(function* (entry: Entry, raw: readonly string[]) {
  if (raw.length === 0) {
    return entry
  }

  const tags = yield* parseTags(raw)
  const client = yield* authedClient

  return yield* client.entries.setTags({
    params: { ref: entryRef(entry.id) },
    payload: { tags },
  })
})

const listQuery = Effect.fn('listQuery')(function* (flags: {
  readonly type: Option.Option<EntryType>
  readonly tag: Option.Option<string>
  readonly archived: boolean
  readonly title: Option.Option<string>
  readonly limit: Option.Option<number>
  readonly cursor: Option.Option<string>
}) {
  const query: Types.Mutable<typeof ListQueryParams.Type> = {}
  const tags = yield* parseTags(Option.toArray(flags.tag))
  const [tag] = tags

  if (Option.isSome(flags.type)) {
    query.type = flags.type.value
  }

  if (tag !== undefined) {
    query.tag = tag
  }

  if (flags.archived) {
    query.archived = 'true'
  }

  if (Option.isSome(flags.title)) {
    query.title = flags.title.value
  }

  if (Option.isSome(flags.limit)) {
    if (flags.limit.value < 1 || flags.limit.value > LIST_LIMIT_MAX) {
      return yield* new UsageError({ message: `--limit must be 1..${LIST_LIMIT_MAX}` })
    }

    query.limit = flags.limit.value
  }

  if (Option.isSome(flags.cursor)) {
    query.cursor = yield* Schema.decodeEffect(Cursor)(flags.cursor.value).pipe(
      Effect.mapError(() => new UsageError({ message: 'bad --cursor' })),
    )
  }

  return query
})

const login = Command.make(
  'login',
  { url: Flag.string('url').pipe(Flag.optional) },
  Effect.fn(function* ({ url }) {
    const stored = yield* readStored
    const target = Option.orElse(url, () => Option.map(stored, (value) => value.url))

    if (Option.isNone(target)) {
      return yield* new UsageError({ message: 'first login needs --url' })
    }

    const password = yield* Prompt.run(Prompt.password({ message: 'password' }))
    const client = yield* makeClient(target.value, Option.none())
    const response = yield* client.auth.login({
      payload: { password: Redacted.value(password) },
    })
    const config = yield* writeStored({ url: target.value, token: response.token })

    return yield* print(LoginOutput)({ url: target.value, config })
  }),
).pipe(Command.withDescription('Store the server URL and a session token'))

const list = Command.make(
  'list',
  {
    type: typeFlag,
    tag: Flag.string('tag').pipe(Flag.optional),
    archived: Flag.boolean('archived').pipe(Flag.withDefault(false)),
    title: Flag.string('title').pipe(Flag.withDescription('substring match'), Flag.optional),
    limit: Flag.integer('limit').pipe(Flag.optional),
    cursor: Flag.string('cursor').pipe(Flag.optional),
  },
  Effect.fn(function* (flags) {
    const query = yield* listQuery(flags)
    const client = yield* authedClient
    const page = yield* client.entries.list({ query })
    const cursor = page.cursor === null ? null : yield* Schema.encodeEffect(Cursor)(page.cursor)

    return yield* print(ListOutput)({ entries: page.entries, cursor })
  }),
).pipe(Command.withDescription('Entry summaries, newest first'))

const get = Command.make(
  'get',
  { ref: refArgument },
  Effect.fn(function* ({ ref }) {
    const found = yield* detail(ref)

    return yield* print(DetailOutput)({ ...found.entry, url: found.url, shares: found.shares })
  }),
).pipe(Command.withDescription('One entry, body included'))

const create = Command.make(
  'new',
  {
    type: Argument.choice('type', CreateRequest.fields.type.literals),
    title: Flag.string('title').pipe(Flag.optional),
    tag: tagFlag,
    dir: dirFlag,
  },
  Effect.fn(function* (input) {
    const tags = yield* parseTags(input.tag)
    const body = yield* readStdinBody
    const payload: Types.Mutable<typeof CreateRequest.Type> = { type: input.type }

    if (Option.isSome(input.title)) {
      payload.title = input.title.value
    }

    if (Option.isSome(body)) {
      payload.body = body.value
    }

    const client = yield* authedClient
    const created = yield* client.entries.create({ payload })
    const tagged = yield* setTags(created, tags)
    const path = yield* pullEntry(tagged, input.dir, false)

    return yield* print(PulledOutput)({ ...tagged, path })
  }),
).pipe(Command.withDescription('Create a note or task (body from stdin), then pull it'))

const meeting = Command.make(
  'meeting',
  { dir: dirFlag },
  Effect.fn(function* ({ dir }) {
    const client = yield* authedClient
    const entry = yield* client.meetings.start()
    const path = yield* pullEntry(entry, dir, false)

    return yield* print(PulledOutput)({ ...entry, path })
  }),
).pipe(
  Command.withDescription('Open (or create) the note for the meeting happening now, then pull it'),
)

const meetings = Command.make(
  'meetings',
  {},
  Effect.fn(function* () {
    const client = yield* authedClient
    const slots = yield* client.meetings.today()

    return yield* print(Schema.Array(MeetingSlot))(slots)
  }),
).pipe(Command.withDescription('Today’s calendar events and their notes'))

const attach = Command.make(
  'attach',
  { ref: refArgument, eventId: Argument.string('eventId') },
  Effect.fn(function* ({ ref, eventId }) {
    const client = yield* authedClient
    const entry = yield* client.entries.attach({ params: { ref }, payload: { eventId } })

    return yield* print(EntryOutput)(entry)
  }),
).pipe(Command.withDescription('Give a meeting note one of today’s events'))

const pullCommand = Command.make(
  'pull',
  { ref: refArgument, dir: dirFlag, force: Flag.boolean('force').pipe(Flag.withDefault(false)) },
  Effect.fn(function* ({ ref, dir, force }) {
    const found = yield* detail(ref)
    const path = yield* pullEntry(found.entry, dir, force)

    return yield* print(PathOutput)({ slug: found.entry.slug, path })
  }),
).pipe(Command.withDescription('Write the body to <dir>/<slug>.md for editing'))

const pushCommand = Command.make(
  'push',
  { target: Argument.string('slug|file'), dir: dirFlag },
  Effect.fn(function* ({ target, dir }) {
    const path = yield* Path.Path
    const file =
      target.endsWith('.md') || target.includes('/')
        ? path.resolve(target)
        : yield* entryPath(dir, target)
    const result = yield* push(file, putBody)

    return yield* print(PushOutput)(result)
  }),
).pipe(Command.withDescription('Send a pulled file’s edits, merging with newer server edits'))

const rename = Command.make(
  'rename',
  { ref: refArgument, title: Argument.string('title') },
  Effect.fn(function* ({ ref, title }) {
    const client = yield* authedClient
    const { entry } = yield* detail(ref)
    const attempt = (
      version: number,
      attemptsLeft: number,
    ): ReturnType<typeof client.entries.save> =>
      client.entries
        .save({ params: { id: entry.id }, payload: { title, version } })
        .pipe(
          Effect.catchTag('VersionConflict', (conflict) =>
            attemptsLeft > 1
              ? attempt(conflict.entry.version, attemptsLeft - 1)
              : Effect.die('entry kept changing during rename'),
          ),
        )

    yield* attempt(entry.version, MAX_RENAME_ATTEMPTS)

    return yield* print(TitleOutput)({ slug: entry.slug, title })
  }),
).pipe(Command.withDescription('Change an entry’s title (the slug stays)'))

const tagsCommand = Command.make(
  'tags',
  { type: typeFlag },
  Effect.fn(function* ({ type }) {
    const client = yield* authedClient
    const counts = yield* client.tags.list({
      query: Option.match(type, { onNone: () => ({}), onSome: (value) => ({ type: value }) }),
    })

    return yield* print(Schema.Array(TagCount))(counts)
  }),
).pipe(Command.withDescription('Tags in use, most used first'))

const tagCommand = Command.make(
  'tag',
  { ref: refArgument, tags: Argument.string('tags').pipe(Argument.variadic()) },
  Effect.fn(function* (input) {
    const parsed = yield* parseTags(input.tags)
    const client = yield* authedClient
    const entry = yield* client.entries.setTags({
      params: { ref: input.ref },
      payload: { tags: parsed },
    })

    return yield* print(TagsOutput)(entry)
  }),
).pipe(Command.withDescription('Replace an entry’s tags (none clears them)'))

const archive = Command.make(
  'archive',
  { ref: refArgument },
  Effect.fn(function* ({ ref }) {
    const client = yield* authedClient
    const entry = yield* client.entries.archive({ params: { ref } })

    return yield* print(ArchivedOutput)({ slug: entry.slug, archived: true })
  }),
).pipe(Command.withDescription('Archive an entry (there is no delete)'))

const restore = Command.make(
  'restore',
  { ref: refArgument },
  Effect.fn(function* ({ ref }) {
    const client = yield* authedClient
    const entry = yield* client.entries.restore({ params: { ref } })

    return yield* print(ArchivedOutput)({ slug: entry.slug, archived: false })
  }),
).pipe(Command.withDescription('Bring an archived entry back'))

const upload = Command.make(
  'upload',
  { file: Argument.string('file'), title: Flag.string('title').pipe(Flag.optional), tag: tagFlag },
  Effect.fn(function* (input) {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const tags = yield* parseTags(input.tag)

    if (!(yield* Effect.orDie(fs.exists(input.file)))) {
      return yield* new UsageError({ message: `no such file: ${input.file}` })
    }

    const file = Bun.file(input.file)
    const title = Option.getOrElse(input.title, () => path.basename(input.file))
    const skipped = { title, skipped: true, reason: 'an artifact with this title exists' }
    const client = yield* authedClient
    const presigned = yield* client.artifacts.presign({ payload: { titles: [title] } })
    const [target] = presigned.targets

    if (target === undefined) {
      return yield* print(SkippedOutput)(skipped)
    }

    yield* HttpClient.put(target.url, {
      body: HttpBody.raw(file, { contentType: file.type || FALLBACK_MIME }),
    }).pipe(Effect.flatMap(HttpClientResponse.filterStatusOk))

    const registered = yield* client.artifacts.register({
      payload: { files: [{ key: target.key, title }] },
    })
    const [slug] = registered.slugs

    if (slug === undefined) {
      return yield* print(SkippedOutput)(skipped)
    }

    const found = yield* detail(entryRef(slug))
    const entry = yield* setTags(found.entry, tags)

    return yield* print(EntryOutput)(entry)
  }),
).pipe(Command.withDescription('Upload a file as an artifact'))

const download = Command.make(
  'download',
  {
    ref: refArgument,
    output: Flag.string('output').pipe(Flag.withAlias('o'), Flag.optional),
  },
  Effect.fn(function* ({ ref, output }) {
    const found = yield* detail(ref)

    if (found.url === null) {
      return yield* new UsageError({ message: 'only artifacts can be downloaded; use `get`' })
    }

    const fs = yield* FileSystem.FileSystem
    const path = (yield* Path.Path).resolve(Option.getOrElse(output, () => found.entry.title))
    const response = yield* HttpClient.get(found.url).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
    )

    yield* Stream.run(response.stream, fs.sink(path))

    const info = yield* fs.stat(path)

    return yield* print(DownloadOutput)({ path, bytes: Number(info.size) })
  }),
).pipe(Command.withDescription('Save an artifact’s file'))

const share = Command.make(
  'share',
  { ref: refArgument, ttl: Flag.choice('ttl', ShareTtl.literals).pipe(Flag.withDefault('7d')) },
  Effect.fn(function* ({ ref, ttl }) {
    const client = yield* authedClient
    const link = yield* client.artifacts.share({ params: { ref }, payload: { ttl } })

    return yield* print(ShareView)(link)
  }),
).pipe(Command.withDescription('Make a public link to an artifact'))

const unshare = Command.make(
  'unshare',
  { linkId: Argument.string('linkId') },
  Effect.fn(function* ({ linkId }) {
    const client = yield* authedClient
    const id = yield* Schema.decodeEffect(ShareLinkId)(linkId)

    yield* client.artifacts.unshare({ params: { id } })

    return yield* print(RevokedOutput)({ revoked: id })
  }),
).pipe(Command.withDescription('Revoke a share link'))

const root = Command.make('dotfiles-web').pipe(
  Command.withDescription('Notes, meetings, tasks and artifacts from the command line'),
  Command.withSubcommands([
    login,
    list,
    get,
    create,
    meeting,
    meetings,
    attach,
    pullCommand,
    pushCommand,
    rename,
    tagsCommand,
    tagCommand,
    archive,
    restore,
    upload,
    download,
    share,
    unshare,
  ]),
)

const exitWith = (code: number, report: typeof ErrorOutput.Type) =>
  Effect.as(printError(report), code)

const responseStatus = (error: HttpClientError.HttpClientError) =>
  Match.value(error.reason).pipe(
    Match.tag('StatusCodeError', 'DecodeError', 'EmptyBodyError', (reason) =>
      Option.some(reason.response.status),
    ),
    Match.orElse(() => Option.none<number>()),
  )

const program = Command.run(root, { version: VERSION, renderErrors: false }).pipe(
  Effect.as(EXIT.ok),
  Effect.catchTags({
    ShowHelp: (error) =>
      error.errors.length === 0
        ? Effect.succeed(EXIT.ok)
        : exitWith(EXIT.usage, {
            error: 'UsageError',
            message: error.errors.map((inner) => inner.message).join('; '),
          }),
    UserError: (error) => exitWith(EXIT.usage, { error: 'UsageError', message: error.message }),
    UsageError: (error) => exitWith(EXIT.usage, { error: 'UsageError', message: error.message }),
    NotPulled: (error) =>
      exitWith(EXIT.usage, { error: 'NotPulled', message: error.message, path: error.path }),
    NotAnArtifact: (error) =>
      exitWith(EXIT.usage, {
        error: 'NotAnArtifact',
        message: `${error.ref} is not an artifact`,
        ref: error.ref,
      }),
    ConflictMarkers: (error) =>
      exitWith(EXIT.conflict, {
        error: 'ConflictMarkers',
        message: error.message,
        path: error.path,
      }),
    EntryNotFound: (error) =>
      exitWith(EXIT.notFound, {
        error: 'EntryNotFound',
        message: `no entry "${error.ref}"`,
        ref: error.ref,
      }),
    EventNotFound: (error) =>
      exitWith(EXIT.notFound, {
        error: 'EventNotFound',
        message: `no event "${error.eventId}" today`,
      }),
    UnpushedChanges: (error) =>
      exitWith(EXIT.unpushed, {
        error: 'UnpushedChanges',
        message: error.message,
        path: error.path,
      }),
    NotLoggedIn: (error) => exitWith(EXIT.auth, { error: 'NotLoggedIn', message: error.message }),
    WrongPassword: () => exitWith(EXIT.auth, { error: 'WrongPassword', message: 'wrong password' }),
    HttpClientError: (error) =>
      Option.contains(responseStatus(error), UNAUTHORIZED)
        ? exitWith(EXIT.auth, {
            error: 'NotLoggedIn',
            message: 'token rejected; run `dotfiles-web login`',
          })
        : exitWith(EXIT.unexpected, { error: 'HttpClientError', message: error.message }),
  }),
  Effect.catchCause((cause) =>
    exitWith(EXIT.unexpected, { error: 'Unexpected', message: Cause.pretty(cause) }),
  ),
  Effect.provide([BunServices.layer, FetchHttpClient.layer]),
)

BunRuntime.runMain(program, {
  disableErrorReporting: true,
  teardown: (exit, onExit) => {
    onExit(Exit.isSuccess(exit) ? Number(exit.value) : EXIT.unexpected)
  },
})
