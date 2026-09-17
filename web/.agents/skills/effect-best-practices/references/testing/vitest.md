# vitest

`@effect/vitest` re-exports everything from `vitest` (`expect`, `describe`, `assert`, `vi`, `afterAll`, ...) plus Effect-aware helpers. Top-level exports: `it`, `effect`, `live`, `layer`, `flakyTest`, `prop`, `addEqualityTesters`, `makeMethods`, `describeWrapped`.

## `it` methods

- `it.effect(name, () => Effect<...>, timeout?)` — runs Effect with TestClock + TestConsole provided and `Effect.scoped` applied. `Scope.Scope` auto-provided.
- `it.live(name, ...)` — runs with REAL runtime services (real clock/console), `Effect.scoped` applied. No TestEnv.
- `it.layer(layer, options?)(name?, (it) => {...})` — share a layer across a describe block; nested `it` has `.effect` but NO `.live`.
- `.each([...])`, `.skip`, `.skipIf(cond)`, `.runIf(cond)`, `.only`, `.fails`, `.prop(...)` mirror on both `it.effect` and `it.live`.
- `it.flakyTest(effect, timeout?)`.

- DON'T use `it.scoped` — it does not exist in v4. `it.effect` already wraps in `Effect.scoped`, so `Effect.acquireRelease` works directly inside `it.effect`. Porting from v3: drop `it.scoped`.
- DO use `it.effect` for Effect code (auto TestClock/TestConsole + scope); `it.live` only when you need the real clock/IO.

`TestEnv` (auto-provided by `it.effect` and `layer()` unless `excludeTestServices: true`):

```ts
const TestEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer())
```

## Imports

```ts
import { assert, describe, it } from '@effect/vitest'
import { afterAll, assert, describe, expect, it, layer } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as TestClock from 'effect/testing/TestClock'
import { FastCheck, TestClock } from 'effect/testing'
```

Both `effect/testing/TestClock` and `{ TestClock } from "effect/testing"` are valid.

## it.effect + TestClock

```ts
import { assert, describe, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as TestClock from 'effect/testing/TestClock'

describe('TestClock', () => {
  it.effect('sleep - delays effects until time is adjusted', () =>
    Effect.gen(function* () {
      let elapsed = false
      const fiber = yield* Effect.sync(() => {
        elapsed = true
      }).pipe(Effect.delay('10 hours'), Effect.forkChild)
      yield* TestClock.adjust('9 hours')
      assert.isUndefined(fiber.pollUnsafe())
      yield* TestClock.adjust('11 hours')
      assert.deepStrictEqual(fiber.pollUnsafe(), Exit.void)
      assert.isTrue(elapsed)
    }),
  )
})
```

- DO fork with `Effect.forkChild` / `Effect.forkScoped` then `TestClock.adjust(duration)` to drive virtual time.
- DON'T mix real delays with `it.effect` — TestClock means real time never advances.
- `TestClock.adjust(duration: Duration.Input)` advances virtual time by a delta; `TestClock.setTime(timestamp: number)` sets the absolute virtual clock (epoch ms). Both `Effect<void>`, both run scheduled effects up to the new time. Use `setTime` to pin `Clock.currentTimeMillis` to a fixed instant.

## it.layer + nested it.layer

```ts
import { afterAll, expect, it, layer } from '@effect/vitest'
import { Clock, Context, Duration, Effect, Fiber, Layer } from 'effect'
import { FastCheck, TestClock } from 'effect/testing'

class Foo extends Context.Service<Foo, 'foo'>()('Foo') {
  static Live = Layer.succeed(Foo)('foo')
}
class Bar extends Context.Service<Bar, 'bar'>()('Bar') {
  static Live = Layer.effect(Bar)(Effect.map(Foo, () => 'bar' as const))
}

describe('layer', () => {
  layer(Foo.Live)((it) => {
    it.effect('adds context', () =>
      Effect.gen(function* () {
        expect(yield* Foo).toEqual('foo')
      }),
    )

    it.layer(Bar.Live)('nested', (it) => {
      it.effect('adds context', () =>
        Effect.gen(function* () {
          expect(yield* Foo).toEqual('foo')
          expect(yield* Bar).toEqual('bar')
        }),
      )
    })
  })

  layer(Sleeper.layer)('test services', (it) => {
    it.effect('TestClock', () =>
      Effect.gen(function* () {
        const sleeper = yield* Sleeper
        const fiber = yield* Effect.forkChild(sleeper.sleep(100_000))
        yield* Effect.yieldNow
        yield* TestClock.adjust(100_000)
        yield* Fiber.join(fiber)
      }),
    )
  })
})
```

`layer()` semantics:

