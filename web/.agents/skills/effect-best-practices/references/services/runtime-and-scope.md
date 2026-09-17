# Runtime and Scope

Run effects at the edge: `runMain` for long-running apps, `ManagedRuntime` for framework embedding, `Scope`/finalizers for resources.

## Entrypoint — runMain

```ts
Command.run(cli, { version }).pipe(Effect.provide(MainLayer), NodeRuntime.runMain)
```

- DO use `NodeRuntime.runMain` / `BunRuntime.runMain` for long-running apps; it handles SIGINT/SIGTERM, exit codes, root scope teardown and finalizers. `Runtime.makeRunMain` is the platform-agnostic factory.
- DO use `Effect.runPromise`/`runSync`/`runFork` only for quick/one-shot or tests, at the very edge.

## Layer.launch — run a layer as the whole app

```ts
BackgroundTask.pipe(Layer.launch, NodeRuntime.runMain)
```

## ManagedRuntime — framework embedding

For embedding Effect in non-Effect frameworks (Express/Hono/Fastify) where a handler runs effects repeatedly.

```ts
import { Layer, ManagedRuntime } from 'effect'
export const appMemoMap = Layer.makeMemoMapUnsafe()
export const runtime = ManagedRuntime.make(AppLayer, { memoMap: appMemoMap })
// handler: runtime.runPromise(effect) | runSync | runCallback | runFork(effect): Fiber
process.once('SIGINT', () => void runtime.dispose())
process.once('SIGTERM', () => void runtime.dispose())
```

Instance methods: `runFork`, `runSyncExit`, `runSync`, `runCallback`, `runPromise`. Has `.scope: Scope.Closeable`, `.memoMap`, `.contextEffect`.

- DO create ONE runtime per app and share it across handlers.
- DO pass a shared global `memoMap` (`Layer.makeMemoMapUnsafe()`), else layers rebuild per call / duplicate across runtimes.
- DO `runtime.dispose()` on shutdown (tears down layers/scope).
- DO keep business logic in services/Effect; use the runtime ONLY at the boundary.
- DON'T call `runPromise`/`runSync` deep inside business logic (run-at-the-edge rule).

## Scope and resources

### acquireRelease — any resource needing cleanup

```ts
const transporter =
  yield *
  Effect.acquireRelease(
    Effect.sync(() =>
      NodeMailer.createTransport({ /* ... */ auth: { pass: Redacted.value(pass) } }),
    ),
    (t) => Effect.sync(() => t.close()),
  )
```

Inside a `Layer.effect`/service `make`, acquired resources release when the layer scope closes.

### addFinalizer — ad-hoc cleanup in a layer

```ts
Layer.effect(
  Connection,
  Effect.gen(function* () {
    yield* Scope.addFinalizer(Effect.log('Closing connection'))
    return Connection.of({/* ... */})
  }),
)
```

### Background tasks tied to scope

- `Effect.forkScoped` — fiber interrupted when scope closes.
- `Layer.effectDiscard(eff)` — layer that runs background work without exposing a service.

### Rules

- Release/finalizer phase MUST be infallible (`Effect.sync` or handle errors). Fallible finalizers → dangling resources.
- Acquire phase should be infallible or handle errors.
- Finalizers run even on interruption (guaranteed).
- DON'T manually open scopes you forget to close — prefer `acquireRelease`/`scoped`/layer lifecycle.

## LayerMap.Service — dynamic, keyed resources

For per-key resources (e.g. per-tenant pools).

```ts
export class PoolMap extends LayerMap.Service<PoolMap>()('app/PoolMap', {
  lookup: (tenantId: string) => DatabasePool.layer(tenantId),
  idleTimeToLive: '1 minute',
}) {}
// PoolMap.get("acme") → scoped layer; PoolMap.invalidate("acme"); provide PoolMap.layer
```
