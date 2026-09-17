# Error Handling

## Defining errors

- DO use `Schema.TaggedErrorClass<Self>()("Tag", { fields })` — the recommended way for schema-backed/serializable errors. Also `Schema.ErrorClass` (no tag).
- `Data.TaggedError("Tag")<{...}>` and `Data.Error` also exist — produce `Cause.YieldableError`, work with `catchTag`/`catchTags`, and are yieldable in `Effect.gen` to fail the effect. The `_tag` is excluded from constructor args. Prefer `Schema.TaggedErrorClass` for serializable errors.
- For defect/unknown causes inside an error schema, use `cause: Schema.Defect()` (it's a factory — bare `Schema.Defect` is not a schema).
- DO include context fields (IDs, inputs) in error classes.

```ts
class AiError extends Schema.TaggedErrorClass<AiError>()('AiError', {
  reason: Schema.Union([RateLimitError, QuotaExceededError, SafetyBlockedError]),
}) {}
```

## v3 → v4 catch renames

| v3                       | v4                                                        |
| ------------------------ | --------------------------------------------------------- |
| `Effect.catchAll`        | `Effect.catch`                                            |
| `Effect.catchAllCause`   | `Effect.catchCause`                                       |
| `Effect.catchAllDefect`  | `Effect.catchDefect`                                      |
| `Effect.catchSome`       | `Effect.catchFilter` (uses `Filter` module, not `Option`) |
| `Effect.catchSomeCause`  | `Effect.catchCauseFilter`                                 |
| `Effect.catchSomeDefect` | REMOVED                                                   |
| `Effect.catchTag`        | unchanged                                                 |
| `Effect.catchTags`       | unchanged                                                 |
| `Effect.catchIf`         | unchanged                                                 |

General rule: `catchAll*` → `catch*`; `catchSome*` → `catch*Filter`.

- DON'T use v3 names: `catchAll`, `catchAllCause`, `catchSome` — all renamed.

## Tag-based catching

- `Effect.catchTag("Tag", handler)` — single tag. Also accepts an ARRAY of tags:

```ts
Effect.catchTag(['ParseError', 'ReservedPortError'], (_) => Effect.succeed(3000))
```

- `Effect.catchTags({ TagA: handlerA, TagB: handlerB })` — object of per-tag handlers.

## catch / catchCause

- `Effect.catch((error) => ...)` — catch-all over the typed error channel only, NOT defects.
- `Effect.catchCause((cause) => ...)` — catch including defects/interrupts.
- DO combine: catch specific tags first, then a final `Effect.catch` fallback.
- `Effect.catchEager` — optimization variant of `catch` that evaluates synchronous recovery effects immediately.

## Reason-based errors

For a tagged error whose payload has a `reason: Schema.Union([...])` field:

```ts
// Handle one reason (+ optional catch-all for other reasons):
Effect.catchReason(
  'AiError',
  'RateLimitError',
  (reason) => Effect.succeed(`Retry after ${reason.retryAfter}s`),
  (reason) => Effect.succeed(`Failed: ${reason._tag}`),
)

// Handle several reasons:
Effect.catchReasons('AiError', {
  RateLimitError: (r) => Effect.succeed(`...`),
  QuotaExceededError: (r) => Effect.succeed(`...`),
})

// Or move reasons into the error channel, then use catchTags:
callModel.pipe(Effect.unwrapReason('AiError'), Effect.catchTags({/* ... */}))
```

## Other error-channel combinators

- `Effect.mapError`, `Effect.tapError`, `Effect.orDie` (makes E fatal/defect), `Effect.orElse`.

## Cause flattened to reasons

- `Cause<E>` now holds a FLAT `reasons: ReadonlyArray<Reason<E>>`. Each `Reason` is one of `Fail<E>`, `Die`, `Interrupt`, each carrying an `annotations` map (stack frames / spans). Empty `reasons` = empty/success cause.
- Create: `Cause.fail(e)`, `Cause.die(defect)`, `Cause.interrupt(fiberId?)`, `Cause.fromReasons`.
- Test: `Cause.hasFails` / `Cause.hasDies` / `Cause.hasInterrupts`; narrow reasons with `Cause.isFailReason` / `isDieReason` / `isInterruptReason`.
- `Cause.squash`, `Cause.interruptors`.

## Exit

- `Exit<A, E>` = `Success<A, E> | Failure<A, E>`. `Failure` carries `cause: Cause<E>`.
- `Exit.succeed`, `Exit.fail`, `Exit.failCause`, `Exit.isSuccess` / `isFailure`.
