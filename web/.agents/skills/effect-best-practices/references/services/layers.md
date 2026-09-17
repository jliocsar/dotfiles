# Layers

Compose services with `merge`/`provide`/`provideMerge`. Layers are memoized by default. Attach as `static readonly layer` on the service class.

## Combinator selection

| Combinator                                  | Output type                                              | Use when                                                                        |
| ------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `Layer.merge(a, b)` / `Layer.mergeAll(...)` | `ROut_a \| ROut_b`, requirements unioned                 | Combine INDEPENDENT services (neither needs the other).                         |
| `self.pipe(Layer.provide(dep))`             | only `self`'s ROut; `dep`'s requirements consumed/HIDDEN | Feed a dependency into `self` and HIDE it from callers (`Exclude<RIn2, ROut>`). |
| `self.pipe(Layer.provideMerge(dep))`        | `self` ROut + `dep` ROut both exposed                    | Feed dep into self AND keep dep visible downstream.                             |

```ts
static readonly layer = this.layerNoDeps.pipe(Layer.provide(SqlClientLayer))
static readonly layerWithSqlClient = this.layerNoDeps.pipe(Layer.provideMerge(SqlClientLayer))
```

## Layer.effect

Build a service layer from an effect that produces its shape.

```ts
static readonly layer = Layer.effect(this)(this.make)
```

## Layer.sync — lazy synchronous service

Provide ONE service whose value is built synchronously, deferred until the layer is built (lazy `succeed`). `Layer.sync(Service, () => impl)`.

```ts
static readonly layer = Layer.sync(this, () => ({ query: (sql: string) => Effect.succeed(`Query: ${sql}`) }))
```

## Layer.effectContext — one acquisition, MANY tags

Build a `Context` holding MULTIPLE services in a single effect and expose them all: `Layer.effectContext(eff): Layer<A, E, Exclude<R, Scope>>` where `eff: Effect<Context.Context<A>, E, R>`. Use when one acquisition step yields several related services.

```ts
static readonly layer = Layer.effectContext(Effect.gen(function*() {
  const conn = yield* openConnection
  return Context.empty().pipe(Context.add(Reader, mkReader(conn)), Context.add(Writer, mkWriter(conn)))
}))
```

(`Context.make(Tag, impl)` also works for the single-tag case; `Layer.effect`/`Layer.sync` are simpler when providing just one.)

## Layer.unwrap — config-driven dynamic layer

Returns a `Layer` from an `Effect<Layer>`; pick the implementation at build time.

```ts
static readonly layer = Layer.unwrap(Effect.gen(function*() {
  const inMem = yield* Config.boolean("MESSAGE_STORE_IN_MEMORY").pipe(Config.withDefault(false))
  return inMem ? MessageStore.layerInMemory : MessageStore.layerRemote(yield* Config.url("MESSAGE_STORE_URL"))
}))
```

## Bootstrap assembly

```ts
const MainLayer = Layer.mergeAll(Fixtures.layer, Reporter.layer).pipe(
  Layer.provideMerge(NodeServices.layer),
)
Command.run(cli, { version }).pipe(Effect.provide(MainLayer), NodeRuntime.runMain)
```

## Memoization + Layer.fresh

- Layers are memoized by default: yielding the same service twice returns the SAME instance. Memoization is keyed via the `MemoMap`.
- `Layer.fresh(layer)` opts OUT — builds a new instance each use.
- For multi-runtime apps share a single `MemoMap` via `Layer.makeMemoMapUnsafe()` (see `runtime-and-scope.md`).
- `Effect.provide(layer, { local: true })` opts OUT at the provide site — builds/acquires the layer FRESH for that provide instead of sharing across provide calls (default `local: false` shares). Use for isolated acquisition per provide.

## When to prefer each

- DO attach layers as `static readonly layer` on the service class.
- DO keep layers focused (one service / small related group).
- DO prefer `provide` over leaving requirements open so types stay small and deps are explicit.
- DON'T use `Layer.merge` where you meant `provide` — `merge` leaves deps unsatisfied/exposed; `provide` hides+consumes, `provideMerge` keeps both.
