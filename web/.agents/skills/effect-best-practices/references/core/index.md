# Effect v4 Core

Core authoring, error-handling, and data-type references for Effect v4.

- [Writing Effects](writing-effects.md): `Effect.gen`/`Effect.fn` canonical style, `return yield*`, pipe composition, return-type helpers, constructors, running effects.
- [Error Handling](error-handling.md): defining errors, v3→v4 catch renames, `catchTag(s)`/`catch`/`catchCause`, reason-based errors, `mapError`/`orDie`/`orElse`, flattened Cause and Exit.
- [Data Types](data-types.md): `Option`, `Either`→`Result` rename, `Data`, `Duration` string inputs, `Function` pipe/flow.
