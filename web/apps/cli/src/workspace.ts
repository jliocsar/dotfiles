import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'
import * as ChildProcess from 'effect/unstable/process/ChildProcess'
import * as ChildProcessSpawner from 'effect/unstable/process/ChildProcessSpawner'

import { EntryId } from '@dotfiles/web/domain'
import type { EntrySlug } from '@dotfiles/web/domain'

export interface PulledEntry {
  readonly id: EntryId
  readonly slug: EntrySlug
  readonly version: number
  readonly body: string
}

export type PutResult = Data.TaggedEnum<{
  Saved: { readonly version: number }
  Stale: { readonly version: number; readonly body: string }
}>

export type PutBody<PutError, PutRequirements> = (
  id: EntryId,
  body: string,
  version: number,
) => Effect.Effect<PutResult, PutError, PutRequirements>

export interface PushResult {
  readonly path: string
  readonly pushed: boolean
  readonly merged: boolean
}

export interface MergeResult {
  readonly clean: boolean
  readonly text: string
}

const MAX_PUSH_ATTEMPTS = 3

export const DEFAULT_DIR = '/tmp/dotfiles-web'

export const PutResult = Data.taggedEnum<PutResult>()

export const Sidecar = Schema.Struct({
  id: EntryId,
  version: Schema.Int,
  base: Schema.String,
})

export type Sidecar = typeof Sidecar.Type

const SidecarJson = Schema.fromJsonString(Sidecar)

export class UnpushedChanges extends Schema.TaggedError<UnpushedChanges>()('UnpushedChanges', {
  path: Schema.String,
  message: Schema.String,
}) {}

export class ConflictMarkers extends Schema.TaggedError<ConflictMarkers>()('ConflictMarkers', {
  path: Schema.String,
  message: Schema.String,
}) {}

export class NotPulled extends Schema.TaggedError<NotPulled>()('NotPulled', {
  path: Schema.String,
  message: Schema.String,
}) {}

export const entryPath = (dir: string, slug: string) =>
  Effect.map(Path.Path, (path) => path.join(dir, `${slug}.md`))

const sidecarPath = (file: string) =>
  Effect.map(Path.Path, (path) =>
    path.join(path.dirname(file), `.${path.basename(file, '.md')}.json`),
  )

const readText = Effect.fn('workspace.readText')(function* (path: string) {
  const fs = yield* FileSystem.FileSystem

  if (yield* Effect.orDie(fs.exists(path))) {
    return Option.some(yield* Effect.orDie(fs.readFileString(path)))
  }

  return Option.none<string>()
})

const writeText = Effect.fn('workspace.writeText')(function* (file: string, text: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  yield* Effect.orDie(fs.makeDirectory(path.dirname(file), { recursive: true }))
  yield* Effect.orDie(fs.writeFileString(file, text))
})

const readSidecar = (file: string) =>
  Effect.flatMap(Effect.flatMap(sidecarPath(file), readText), (text) =>
    Option.match(text, {
      onNone: () => Effect.succeed(Option.none<Sidecar>()),
      onSome: (json) =>
        Effect.map(Effect.orDie(Schema.decodeEffect(SidecarJson)(json)), Option.some),
    }),
  )

const writeSidecar = Effect.fn('workspace.writeSidecar')(function* (
  file: string,
  sidecar: Sidecar,
) {
  const json = yield* Effect.orDie(Schema.encodeEffect(SidecarJson)(sidecar))

  yield* writeText(yield* sidecarPath(file), json)
})

export const pull = Effect.fn('workspace.pull')(function* (
  dir: string,
  entry: PulledEntry,
  force: boolean,
) {
  const file = yield* entryPath(dir, entry.slug)

  if (!force) {
    const local = yield* readText(file)
    const sidecar = yield* readSidecar(file)
    const dirty =
      Option.isSome(local) && (Option.isNone(sidecar) || sidecar.value.base !== local.value)

    if (dirty) {
      return yield* new UnpushedChanges({
        path: file,
        message: 'local edits not pushed; push them first or pull with --force',
      })
    }
  }

  yield* writeText(file, entry.body)
  yield* writeSidecar(file, { id: entry.id, version: entry.version, base: entry.body })

  return file
})

export const merge = Effect.fn('workspace.merge')(function* (
  local: string,
  base: string,
  remote: string,
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const scratch = yield* Effect.orDie(fs.makeTempDirectoryScoped({ prefix: 'dotfiles-web-merge-' }))
  const files = {
    local: path.join(scratch, 'local'),
    base: path.join(scratch, 'base'),
    remote: path.join(scratch, 'remote'),
  }

  yield* writeText(files.local, local)
  yield* writeText(files.base, base)
  yield* writeText(files.remote, remote)

  const child = yield* Effect.orDie(
    spawner.spawn(
      ChildProcess.make('git', [
        'merge-file',
        '-p',
        '-L',
        'local',
        '-L',
        'base',
        '-L',
        'remote',
        files.local,
        files.base,
        files.remote,
      ]),
    ),
  )
  const [text, stderr, code] = yield* Effect.orDie(
    Effect.all(
      [
        Stream.mkString(Stream.decodeText(child.stdout)),
        Stream.mkString(Stream.decodeText(child.stderr)),
        child.exitCode,
      ],
      { concurrency: 'unbounded' },
    ),
  )

  if (code === 0) {
    return { clean: true, text } satisfies MergeResult
  }

  if (code > 0 && code < 128) {
    return { clean: false, text } satisfies MergeResult
  }

  return yield* Effect.die(`git merge-file failed (${code}): ${stderr}`)
}, Effect.scoped)

export const push = Effect.fn('workspace.push')(function* <PutError, PutRequirements>(
  file: string,
  put: PutBody<PutError, PutRequirements>,
) {
  const local = yield* readText(file)
  const sidecar = yield* readSidecar(file)

  if (Option.isNone(local) || Option.isNone(sidecar)) {
    return yield* new NotPulled({ path: file, message: 'no pulled copy here; pull it first' })
  }

  const { id } = sidecar.value
  let body = local.value
  let base = sidecar.value.base
  let version = sidecar.value.version

  if (body === base) {
    return { path: file, pushed: false, merged: false } satisfies PushResult
  }

  for (let attempt = 0; attempt < MAX_PUSH_ATTEMPTS; attempt++) {
    const result = yield* put(id, body, version)

    if (PutResult.$is('Saved')(result)) {
      const merged = body !== local.value

      if (merged) {
        yield* writeText(file, body)
      }

      yield* writeSidecar(file, { id, version: result.version, base: body })

      return { path: file, pushed: true, merged } satisfies PushResult
    }

    const merged = yield* merge(body, base, result.body)

    if (!merged.clean) {
      yield* writeText(file, merged.text)
      yield* writeSidecar(file, { id, version: result.version, base: result.body })

      return yield* new ConflictMarkers({
        path: file,
        message: 'overlapping edits; resolve the conflict markers in the file, then push again',
      })
    }

    body = merged.text
    base = result.body
    version = result.version
  }

  return yield* Effect.die(`entry kept changing during push: ${file}`)
})
