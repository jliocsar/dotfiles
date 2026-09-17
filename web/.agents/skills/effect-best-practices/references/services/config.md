# Config

In v4 `Config.string/number/int/boolean/...` are shortcuts over `Config.schema(SchemaType, name)`. Every `Config<T>` is yieldable in `Effect.gen`.

## Constructors

`string`, `nonEmptyString`, `number`, `finite`, `int`, `boolean`, `port`, `logLevel`, `redacted`, `url`, `date`, `schema(codec, path?)`, `all`, `succeed`, `fail`.

## Combinators

`map`, `mapOrFail`, `orElse`, `withDefault`, `option`, `nested`, `unwrap`.

`Config.unwrap(wrapped: Config.Wrap<T>): Config<T>` — builds one `Config<T>` from a value matching `Config.Wrap<T>` (either a `Config<T>` or a record of per-key `Config`s, recursively). Passthrough when input is already a `Config`. `Config.Wrap<T>` is the exported type-level helper for typing such inputs: `Config.Wrap<{ key: string }>` = `{ key: Config<string> } | Config<{ key: string }>`. Use to accept caller-supplied config as either a single `Config` or a bag of individual `Config`s.

```ts
const makeConfig = (c: Config.Wrap<{ host: string; port: number }>) => Config.unwrap(c)
makeConfig({ host: Config.string('HOST'), port: Config.int('PORT') }) // => Config<{ host, port }>
```

## Reading config

```ts
const program = Effect.gen(function* () {
  const host = yield* Config.string('HOST')
  const port = yield* Config.int('PORT').pipe(Config.withDefault(3000))
  const secret = yield* Config.redacted('API_SECRET')
})
```

```ts
// structured:
const app = Config.all({ host: Config.string('HOST'), port: Config.int('PORT') })
// schema-validated:
const ServerConfig = Config.schema(
  Schema.Struct({ host: Schema.String, port: Schema.Int }),
  'server',
)
```

## Redacted secrets

`Config.redacted` = `Config.schema(Schema.Redacted(Schema.String), name)` — masked in logs/errors.

- DO read the secret with `Redacted.value(...)` ONLY at the point of use.
- DON'T `Redacted.value()` early or log secrets — keep redacted until the boundary.

## ConfigProvider — tests / defaults

```ts
// tests / in-memory:
program.pipe(
  Effect.provideService(
    ConfigProvider.ConfigProvider,
    ConfigProvider.fromUnknown({ HOST: 'localhost' }),
  ),
)
// add defaults as fallback (current provider tried first):
ConfigProvider.layerAdd(ConfigProvider.fromUnknown({ HOST: 'localhost', PORT: '3000' }))
// override: make the added provider primary, existing one becomes fallback:
ConfigProvider.layerAdd(ConfigProvider.fromUnknown({ HOST: 'override' }), { asPrimary: true })
```

`layerAdd(self, options?)` composes with the active provider instead of replacing it (use `layer` to replace). Default: added provider is a fallback, consulted only when the current provider returns `undefined`. `{ asPrimary: true }` flips the order — added provider is tried first, existing one becomes the fallback.

Provider APIs: `fromEnv`, `fromUnknown(obj)`, `make`, `nested`, `orElse`, `constantCase`, `layer`, `layerAdd`.

## Anti-pattern: process.env

- DON'T read `process.env.X` directly in business logic. Use `Config.*` + a `ConfigProvider` so config is testable, validated, redacted, and swappable. The default provider reads env; tests swap in `fromUnknown`.

## DO list

- Validate ALL config at startup (fail fast).
- Use `Schema`/`Config.all` for structured/grouped config; custom validation is best done with `Schema` checks via `Config.schema` (not only `mapOrFail`).
- `withDefault` for non-critical values; `redacted` for secrets; `mapOrFail`/`Schema` checks for validation.
- Wrap config in a service layer for DI: `Layer.effect(Cfg, Effect.gen(function*() { /* yield* Config... */ }))`.
