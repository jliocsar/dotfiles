# Batching

Request + RequestResolver. Batch is formed by concurrent requests in a window; dedup is automatic.

```ts
class GetUserById extends Request.Class<{ readonly id: number }, User, UserNotFound, never> {}

const resolver =
  yield *
  RequestResolver.make<GetUserById>(
    Effect.fn(function* (entries) {
      for (const entry of entries) {
        const user = table.get(entry.request.id)
        entry.completeUnsafe(
          user ? Exit.succeed(user) : Exit.fail(new UserNotFound({ id: entry.request.id })),
        )
      }
    }),
  ).pipe(
    RequestResolver.setDelay('10 millis'), // batching window (more batched, +latency)
    RequestResolver.withSpan('Users.getUserById.resolver'),
    RequestResolver.withCache({ capacity: 1024 }), // LRU dedupe across calls
  )

const getUserById = (id: number) => Effect.request(new GetUserById({ id }), resolver)

yield * Effect.forEach([1, 2, 1, 3, 2], getUserById, { concurrency: 'unbounded' }) // ONE resolver call, ids [1,2,3]
```

- `entries` is the batched array of requests. Complete each via `entry.completeUnsafe(Exit)`.
- `entry.context` → access request requirements (e.g. `Tracer.ParentSpan`).
- API: `RequestResolver.make`, `makeWith`, `makeGrouped`, `setDelay` / `setDelayEffect`, `withSpan`, `withCache`, `batchN`.
- `RequestResolver.batchN(resolver, n)` (or curried `batchN(n)`) caps each batch at `n`; overflow spills into later batches — e.g. 12 reqs at `n: 5` → runAll called with `[5, 5, 2]`. Use to bound a downstream `WHERE id IN (...)` / API page size.
- DO wrap resolver in a service method returning `Effect.request(...)`.
- DO run callers with `Effect.forEach(..., { concurrency })` so they fall in the same batch window.
- DON'T `await` / run requests sequentially — that defeats batching.

## Keyed cache (`effect/Cache`)

Per-key memoization with TTL and automatic concurrent-lookup dedupe. Reach for this instead of hand-rolling a `Map` + TTL + in-flight table.

```ts
const cache =
  yield *
  Cache.make({
    capacity: 1024,
    timeToLive: '5 minutes',
    lookup: (id: UserId) => repo.findById(id), // (key) => Effect<Value, E, R>
  })

const user = yield * Cache.get(cache, id) // concurrent gets for the same key share ONE lookup
yield * Cache.invalidate(cache, id) // force staleness for one key
yield * Cache.refresh(cache, id) // re-run lookup now, keep serving old value until it lands
const present = yield * Cache.has(cache, id)
yield * Cache.invalidateAll(cache)
```

- Operations are STANDALONE functions taking the cache first: `Cache.get(cache, key)`, NOT `cache.get(key)` (the instance has no methods).
- Per-entry / exit-aware TTL: `Cache.makeWith(lookup, { capacity, timeToLive: (exit, key) => Duration })` — e.g. short TTL on failures, long on success.
- Single value, no key: `Effect.cached(effect)` (memoize once) / `Effect.cachedWithTTL(effect, "30 seconds")`.
- DON'T hand-roll Map/TTL/prune or in-flight dedupe — `Cache` is exactly that. See `anti-patterns.md`.

## Scoped cache (`effect/ScopedCache`)

Like `Cache`, but for values needing cleanup (connections, file handles). Each entry's lookup runs in its OWN scope; the finalizer fires on eviction (capacity/TTL) or when the cache's owning scope closes.

```ts
const cache =
  yield *
  ScopedCache.make({
    capacity: 10,
    timeToLive: '1 minute',
    lookup: (id: Key) =>
      // (key) => Effect<A, E, R | Scope>
      Effect.acquireRelease(open(id), (h) => h.close()),
  })

const h = yield * ScopedCache.get(cache, id) // concurrent gets for a key share ONE lookup
yield * ScopedCache.invalidate(cache, id) // evict + run that entry's finalizer
yield * ScopedCache.refresh(cache, id)
```

- Construct inside a `Scope` (`Effect.scoped` / a `Layer`) — the cache holds every live entry's finalizer.
- `lookup` returns `Effect<A, E, R | Scope.Scope>`; the `Scope` is per-entry, supplied by the cache — you don't close it.
- Per-exit TTL: `ScopedCache.makeWith({ lookup, capacity, timeToLive: (exit, key) => Duration })`.
- Ops (STANDALONE, cache-first): `get`, `getOption`, `has`, `invalidate`, `refresh`, `invalidateAll`, `size`.
- Use over `Cache` when the cached value owns a resource; use plain `Cache` for pure/cheap values.
