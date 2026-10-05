import { afterAll, describe, expect, test } from 'bun:test'
import { BunServices } from '@effect/platform-bun'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Path from 'effect/Path'
import type * as Scope from 'effect/Scope'

import { entryId, entrySlug } from '@dotfiles/web/domain'

import { ConflictMarkers, NotPulled, PutResult, UnpushedChanges, pull, push } from './workspace.ts'

const ID = entryId('0199aaaa-0000-7000-8000-000000000000')
const SLUG = entrySlug('plan')

const runtime = ManagedRuntime.make(BunServices.layer)

const inTempDir = <Success, Failure>(
  body: (dir: string) => Effect.Effect<Success, Failure, BunServices.BunServices | Scope.Scope>,
) =>
  runtime.runPromise(
    Effect.scoped(
      Effect.flatMap(
        Effect.flatMap(FileSystem.FileSystem, (fs) =>
          fs.makeTempDirectoryScoped({ prefix: 'dotfiles-web-test-' }),
        ),
        body,
      ),
    ),
  )

const pullPlan = (dir: string, body: string, version: number, force = false) =>
  pull(dir, { id: ID, slug: SLUG, version, body }, force)

const writeFile = (path: string, text: string) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) => fs.writeFileString(path, text))

const readFile = (path: string) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) => fs.readFileString(path))

const fakePut = (answers: PutResult[]) => {
  const sent: { body: string; version: number }[] = []
  const put = (_id: string, body: string, version: number) =>
    Effect.sync(() => {
      sent.push({ body, version })

      return answers.shift() ?? PutResult.Saved({ version: version + 1 })
    })

  return { sent, put }
}

afterAll(() => runtime.dispose())

describe('push', () => {
  test('unchanged file pushes nothing', () =>
    inTempDir((dir) =>
      Effect.gen(function* () {
        const file = yield* pullPlan(dir, 'one\n', 1)
        const server = fakePut([])
        const result = yield* push(file, server.put)

        expect(result.pushed).toBe(false)
        expect(server.sent).toHaveLength(0)
      }),
    ))

  test('edits go up with the pulled version', () =>
    inTempDir((dir) =>
      Effect.gen(function* () {
        const file = yield* pullPlan(dir, 'one\n', 1)

        yield* writeFile(file, 'one\ntwo\n')

        const server = fakePut([])
        const result = yield* push(file, server.put)

        expect(result).toMatchObject({ pushed: true, merged: false })
        expect(server.sent).toEqual([{ body: 'one\ntwo\n', version: 1 }])
      }),
    ))

  test('a stale version with separate edits merges cleanly and pushes', () =>
    inTempDir((dir) =>
      Effect.gen(function* () {
        const file = yield* pullPlan(dir, 'top\n\nmiddle\n\nbottom\n', 1)

        yield* writeFile(file, 'TOP\n\nmiddle\n\nbottom\n')

        const server = fakePut([PutResult.Stale({ version: 2, body: 'top\n\nmiddle\n\nBOTTOM\n' })])
        const result = yield* push(file, server.put)
        const text = yield* readFile(file)

        expect(result).toMatchObject({ pushed: true, merged: true })
        expect(server.sent.at(-1)).toEqual({ body: 'TOP\n\nmiddle\n\nBOTTOM\n', version: 2 })
        expect(text).toBe('TOP\n\nmiddle\n\nBOTTOM\n')
      }),
    ))

  test('overlapping edits leave conflict markers, then push after resolving', () =>
    inTempDir((dir) =>
      Effect.gen(function* () {
        const file = yield* pullPlan(dir, 'line\n', 1)

        yield* writeFile(file, 'mine\n')

        const conflicted = yield* Effect.flip(
          push(file, fakePut([PutResult.Stale({ version: 2, body: 'theirs\n' })]).put),
        )
        const text = yield* readFile(file)

        expect(conflicted).toBeInstanceOf(ConflictMarkers)
        expect(text).toContain('<<<<<<< local')
        expect(text).toContain('>>>>>>> remote')

        yield* writeFile(file, 'mine and theirs\n')

        const server = fakePut([])

        yield* push(file, server.put)

        expect(server.sent).toEqual([{ body: 'mine and theirs\n', version: 2 }])
      }),
    ))

  test('a file that was never pulled is NotPulled', () =>
    inTempDir((dir) =>
      Effect.gen(function* () {
        const path = yield* Path.Path
        const error = yield* Effect.flip(push(path.join(dir, 'stray.md'), fakePut([]).put))

        expect(error).toBeInstanceOf(NotPulled)
      }),
    ))
})

describe('pull', () => {
  test('refuses to overwrite unpushed edits unless forced', () =>
    inTempDir((dir) =>
      Effect.gen(function* () {
        const file = yield* pullPlan(dir, 'one\n', 1)

        yield* writeFile(file, 'edited\n')

        const refused = yield* Effect.flip(pullPlan(dir, 'server\n', 2))
        const kept = yield* readFile(file)

        expect(refused).toBeInstanceOf(UnpushedChanges)
        expect(kept).toBe('edited\n')

        yield* pullPlan(dir, 'server\n', 2, true)

        const forced = yield* readFile(file)

        expect(forced).toBe('server\n')
      }),
    ))

  test('a clean copy is refreshed', () =>
    inTempDir((dir) =>
      Effect.gen(function* () {
        const file = yield* pullPlan(dir, 'one\n', 1)

        yield* pullPlan(dir, 'two\n', 2)

        const text = yield* readFile(file)

        expect(text).toBe('two\n')
      }),
    ))
})
