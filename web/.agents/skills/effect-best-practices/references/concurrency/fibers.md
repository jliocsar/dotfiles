# Fiber Management

## Which construct

| Construct     | Use when                                                      | Key behavior                                                                                                                   |
| ------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `Fiber<A, E>` | direct handle from a fork                                     | `Fiber.await`→Exit, `Fiber.join`→A (propagates fail), `Fiber.interrupt`, `awaitAll`, `joinAll`, `interruptAll`, `getCurrent()` |
| `FiberHandle` | at most ONE fiber (latest-wins task, debounced worker)        | new `run` interrupts the previous fiber by default                                                                             |
| `FiberMap`    | many fibers KEYED by id (per-connection, per-entity workers)  | `run(map, key, eff)` interrupts prior fiber at that key                                                                        |
| `FiberSet`    | many anonymous fibers as one lifecycle (worker pool, fan-out) | bulk interrupt on scope close; no identity                                                                                     |

## Lifecycle

- All three (`FiberHandle` / `FiberMap` / `FiberSet`): `make()` is scoped (`Effect<_, never, Scope>`) → interrupts all contained fibers when scope closes.
- Fork into them:

```ts
FiberHandle.run(h, eff)
FiberMap.run(m, key, eff)
FiberSet.run(s, eff)
```

All return `Fiber`. Completed fibers auto-remove themselves.

- `.runtime(self)<R>()` / `.runtimePromise(...)` capture an `R`-providing runner returning `Fiber` / `Promise` — use for callback bridges (event handlers that must fork).
- `.join(self)` waits for failure/closure.
- `.awaitEmpty(self)` waits until all current fibers finish.
- Options on run/set/add: `{ onlyIfMissing?, propagateInterruption?, startImmediately? }`.
- DO prefer FiberMap/FiberSet/FiberHandle over hand-rolling fiber arrays — they handle interruption + cleanup + error propagation.

## Deferred (one-shot)

```ts
const d = yield * Deferred.make<A, E>()
yield * Deferred.succeed(d, a)
yield * Deferred.fail(d, e)
yield * Deferred.failCause(d, cause)
yield * Deferred.die(d, defect)
yield * Deferred.done(d, exit)
yield * Deferred.interrupt(d)
yield * Deferred.complete(d, eff)
const a = yield * Deferred.await(d)
yield * Deferred.poll(d)
yield * Deferred.isDone(d)
```

- Complete once. Completers return `Effect<boolean>` (false if already done).
- `complete(self, eff)` runs + memoizes.

## Latch (reusable gate)

```ts
const l = yield * Latch.make(false)
yield * Latch.open(l)
yield * Latch.close(l)
yield * Latch.release(l)
yield * Latch.await(l)
yield * Latch.whenOpen(l, eff)
```

- `Latch.make(open? = false)`. `release` wakes current waiters only.
- Reusable, unlike Deferred.
