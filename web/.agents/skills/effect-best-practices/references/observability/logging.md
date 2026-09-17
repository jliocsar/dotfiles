# Logging

Structured logging via the Effect logger. All `Effect.log*` are `(...message: ReadonlyArray<any>) => Effect<void>`.

- `Effect.log(...message)` (default Info), `Effect.logTrace`, `Effect.logDebug`, `Effect.logInfo`, `Effect.logWarning`, `Effect.logError`, `Effect.logFatal`.
- `Effect.annotateLogs(key, value)` or `Effect.annotateLogs({ ... })` — dual (data-last pipe or data-first).
- `Effect.withLogSpan(label)` — adds `label=<N>ms` duration to every log line in scope.
- Pass structured metadata inline as a trailing object: `Effect.logInfo("starting checkout", { orderId })`.

```ts
import { Effect } from 'effect'

const logCheckoutFlow = Effect.gen(function* () {
  yield* Effect.logDebug('loading checkout state')
  yield* Effect.logInfo('validating cart')
  yield* Effect.logWarning('inventory low')
  yield* Effect.logError('payment provider timeout')
}).pipe(
  Effect.annotateLogs({ service: 'checkout-api', route: 'POST /checkout' }),
  Effect.withLogSpan('checkout'),
)
```

## Logger config

- `Logger.layer([logger1, logger2], { mergeWithExisting? })` — installs loggers. Loggers can be `Effect<Logger>` (resourceful).
- Built-ins: `Logger.consoleJson` (one JSON line/entry, prod), `Logger.consolePretty`, `Logger.defaultLogger`.
- Formatters: `Logger.formatSimple`, `Logger.formatStructured`, `Logger.formatJson`, `Logger.formatPretty`.
- `Logger.toFile(format, path)` — needs a FileSystem layer (e.g. `NodeFileSystem.layer`).
- `Logger.batched(format, { window, flush })` — batch + flush to external sink.

```ts
import { Logger } from 'effect'

const JsonLoggerLayer = Logger.layer([Logger.consoleJson])
const FileLoggerLayer = Logger.layer([Logger.toFile(Logger.formatSimple, 'app.log')]).pipe(
  Layer.provide(NodeFileSystem.layer),
)
```

## Minimum log level

v4 uses `References.MinimumLogLevel` as a Layer ref. Levels are plain strings (`"Warn"`, `"Info"`, `"Debug"`, ...).

```ts
import { Layer, References } from 'effect'

const WarnAndAbove = Layer.succeed(References.MinimumLogLevel, 'Warn')
```

## DO / DON'T

- DO use `Effect.log*` + `Effect.annotateLogs` for structured, context-carrying logs.
- DO use `Effect.withLogSpan` for timing instead of manual `Date.now()`.
- DO install loggers via `Logger.layer([...])` at the edge so they're swappable per env.
- DON'T `console.log` in effects — bypasses the logger, log level filtering, annotations, batching, and OTLP export. (`console.log` inside a custom `Logger.batched` flush sink is fine — that IS the sink.)
- DON'T hardcode loggers globally.
