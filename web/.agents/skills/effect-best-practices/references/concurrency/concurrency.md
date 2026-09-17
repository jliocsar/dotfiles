# Concurrency Control

`Concurrency = number | "unbounded" | "inherit"`. Default for combinators is sequential (`concurrency` unset ≈ 1).

## Effect.all / Effect.forEach

```ts
Effect.all([eff1, eff2, eff3], { concurrency: 'unbounded' })
Effect.all({ a: eff1, b: eff2 })
Effect.all(effs, { discard: true })
Effect.all(effs, { mode: 'result' })

Effect.forEach([1, 2, 1, 3, 2], getUserById, { concurrency: 'unbounded' })
```

- `Effect.all(arg, { concurrency?, discard?, mode? })`. Record form returns keyed result. `discard: true` → `Effect<void>`. `mode: "result"` collects `Result<A, E>` per item, no short-circuit.
- `Effect.forEach(iterable, f, { concurrency?, discard? })`.
- DO set explicit `concurrency` for I/O-bound fan-out.
- DON'T leave it default (= sequential) and expect parallelism.
- DON'T look for `*Par` variants — concurrent behavior is options-driven.

## withConcurrency + "inherit"

```ts
Effect.withConcurrency(self, n | 'unbounded')
```

- DO use `Effect.withConcurrency` to set an inherited limit for an effect + descendants that opt into `concurrency: "inherit"`.

## Semaphore

```ts
const sem = yield * Semaphore.make(2)
yield * sem.withPermits(1)(task)
sem.withPermitsIfAvailable(n)(task)
```

- `Semaphore.make(n)` — NOT `Effect.makeSemaphore` (removed).
- `withPermit` = `withPermits(1)`.
- `withPermitsIfAvailable(n)(task)` → `Effect<Option<A>>`.
- Also: `take` / `release` / `releaseAll` / `resize`, `makeUnsafe(n)`.
- DO use Semaphore for explicit permit-based limiting.

## Forking (v4 names)

```ts
Effect.forkChild(self, options?)
Effect.forkScoped(self, options?)
Effect.forkIn(self, scope)
Effect.forkDetach(self, options?)
```

- `forkChild` — child fiber; parent supervises.
- `forkScoped` — fiber tied to current `Scope`; interrupted on scope close. Preferred for background tasks within a resource.
- `forkIn(self, scope)` — fork into an explicit scope.
- `forkDetach` — v4 rename of `forkDaemon`; global/daemon fiber, outlives parent.
- All take `{ startImmediately?, uninterruptible?: boolean | "inherit" }`.
- GONE in v4: `Effect.forkDaemon` (→ `forkDetach`), plain `Effect.fork` (use `forkChild`/`forkScoped`), `Effect.disconnect`.

## Racing

```ts
Effect.race(a, b)
Effect.raceFirst(a, b)
Effect.raceAll(effs)
Effect.raceAllFirst(effs)
```

- `race(a, b)` — first success wins (failures ignored until success/all-fail).
- `raceFirst(a, b)` — first to settle wins (success OR failure).
- `raceAll(effs)` — first success of many.
- `raceAllFirst(effs)` — new in v4; first to settle of many.
- All accept `{ onWinner }` callback.
- GONE: `Effect.raceWith`.

## zip / zipWith — concurrent via option

```ts
Effect.zip(a, b, { concurrent: true })
Effect.zipWith(a, b, (x, y) => ..., { concurrent: true })
```

- DON'T look for `zipPar` — use `{ concurrent: true }`.

## Interruption / structured concurrency

```ts
Effect.interrupt
Effect.interruptible(self)
Effect.uninterruptible(self)
Effect.uninterruptibleMask((restore) => ...)
Effect.interruptibleMask((restore) => ...)
Effect.onInterrupt(self, (interruptors: ReadonlySet<number>) => cleanup)
```

- `uninterruptibleMask` / `interruptibleMask` — critical sections with selective restore.
- DO wrap acquire+use in `uninterruptibleMask` for resource safety.
- DON'T put cleanup in a plain `tap` — it won't run on interrupt. Use `onInterrupt` / `ensuring` / `acquireRelease`.
