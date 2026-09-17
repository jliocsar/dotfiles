# Anti-Patterns

Forbidden patterns and v3 holdovers. Each is wrong in Effect v4; the fix follows.

## v3 names that no longer exist

- DON'T `Effect.Service` → use `Context.Service<X>()("id", { make })`. See `services/services.md`.
- DON'T expect an auto `.Default`/`.layer` static → hand-write `static readonly layer = Layer.effect(this)(this.make)`.
- DON'T `Context.Tag` / `Context.GenericTag` → `Context.Service`. `FiberRef` → `Context.Reference`.
- DON'T `Effect.catchAll` → `Effect.catch`; `catchAllCause` → `catchCause`; `catchAllDefect` → `catchDefect`; `catchSome` → `catchFilter` (Filter-based, not Option); `catchSomeCause` → `catchCauseFilter`. `catchSomeDefect` removed.
- DON'T `Either` → use `Result` (no `Either.ts` in v4). `decodeEither` → `decodeResult`/`decodeExit`.
- DON'T `Schema.TaggedError` → `Schema.TaggedErrorClass<Self>()("Tag", {...}, annotations)`.
- DON'T `Schema.minLength`/`Schema.pattern`/`Schema.filter(...)` constructors → `.check(Schema.isMinLength(n))`, `.check(Schema.isPattern(re))`, etc.
- DON'T top-level `Schema.transform` → `.pipe(Schema.decodeTo(to, { decode, encode }))`.
- DON'T `Schema.Record({ key, value })` → positional `Schema.Record(key, value)`. `Schema.Union(a, b)` → array form `Schema.Union([a, b])`.
- DON'T `metric.increment()` / `metric.record()` / `Effect.withMetric` → standalone `Metric.update(m, v)` / `Metric.modify(m, d)`.
- DON'T `Schedule.intersect`/`Schedule.union` → `Schedule.both`/`Schedule.either`. No `Schedule.linear`.
- DON'T `Effect.forEachPar`/`allPar`/`zipPar`/`zipWithPar` (and any `*Par` suffix) → pass `{ concurrency }` to the base combinator (`Effect.forEach(xs, f, { concurrency })`), or bound with `Semaphore.make(n)`.
- DON'T `Stream.mapEffectPar` → `Stream.mapEffect(f, { concurrency })`. `Queue.takeUpTo` does not exist.
- DON'T `Effect.fork`/`forkDaemon` → `forkChild`/`forkScoped`/`forkIn`/`forkDetach`.
- DON'T AI `model.withRequirements` → `Model.captureRequirements`.
- DON'T `BunRuntime.layer` (does not exist) → provide `BunServices.layer`, run with `BunRuntime.runMain`.
- DON'T import platform Tags from `@effect/platform` → import from core `effect/...` (e.g. `effect/FileSystem`).

## Structural anti-patterns

- DON'T write functions that `return Effect.gen(...)` → use `Effect.fn("name")` (adds span + stack frame).
- DON'T `.pipe(...)` the result of `Effect.fn` → pass combinators as additional arguments.
- DON'T omit `return` when failing inside a generator → always `return yield* new SomeError(...)` so TS narrows control flow.
- DON'T scatter `Effect.runSync`/`runPromise` through business logic → run only at the entrypoint (`runMain`) or framework boundary (`ManagedRuntime`).
- DON'T `Effect.runSync` an async effect (it dies) → use `runPromise`.
- DON'T create multiple `ManagedRuntime`s without a shared `Layer.makeMemoMapUnsafe()` → layers rebuild per runtime. Always `dispose()` on shutdown.
- DON'T overuse `Service.use`/`useSync` → prefer `yield*`; `use` leaks deps and hides requirements.
- DON'T reuse one service id string across unrelated services → Context slot collision.
- DON'T `Layer.merge` when you need a dependency satisfied → `provide` (hide) or `provideMerge` (expose).
- DON'T leave finalizers/release effects fallible → release must be infallible (`Effect.sync` or fully handled).

## Domain modeling anti-patterns

- DON'T use `null`/`undefined` in domain types → model absence with `Option<T>` (`Schema.OptionFromNullOr` at boundaries).
- DON'T `Option.getOrThrow` → `Option.match` / `Option.getOrElse`.
- DON'T collapse distinct failures into one generic error → one `Schema.TaggedErrorClass` per failure reason, with context fields.
- DON'T leave entity ids as plain `string` across boundaries → brand them (`Schema.brand`).

## Side-effect anti-patterns

- DON'T `console.log` inside effects → `Effect.log*` (level filtering, annotations, OTLP export). See `observability/logging.md`.
- DON'T read `process.env` directly → `Config.*` + `ConfigProvider`. See `services/config.md`.
- DON'T `Redacted.value(...)` early or log secrets → unwrap only at point of use.
- DON'T create atoms inside React render, skip `keepAlive` on global atoms, or confuse `AsyncResult` (atom async state) with `effect/Result`. See `atom/atoms.md`.
- DON'T treat HTTP non-2xx as success in `HttpClient` → add `filterStatusOk`. See `networking/http-client.md`.