- Builds the layer ONCE, shares the resulting context across all tests in the block, closes the scope in `afterAll`.
- Both call forms: `layer(L)((it) => {...})` (no describe) and `layer(L)("name", (it) => {...})` (wraps in `describe`).
- Nested `it.layer` merges via a shared memoMap so parent services are reused, not rebuilt.
- `options`: `memoMap`, `timeout` (Duration.Input), `excludeTestServices` (skip TestClock/TestConsole injection — set true when providing a real clock/layer that conflicts).
- DO share services with `layer(L)("name", (it) => ...)`; nest with `it.layer` to add deps.

## Mocking / stubbing services

`Layer.mock(Service, partialImpl)` — loud-failing partial mock. Signatures: `Layer.mock(key, impl): Layer<I>` and curried `Layer.mock(key)(impl): Layer<I>`. `impl` is `PartialEffectful<S>` — supply only the members the test exercises; any omitted member that is an `Effect`/`Stream`/`Channel` (or a function returning one) fails with an `UnimplementedError` defect when called. Non-Effect properties (config values) are required.

```ts
class UserService extends Context.Service<
  UserService,
  {
    readonly getUser: (id: string) => Effect.Effect<{ id: string }, Error>
    readonly deleteUser: (id: string) => Effect.Effect<void, Error>
  }
>()('UserService') {}

const testLayer = Layer.mock(UserService, {
  getUser: (id) => Effect.succeed({ id }),
  // deleteUser omitted → dies with UnimplementedError if called
})
```

- DO use `Layer.mock` for partial service stubs in tests; unimplemented members fail loudly (Die), so tests can't silently pass on unmocked paths.

Building a `Context` by hand (stubs / manual provision):

```ts
let ctx = Context.empty() // Context<never>
ctx = Context.add(ctx, Port, 8080) // add(ctx, tag, value); replaces same key
ctx = Context.add(ctx, Host, 'localhost')
const port = Context.get(ctx, Port) // 8080
```

`Layer.effectContext(effect: Effect<Context<A>>): Layer<A>` — ONE acquisition supplies MULTIPLE tags at once (build a `Context` in the effect, return it). Handy when several test services share one setup. See `../services/layers.md` for canonical coverage.

`Ref` — mutable cell for capturing calls / spy state inside effects:

- `Ref.make(value): Effect<Ref<A>>`
- `Ref.get(ref): Effect<A>`
- `Ref.set(ref, value): Effect<void>` (also curried `Ref.set(value)(ref)`)
- `Ref.update(ref, f: (a) => a): Effect<void>`
- `Ref.getAndSet(ref, value): Effect<A>` — returns the OLD value, sets the new.

```ts
const calls = yield * Ref.make<string[]>([])
yield * Ref.update(calls, (xs) => [...xs, 'getUser'])
assert.deepStrictEqual(yield * Ref.get(calls), ['getUser'])
```

## expect / assert

- `expect` (re-exported vitest): `expect(x).toEqual(...)`, `.toContain(...)`, `.toHaveBeenCalledTimes(n)`.
- `assert` (chai-style, re-exported): `assert.strictEqual`, `assert.deepStrictEqual`, `assert.isTrue/isFalse`, `assert.isUndefined`, `assert.instanceOf`, `assert.throws`, `assert.rejects`.
- Assertions run INSIDE `Effect.gen`; a thrown assertion fails the fiber → the test (failures pretty-printed before the exit is re-raised).

## flakyTest / retry

```ts
it.layer(FetchHttpClient.layer)('FetchHttpClient', (it) => {
  it.effect('google', () =>
    flakyTest(
      Effect.gen(function* () {
        const response = yield* HttpClient.get('https://www.google.com/').pipe(
          Effect.flatMap((_) => _.text),
        )
        expect(response).toContain('Google')
      }),
    ),
  )
})
```

`flakyTest` wraps in `Effect.scoped` + `Effect.sandbox`, retries up to 10 times while elapsed ≤ timeout (default 30s), then `Effect.orDie`.

- DO wrap network / inherently-flaky effects in `flakyTest(...)` inside `it.effect`/`it.layer`.

## Property testing

`it.effect.prop(name, arbitraries, ([values], ctx) => Effect, opts?)`:

- `arbitraries` = array or record of `Schema.Schema` or `FastCheck.Arbitrary`. Schemas auto-convert via `Schema.toArbitrary`.
- `opts.fastCheck` passes FastCheck `Parameters` (e.g. `{ fastCheck: { numRuns: 200 } }`).

```ts
it.effect.prop('reverse twice is identity', [Schema.String], ([value]) =>
  Effect.gen(function* () {
    assert.strictEqual(value.split('').reverse().reverse().join(''), value)
  }),
)
```

- DON'T pass Schemas to the bare top-level `prop` export — it throws on Schemas. Only `it.effect.prop`/`it.live.prop` accept Schemas.
- For `it.live.fails` timeout tests: vitest only LOGS the eventual failure.
