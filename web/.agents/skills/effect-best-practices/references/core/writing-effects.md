# Writing Effects

## Canonical style: Effect.gen + Effect.fn

- DO write Effect code with `Effect.gen(function*() { ... })` for imperative blocks; `yield*` unwraps an effect (like `await`).
- DO attach extra behaviour via `.pipe(...)` AFTER the `Effect.gen` block.
- DON'T write standalone functions that `return Effect.gen(...)` — use `Effect.fn` instead.
- DO name service methods with `Effect.fn("Service.method")(...)` inside the layer.

```ts
Effect.gen(function* () {
  yield* Effect.log('Reading file...')
  return yield* new FileProcessingError({ message: 'Failed to read the file' })
}).pipe(
  Effect.catch((error) => Effect.logError(`An error occurred: ${error}`)),
  Effect.withSpan('fileProcessing', { attributes: { method: 'Effect.gen' } }),
)
```

## The "return yield*" rule

- DO `return yield*` when raising/failing inside a generator, so TS control-flow narrows that execution stops.
- DON'T write a bare `yield* new SomeError(...)` as a non-final statement and expect TS to know the block ended.

## Effect.fn

- `Effect.fn("name")(function*(...args) { ... }, ...combinators)` — the string improves stack traces (adds stack frames) and attaches a tracing span via `Effect.withSpan`. The string SHOULD match the fn name.
- `Effect.fn` ACTS AS A PIPE: pass post-processing combinators as additional args; they run after the body and transform the resulting Effect.
- DON'T `.pipe(...)` on the result of `Effect.fn` — pass combinators as extra arguments instead.
- DO annotate the generator return type with `Effect.fn.Return<A, E>` (NOT `Effect.Effect<...>` directly).

```ts
export const effectFunction = Effect.fn('effectFunction')(
  function* (n: number): Effect.fn.Return<string, SomeError> {
    yield* Effect.logInfo('Received number:', n)
    return yield* new SomeError({ message: 'Failed to read the file' })
  },
  Effect.catch((error) => Effect.logError(`An error occurred: ${error}`)),
  Effect.annotateLogs({ method: 'effectFunction' }),
)
```

- The body may be a plain `(args) => Effect<...>`, not only a generator:

```ts
export const parsePayload = Effect.fn('parsePayload')((input: string) =>
  Effect.try({
    try: () => JSON.parse(input),
    catch: (cause) => new InvalidPayload({ input, cause }),
  }),
)
```

- `Effect.fnUntraced(function*(...) {...})` — same shape, NO span/stack frames. Use when tracing is not wanted.

## Return-type helpers

- `Effect.gen.Return<A, E, R>` = `Generator<Effect<any, E, R>, A, any>`.
- `Effect.fn.Return<A, E>` annotates the `Effect.fn` generator body.

## Effect constructors

| Source                         | API                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| in-memory value                | `Effect.succeed(value)`                                                                     |
| sync side-effect (won't throw) | `Effect.sync(() => ...)`                                                                    |
| sync that may throw            | `Effect.try({ try, catch })`                                                                |
| Promise that may reject        | `Effect.tryPromise({ try, catch })` (async `try` supported; `try(signal)` gets AbortSignal) |
| nullable                       | `Effect.fromNullishOr(value)` then `.pipe(Effect.mapError(...))`                            |
| callback API                   | `Effect.callback<A>((resume) => { ...; return Effect.sync(cleanup) })`                      |
| short-circuit none/some        | `Effect.succeedNone` / `Effect.succeedSome`                                                 |

- In `Effect.callback`, DO return a finalizer (`Effect.sync(cleanup)`) so interruption cancels the source.
- `try`/`tryPromise` take `{ try, catch }` where `catch` maps the thrown value to a typed error.

## Running effects

| API                              | Returns               | When                                                                 |
| -------------------------------- | --------------------- | -------------------------------------------------------------------- |
| `Effect.runFork(effect, opts?)`  | `Fiber<A, E>`         | fire-and-forget / supervise a fiber                                  |
| `Effect.runPromise(effect)`      | `Promise<A>`          | async edge; rejects on failure                                       |
| `Effect.runPromiseExit(effect)`  | `Promise<Exit<A, E>>` | async edge, want full Exit                                           |
| `Effect.runSync(effect)`         | `A`                   | SYNCHRONOUS effects only; THROWS on failure, dies if effect is async |
| `Effect.runSyncExit(effect)`     | `Exit<A, E>`          | sync, want full Exit                                                 |
| `Effect.runCallback(effect, cb)` | —                     | callback edge                                                        |

- DO use `NodeRuntime.runMain(program, { disableErrorReporting?: true })` / `BunRuntime.runMain` as the PROCESS ENTRYPOINT — installs SIGINT/SIGTERM handlers and interrupts fibers for graceful shutdown.
- DO use `Layer.launch(layer)` when the whole app is layers (returns long-running `Effect<never>`), then `runMain`.
- DO use `ManagedRuntime.make(layer, { memoMap })` to bridge into non-Effect frameworks (Hono/Express/etc). Methods: `runPromise`, `runSync`, `runCallback`, `dispose`. ALWAYS `dispose()` on shutdown.
- DON'T spin up multiple `ManagedRuntime`s without sharing a memo map: create `Layer.makeMemoMapUnsafe()` once and pass `{ memoMap }` to each, else layer memoization breaks.
- DON'T call `run*` deep inside Effect code — run only at the outermost edge/entrypoint.
- DON'T `Effect.runSync` an async effect (it dies); use `runPromise`.
