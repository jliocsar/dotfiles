# Scheduling

`Schedule.intersect` / `union` / `linear` are GONE in v4.

## Constructors

```ts
Schedule.recurs(5)                              // N retries
Schedule.spaced("30 seconds")                   // fixed gap AFTER each action
Schedule.fixed("1 second")                      // fixed cadence regardless of action time
Schedule.exponential("200 millis", factor = 2)
Schedule.fibonacci("1 second")
Schedule.cron(expr, tz?)
Schedule.forever
Schedule.elapsed
Schedule.windowed(dur)
Schedule.during(dur)
Schedule.duration(dur)
```

## Combinators (v4 names)

```ts
Schedule.both(a, b)        // continue while BOTH continue, max delay (v3 `intersect`). AND-cap.
Schedule.either(a, b)      // continue while EITHER continues, min delay (v3 `union`). cap/fallback.
Schedule.andThen(a, b)     // run `a` to completion then `b`
Schedule.addDelay(self, f)
Schedule.modifyDelay(self, f)
Schedule.jittered          // 0.8–1.2× random jitter
Schedule.while(self, ({ input, output, ...metadata }) => bool | Effect<bool>)
Schedule.take(self, n)
Schedule.upTo(self, { duration?, times? })   // bound by elapsed time and/or output count
Schedule.map(self, f)
Schedule.passthrough(self)
Schedule.reduce(self, ...)
Schedule.collectWhile(self, p)
Schedule.tap(self, f) / tapInput / tapOutput
Schedule.setInputType<E>()
Schedule.delays(self)
```

- GONE: `Schedule.intersect`, `Schedule.union`, `Schedule.linear`.

## Production retry pattern

```ts
const policy = Schedule.exponential('250 millis').pipe(
  Schedule.either(Schedule.spaced('10 seconds')), // cap delay at 10s
  Schedule.jittered,
  Schedule.setInputType<HttpError>(),
  Schedule.while(({ input }) => input.retryable), // fail fast on non-retryable
)
effect.pipe(Effect.retry(policy), Effect.orDie)
```

- DO use `setInputType` + `while` for fail-fast on non-retryable errors.
- DO `orDie` after retries are exhausted.

```ts
// AND-cap: exponential backoff capped at 6 attempts
Schedule.both(Schedule.exponential('250 millis'), Schedule.recurs(6))

// Inferred-input builder form of retry:
Effect.retry(($) =>
  $(Schedule.spaced('1 seconds')).pipe(Schedule.while(({ input }) => input.retryable)),
)
```

- Integrates with `Effect.retry(eff, schedule)`, `Effect.repeat(eff, schedule)`, `Effect.schedule`.
- Metadata via `Context.get(Schedule.CurrentMetadata)`.

## Retry with fallback, and deadlines

```ts
// Retry on a bounded schedule; if it stays failed, run a fallback instead of dying.
effect.pipe(Effect.retryOrElse(policy, (error, scheduleOutput) => useCachedValue(error)))

// Deadline: succeed with the value, or FAIL with TimeoutError if it doesn't finish in time.
effect.pipe(Effect.timeout('2 seconds'))

// Deadline without failing: Option.none() on expiry, Option.some(value) otherwise.
effect.pipe(Effect.timeoutOption('2 seconds'))
```

- `Effect.retryOrElse(schedule, orElse)` — the `orElse` handler receives `(error, scheduleOutput)` and its success/error becomes the result. Use when exhausted retries have a real fallback (cache, default, degraded path).
- `Effect.timeout(dur)` fails with `TimeoutError` (a defect-free typed failure) on expiry — catch it or pair with `retry`/`orElse`.
- Prefer `timeoutOption` when "didn't finish in time" is a normal, handled outcome rather than an error.
- DON'T reach for `retryOrElse` when there's no truthful fallback — let exhausted failures stay visible (`Effect.orDie`). See `anti-patterns.md`.

## Bounding schedules & cause-catch helpers

```ts
// Bound ANY schedule by count and/or wall-clock — options object, NOT a bare duration.
Schedule.exponential('200 millis').pipe(Schedule.upTo({ times: 5 }))
Schedule.spaced('1 second').pipe(Schedule.upTo({ duration: '30 seconds' }))
Schedule.forever.pipe(Schedule.upTo({ duration: '1 minute', times: 20 })) // stops when EITHER limit hits

// Catch the whole Cause when a predicate over it holds (predicate-based sibling of catchCauseFilter).
effect.pipe(Effect.catchCauseIf(Cause.hasFails, (cause) => useCachedValue(Cause.squash(cause))))

// Clamp a computed delay to a floor: pick the larger of two Durations.
Duration.max(computedBackoff, '500 millis')
```

- `Schedule.upTo({ duration?, times? })` — bounds an existing schedule; stops as soon as EITHER limit is reached. `times` caps outputs (with `repeat`/`retry` the effect runs once before stepping, so evals can be `times + 1`).
- `Effect.catchCauseIf(self, predicate, f)` (curried `(predicate, f)`) — `predicate: Predicate<Cause<E>>`, handler `(cause) => Effect`. Use `catchCauseFilter` when you also need to narrow/transform the cause; use `catchCauseIf` for a plain boolean test.
- `Duration.max(self, that)` (curried `(that)`) — larger of two durations; handy to enforce a minimum delay/backoff.
