# Queue & PubSub

`Queue.takeUpTo` does NOT exist in v4. Use `Queue.takeN` / `Queue.takeBetween`.

## Queue — error channel + `Cause.Done` completion

```ts
const q = yield * Queue.bounded<A>(cap) // also unbounded(), dropping(cap), sliding(cap)
yield * Queue.offer(q, x) // Effect<boolean>
yield * Queue.offerAll(q, xs) // returns remaining
Queue.offerUnsafe(q, x)
Queue.offerAllUnsafe(q, xs)
const x = yield * Queue.take(q) // blocking
yield * Queue.takeN(q, n)
yield * Queue.takeBetween(q, min, max)
yield * Queue.takeAll(q) // NonEmptyArray
yield * Queue.poll(q) // Option<A>, non-blocking
yield * Queue.end(q) // signal normal completion
yield * Queue.fail(q, e)
yield * Queue.failCause(q, cause)
yield * Queue.interrupt(q)
yield * Queue.shutdown(q)
yield * Queue.await(q) // wait until Done
```

- v4 Queue is typed `Queue<A, E>` with an error channel; consumers see `Pull`-style done/error.
- `Queue.end` signals normal completion — NOT v3 `done` / `offerAll`-shutdown.
- Narrow with `asEnqueue` / `asDequeue`.

## PubSub — multi-subscriber broadcast

```ts
const ps = yield * PubSub.bounded<A>(cap)
// also: PubSub.unbounded({ replay? }), PubSub.dropping(cap | { capacity, replay }), PubSub.sliding(...)
yield * PubSub.publish(ps, x) // Effect<boolean>
yield * PubSub.publishAll(ps, xs)
PubSub.publishUnsafe(ps, x)

yield *
  Effect.scoped(
    Effect.gen(function* () {
      const sub = yield* PubSub.subscribe(ps) // scoped Subscription; auto-cleanup on scope exit
      const x = yield* PubSub.take(sub) // takeAll / takeUpTo / takeBetween / remaining
    }),
  )
```

- DO wire fan-out via `Stream.fromPubSub(ps)` / `Stream.fromQueue(q)`.
- DO subscribe inside a `Scope`; bounded PubSub applies backpressure to publishers when full.
