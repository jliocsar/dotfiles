# Services

`Context.Service` is the v4 service constructor. Type params come FIRST; the id string is passed to the returned function. A service Key IS an `Effect<Shape, never, Identifier>`, so `yield* MyService` retrieves it.

## v3 → v4

- DON'T use `Effect.Service` — it does NOT exist in v4. Use `Context.Service`.
- `Context.Tag(id)<Self,Shape>()` → `Context.Service<Self,Shape>()(id)`.
- `Context.GenericTag<T>(id)` → `Context.Service<T>(id)`.
- `Effect.Tag` proxy accessors REMOVED → use `Service.use`/`Service.useSync`, or prefer `yield*`.
- `Context` is NOT renamed (it is not `ServiceMap`). A `Context<Services>` is the env collection.
- There is NO auto-generated `.Default` or `.layer` static. The `make` option only sets a `.make` static; it does NOT create a layer. You write `static readonly layer` yourself.

## Canonical pattern — class with `make` (preferred)

Deps resolved via `yield*` inside `make`; layer wired by hand.

```ts
export class Rollup extends Context.Service<Rollup>()('@effect/bundle/Rollup', {
  make: Effect.gen(function* () {
    const pathService = yield* Path.Path
    const fs = yield* FileSystem.FileSystem
    const bundle = Effect.fn('Rollup.bundle')(function* (options: BundleOptions) {
      /* ... */
    })
    return Rollup.of({ bundle })
  }),
}) {
  static readonly layer = Layer.effect(this)(this.make)
}
```

`make` returns the service shape through the class's own `.of({ ... })` static instead of `... as const`. `Service.of` is the identity function verified in `effect@4.0.0-beta.100`; it pins the return to the declared shape so excess/missing/mistyped members fail at the `return`, not at a distant call site. Self-referencing the class inside its own `make` is safe — the generator body runs when the layer is built, after the binding exists.

`Layer.effect(this, this.make)` and curried `Layer.effect(this)(this.make)` are both valid:

```ts
export class Fixtures extends Context.Service<Fixtures>()('@effect/bundle/Fixtures', {
  make: Effect.gen(function* () {
    /* ... */ return Fixtures.of({ fixtures, fixturesDir })
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
```

## Scoped resource via `make`

Resource acquired in `make` is released when the layer scope closes.

```ts
export class PgContainer extends Context.Service<PgContainer>()('test/PgContainer', {
  make: Effect.acquireRelease(
    Effect.tryPromise({
      try: () => new PostgreSqlContainer('postgres:alpine').start(),
      catch: (cause) => new ContainerError({ cause }),
    }),
    (container) => Effect.promise(() => container.stop()),
  ),
}) {
  static readonly layer = Layer.effect(this)(this.make)
}
```

## Class without `make` (simple value services)

```ts
class Database extends Context.Service<
  Database,
  {
    readonly query: (sql: string) => Effect.Effect<string>
  }
>()('Database') {}
// provide with Layer.succeed(Database, { query: ... }) or Layer.effect(Database, makeEff)
```

## id naming convention

- DO make the id string `package + path`, e.g. `"@effect/bundle/Rollup"`, `"myapp/db/Database"`. The id is the runtime identity.
- DON'T reuse one id string across unrelated services — they collide in the same Context slot.

## Context.Reference — defaulted services

For config/feature-flags/anything with a sensible default; no provision needed. Getter returns the default when no override is provided.

```ts
export const UndiciOptions = Context.Reference<Partial<Undici.Dispatcher.RequestOptions>>(
  '@effect/platform-node/NodeHttpClient/UndiciOptions',
  { defaultValue: () => ({}) },
)
```

```ts
class Interrupts extends Context.Reference('Interrupts', {
  defaultValue: () => ({ interrupts: 0 }),
}) {}
```

- DO use `Context.Service` when the dependency MUST be provided (fails if missing).
- DO use `Context.Reference` when a cached default is acceptable.

## Accessors: `use`/`useSync` vs `yield*`

- `Service.use(f)` → `Effect<A, E, R | Identifier>`; `Service.useSync(f)` → `Effect<A, never, Identifier>`.
- DO prefer `yield*` over `use`. `use` leaks the dependency into return values and hides the requirement at the call site.
- DO use `use` only for trivial one-liners.

## Service methods

- DO wrap method implementations in `Effect.fn("Name.method")(...)` so spans get named.
