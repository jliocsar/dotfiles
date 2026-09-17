# Streams

`Stream.mapEffectPar` does NOT exist in v4. Use `Stream.mapEffect(f, { concurrency })`.

## Construction

```ts
Stream.make(1, 2, 3)
Stream.fromIterable(arr, { chunkSize? })
Stream.fromArray(arr)
Stream.fromEffect(eff)
Stream.fromEffectRepeat(eff)
Stream.fromEffectSchedule(eff, schedule)
Stream.fromQueue(q)
Stream.fromPubSub(ps)
Stream.fromSubscription(sub)
Stream.fromSchedule(schedule)
Stream.callback<A>(fn(queue => ...))
Stream.fromAsyncIterable(it, (cause) => TaggedError)
Stream.paginate(seed, fn)
Stream.unfold(seed, fn)
Stream.iterate(init, fn)
Stream.range(min, max)
Stream.tick(interval)
Stream.scoped(stream)
Stream.empty                       // Stream<never> — completes immediately, emits nothing
Stream.never                       // Stream<never> — never emits, never terminates
Stream.unwrap(effect)              // Effect<Stream<A>> → Stream<A> — defer construction to an Effect
// platform: NodeStream.fromReadable({ evaluate, onError, closeOnDone })
```

- `fromEffectSchedule(eff, schedule)` — polling stream. DO use for health/cache/metrics.
- `fromSchedule(schedule)` — emits schedule outputs.
- `empty` — no-emit terminal stream (fallback in catch handlers). `never` — placeholder that stays open (e.g. keep a merge alive).
- `unwrap(eff)` — build a stream from a service/config Effect: `Stream.unwrap(Effect.map(Config, cfg => Stream.range(1, cfg.max)))`. Env of the outer Effect flows into the stream.
- `callback<A>(fn(queue => ...))` — bridge callback APIs; emit via `Queue.offerUnsafe(queue, x)`.
- `paginate(seed, fn)` — paged APIs → `[results, Option<nextCursor>]`.
- Removed/renamed vs v3: no `Stream.async` / `asyncPush` (→ `Stream.callback`); no `repeatValue` (use `Stream.succeed(x).pipe(Stream.repeat(schedule))`).

## Transformation (concurrency via options object)

```ts
Stream.map((a, i) => b)
Stream.mapEffect(f, { concurrency: 4, unordered? })
Stream.flatMap(f, { concurrency: 2, bufferSize? })
Stream.switchMap(f, { concurrency?, bufferSize? })
Stream.filter(p)
Stream.filterMap(f)
Stream.filterEffect(p, { concurrency })
Stream.filterMapEffect(f)
Stream.tap(f, { concurrency? })
Stream.tapBoth(...)
Stream.tapSink(sink)
Stream.take(n)
Stream.takeWhile(p)
Stream.takeUntil(p)
Stream.drop(n)
Stream.dropWhile(p)
Stream.scan(init, f)
Stream.scanEffect(init, f)
Stream.mapAccum(init, f)
Stream.mapAccumEffect(() => init, (state, a) => Effect<[nextState, values[]]>, { onHalt? })
Stream.grouped(n)
Stream.groupedWithin(n, dur)
Stream.groupBy(f)
Stream.rechunk(n)
```

- `mapEffect(f, { concurrency, unordered? })` — THE concurrent map.
- `switchMap` — latest-wins.
- `map` provides the index as second arg.
- `mapAccumEffect` — effectful stateful map; init is a `LazyArg` (`() => state`), and `f` returns `[nextState, valuesArray]` so it emits zero-or-many per input. Use `[s, []]` to accumulate silently, `[s, [x]]` to emit one.

## Merging / combining

```ts
Stream.concat(that)                                // emit all of self, THEN all of that (sequential)
Stream.merge(that, { haltStrategy? })
Stream.mergeAll(streams, { concurrency, bufferSize? })
Stream.zip(that)
Stream.zipWith(that, f)
Stream.zipLeft(that)
Stream.zipRight(that)
```

- `concat` sequences: second stream only starts after the first completes. Contrast `merge` (interleaved). DO chain `concat` for prefix/suffix (header row, sentinel).

## Backpressure / fan-out

```ts
Stream.buffer({ capacity: number | "unbounded", strategy?: "dropping" | "sliding" | "suspend" })
Stream.broadcast({ capacity, strategy?, replay? })
Stream.broadcastN({ n, capacity, ... })
Stream.partition(filter, { bufferSize? })
```

## Scheduling on streams

```ts
Stream.repeat(schedule)
Stream.repeatElements(schedule, { concurrency })
Stream.schedule(schedule)
Stream.timeout(dur)
Stream.timeoutOrElse({ duration, orElse })
Stream.forever
```

### Rate shaping

```ts
Stream.throttle({ cost: (chunk) => number, units, duration, burst?, strategy?: "shape" | "enforce" })
Stream.throttleEffect({ cost: (chunk) => Effect<number>, units, duration, burst?, strategy? })
Stream.debounce(duration)          // emit only the latest element after a quiet period
```

- Token bucket: bucket holds up to `units + burst` tokens over `duration`; each chunk consumes `cost(chunk)`. `cost` receives the whole chunk (a NonEmptyReadonlyArray), NOT one element — use `(arr) => arr.length` to bill per element.
- `strategy` defaults to `"shape"` (delay chunks until they fit). `"enforce"` DROPS chunks that exceed the budget.
- `throttleEffect` — same shape, `cost` returns an Effect (bill by an async/service lookup).
- `debounce(dur)` — collapse bursts, emit last value once input goes quiet for `dur`. DO use for search-as-you-type / settle-then-fire. NOT rate limiting (that's `throttle`).

## Error handling

Streams carry a typed error channel; recover with `Stream`-level catchers (NOT the `Effect.*` ones). A catch handler returns a REPLACEMENT stream.

```ts
Stream.catchTag('HttpError', (e) => Stream.make(fallback)) // one tagged error
Stream.catchTags({ HttpError: (e) => Stream.empty, RateLimited: (e) => backoffStream })
Stream.catch((e) => Stream.fromEffect(recover(e))) // any typed error
Stream.catchIf(pred, (e) => alt) // predicate-gated
Stream.catchCause((cause) => alt) // defects + interrupts too
Stream.mapError((e) => new WrappedError({ cause: e })) // translate the error channel
```

- `Stream.catchAll` does NOT exist in v4 → use `Stream.catch`.
- Handlers return a stream, so you can resume, degrade to `Stream.empty`, or re-fail with `Stream.fail`.
- Reach for `mapError` at adapter boundaries to normalize third-party stream errors into your tagged errors.

## Running

```ts
Stream.runCollect(s) // Effect<Array<A>>
Stream.runDrain(s) // run for effects, drop output
Stream.runForEach(s, f)
Stream.runForEachWhile(s, f)
Stream.runForEachArray(s, f)
Stream.runFold(
  () => init,
  (acc, x) => acc,
)
Stream.runFoldEffect(
  () => init,
  (acc, x) => effect,
)
Stream.runHead(s) // Effect<Option<A>>
Stream.runLast(s) // Effect<Option<A>>
Stream.run(s, Sink.sum)
Stream.toReadableStream(s)
Stream.toReadableStreamEffect(s)
```

- DO use `runDrain` for pure side-effect pipelines.
- DO prefer `runForEach` / `runDrain` over `runCollect` for unbounded streams (avoid buffering everything).
