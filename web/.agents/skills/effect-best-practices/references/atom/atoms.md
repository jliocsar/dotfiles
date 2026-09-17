# Atoms (core)

Core `Atom` module lives in **`effect/unstable/reactivity`** — NOT a separate `@effect/atom` core package.

```ts
import { Atom, AtomRegistry, AsyncResult, AtomRef, Hydration } from 'effect/unstable/reactivity'
```

## CRITICAL: AsyncResult vs effect/Result

- Atom async state type is **`AsyncResult`** (tags `Initial | Success | Failure`).
- `effect/Result` is a synchronous Either-like type — a different module. DO NOT confuse them. React atoms use `AsyncResult`.
- Every `AsyncResult` carries a `.waiting` flag. `Success` has `.value` + `.timestamp`; `Failure` has `.cause` + `.previousSuccess`.

## Atom.make (polymorphic)

```ts
Atom.make(0) // => Writable<number>  (plain value = writable state atom)
Atom.make((get) => get(a) + get(b)) // => Atom<number>      (sync derived/computed, read-only)
Atom.make(Effect.succeed(1)) // => Atom<AsyncResult<number, never>>
Atom.make((get) => Effect.succeed(get(seed) + 1)) // => Atom<AsyncResult<...>>  (derived from Effect)
Atom.make(someStream) // => Atom<AsyncResult<A, E | NoSuchElementError>>
Atom.make(eff, { initialValue: 0 }) // seed Success(0) instead of Initial
Atom.make(eff, { uninterruptible: true }) // effect not interrupted on dispose/refresh
```

- **Plain value → `Writable<A>`**; **function/Effect/Stream → read-only `Atom`** (effect/stream wrapped in `AsyncResult`).
- Derived atoms read deps via the `get` callback (`AtomContext`); re-run automatically when deps change.
- Low-level constructors: `Atom.readable(read, refresh?)`, `Atom.writable(read, write, refresh?)`. `Writable.write` signature: `(ctx: WriteContext<R>, value: W) => void`.
- DO define atoms at module scope. DON'T build them inside a component body.

## Atom.family — memoized atom factory

```ts
const userAtom = Atom.family((id: number) => Atom.make(Effect.succeed(id)))
userAtom(1) === userAtom(1) // same atom instance for same arg
```

- Uses `WeakRef` + `FinalizationRegistry` when available so unused entries are GC'd.
- DO use `family` for per-key/parameterized atoms instead of building atoms inline (breaks identity).
- An atom built via a family is auto-disposed when no subscribers; combine with `keepAlive` per entry:

```ts
Atom.family((n) => Atom.make(n).pipe(Atom.keepAlive))
```

## Atom.fn — effectful/async write-triggered atom

```ts
const search = Atom.fn((q: string, get) => Effect.succeed(...))     // AtomResultFn<string, A, E>
const search = Atom.fn<string>()((q, get) => Effect.succeed(...))   // curried for explicit Arg type
Atom.fn(effFn, { initialValue, concurrent: true })                  // options
```

- Returns `AtomResultFn<Arg, A, E>` = `Writable<AsyncResult<A,E>, Arg | Reset | Interrupt>`. Value is an `AsyncResult` (starts `Initial`); **writing the arg triggers** the effect/stream.
- `concurrent: true` keeps all in-flight fibers (joins them); default re-runs/interrupts previous.
- Control symbols: write `Atom.Reset` to return to initial, `Atom.Interrupt` to cancel current run.
- `Atom.fnSync`: synchronous version → `Writable<Option<A>, Arg>` (`Option.none` before first call) or `Writable<A, Arg>` with `{ initialValue }`.
- DO use `Atom.fn` for user-triggered async actions (mutations, searches); write the arg to run it.

## Effect-runtime atoms (layers / services) — Atom.runtime

```ts
const runtime = Atom.runtime(MyServiceLayer)   // AtomRuntime<R, E>
const data = runtime.atom(Effect.gen(function*(){ const s = yield* MyService; return yield* s.load }))
const action = runtime.fn((arg, get) => Effect.gen(function*(){ ... }))    // effect has access to R
runtime.pull(stream)            // paginated/streamed
runtime.subscriptionRef(eff)    // wrap a SubscriptionRef
runtime.fn(eff, { reactivityKeys: ["counter"] })   // auto-refresh on Reactivity key change
```

- `runtime.atom` / `runtime.fn` give the inner Effect access to the layer's services `R`.
- The layer is built once via a shared `MemoMap` (`Atom.defaultMemoMap`).
- Replace a runtime's layer in tests:

```ts
AtomRegistry.make({ initialValues: [Atom.initialValue(runtime.layer, TestLayer)] })
```

## keepAlive / lifecycle

- Atoms are **lazy + auto-disposed by default**: dropped when no subscribers/mounts (after `idleTTL`).
- `Atom.keepAlive(self)` → keeps cached & mounted even with zero subscribers. `Atom.autoDispose(self)` undoes it.
- `Atom.setIdleTTL(self, duration)` → finite duration disposes after inactivity; infinite ⇒ keepAlive.
- DO `keepAlive` atoms whose state must survive unmount (shared caches). Runtime layers are kept alive internally.
- DON'T assume a non-keepAlive atom retains state after all subscribers unmount — it's disposed after `idleTTL`.

## Other combinators

`Atom.map`, `Atom.mapResult` (map inside AsyncResult), `Atom.transform`, `Atom.debounce`, `Atom.withRefresh`, `Atom.withFallback` (fallback while Initial), `Atom.swr` (stale-while-revalidate w/ `staleTime`, `revalidateOnFocus`), `Atom.optimistic` / `Atom.optimisticFn`, `Atom.pull` (paginated stream), `Atom.refreshOnWindowFocus`, `Atom.kvs` (KeyValueStore-backed), `Atom.searchParam` (URL param), `Atom.withLabel`, `Atom.batch`, `Atom.initialValue`, `Atom.serializable`/`Atom.withServerValue`/`Atom.getServerValue` (SSR).

## Side-effect atoms with finalizers

Sync atom — `get.addFinalizer` runs on dispose/refresh:

```ts
const ws = Atom.make((get) => {
  const socket = new WebSocket(url)
  get.addFinalizer(() => socket.close())
  return initial
})
```

Effect-based atom — finalizers inside the Effect scope run automatically on dispose/refresh (the atom opens a scope and closes it via an internal finalizer). `Effect.addFinalizer` / `Effect.acquireRelease` inside an `Atom.make(effect)` or `Atom.fn` effect is the idiomatic cleanup; it runs on each re-run/dispose.

`AtomContext` also exposes: `get(atom)`/`get.get`, `get.result(asyncAtom)` (→Effect awaiting Success), `get.once`, `get.refresh`, `get.refreshSelf`, `get.self()` (→Option of prev value), `get.setSelf`, `get.set(writable, v)`, `get.subscribe`, `get.stream`/`get.streamResult`, `get.mount`, `get.registry`.

## Imperative access outside React (Effects)

`Atom.get(atom)`, `Atom.set(atom, v)`, `Atom.update`, `Atom.modify`, `Atom.refresh`, `Atom.getResult`, `Atom.mount`, `Atom.toStream`/`Atom.toStreamResult` are Effects requiring `AtomRegistry`. Direct registry methods: `registry.get/set/update/modify/refresh/subscribe/mount/getNodes/reset/dispose`.
