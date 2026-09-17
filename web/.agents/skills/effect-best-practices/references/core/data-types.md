# Data Types

## Option

- `Option.match(self, { onNone, onSome })`, `Option.getOrElse(self, () => default)`.
- `Option.getOrUndefined`, `Option.getOrThrow`.
- DON'T use `Option.getOrThrow` in Effect code — recover Options into the Effect error channel via `Effect.fromNullishOr` / `Effect.mapError`.

## Either → Result (renamed in v4)

There is NO `Either.ts`; the core data type is `Result`.

- `Result<A, E>` = `Success<A, E> | Failure<A, E>`. `E` defaults to `never`.
- `Result.succeed(a)`, `Result.fail(e)`, `Result.match`, `Result.getOrElse`, `Result.isSuccess`, `Result.isFailure`.
- `Result` is yieldable in `Effect.gen` (produces inner value or short-circuits on failure), is a monad (`flatMap`/`andThen`/`tap`/`pipe`), pure/immutable.
- Schema also renamed Either-flavored APIs: `EitherFromSelf`→`Result`, `decodeUnknownEither`→`decodeUnknownExit`, `decodeEither`→`decodeExit`.

## Data

- `Data.Class`, `Data.TaggedClass`, `Data.Error`, `Data.TaggedError`, `Data.taggedEnum` (TaggedEnum / ADTs).
- Use Data for value-equality semantics (implements `Equal`) and discriminated-union modelling.

### TaggedEnum / taggedEnum (ADTs)

`Data.TaggedEnum<{...}>` is the TYPE (each key → a `_tag` variant). `Data.taggedEnum<T>()` returns the runtime helper: one constructor per variant, plus `$is` and `$match`.

```ts
import { Data } from 'effect'

type HttpError = Data.TaggedEnum<{
  BadRequest: { readonly message: string }
  NotFound: { readonly url: string }
}>

const { BadRequest, NotFound, $is, $match } = Data.taggedEnum<HttpError>()

const err = NotFound({ url: '/x' }) // { _tag: "NotFound", url: "/x" } — plain object
$is('NotFound')(err) // type-guard: checks ONLY _tag
$match(err, {
  // exhaustive; data-first OR data-last (cases only)
  BadRequest: (e) => e.message,
  NotFound: (e) => `${e.url} nf`,
})
```

- Generic variants: extend `Data.TaggedEnum.WithGenerics<N>` with `readonly taggedEnum: MyType<this["A"], ...>`, then `Data.taggedEnum<Def>()`.
- DO: use for closed unions of plain data with value-equality; constructors produce plain objects (NOT class instances).
- DON'T: trust `$is`/`$match` on untrusted input — `$is` only checks `_tag`. Validate with `Schema` first.

## Duration

- Durations accept string inputs like `"30 seconds"`, `"1 second"`, `"200 millis"` directly in most APIs.
- Constructors: `Duration.millis/seconds/minutes/hours/days/weeks/nanos/micros`.
- Conversions: `Duration.toMillis/toSeconds/...`; `Duration.fromInput` (safe, returns Option), `Duration.fromInputUnsafe`. `Duration.match`, `Duration.between`, `Duration.Order`, `Duration.Equivalence`.

## Function: pipe / flow

- `pipe(a, ab, bc, ...)` — value-first pipeline; same as the `.pipe()` method on pipeable types.
- `flow(...)` — point-free composition of functions.
- Helpers: `identity`, `constant`, `constVoid` / `constUndefined` / `constNull` / `constTrue` / `constFalse`.
