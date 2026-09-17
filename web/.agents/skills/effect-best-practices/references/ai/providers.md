# Providers

Providers are separate packages: `@effect/ai-anthropic`, `@effect/ai-openai`, `@effect/ai-openrouter`, `@effect/ai-openai-compat`. Also `@effect/ai-openai-compat` for OpenAI-compatible endpoints.

## Model is a Layer (and a capturable handle)

- `Provider.model(id)` returns a `Model.Model<Provider, Provides, Requires>`. It IS BOTH a `Layer` (provides `LanguageModel.LanguageModel | ProviderName | ModelName`, requires the provider Client) AND an Effect-yielding handle via `.captureRequirements`.
- `OpenAiLanguageModel.model(model: string | Model, config?)` → `Model<"openai", LanguageModel.LanguageModel, OpenAiClient>`.
- `AnthropicLanguageModel.model(model, config?)` → `Model<"anthropic", LanguageModel.LanguageModel, AnthropicClient>`.
- Two ways to apply a model:
  1. As a Layer: `Effect.provide(model)` / `Layer.provide` / `Stream.provide`.
  2. Capture into the current env: `const layer = yield* model.captureRequirements` then `Effect.provide(layer)`.
- The provider Client (`OpenAiClient`/`AnthropicClient`) must be supplied somewhere up the layer tree.

## CRITICAL: `captureRequirements`, NOT `withRequirements`

- DON'T use `withRequirements` — it is a doc typo. The real API is `captureRequirements` (also `DraftPlan.captureRequirements` for `ExecutionPlan`).

```ts
const modelLayer = yield * OpenAiLanguageModel.model('gpt-4.1').captureRequirements
```

## Client layer via Config.redacted

- DO build the client with `layerConfig` + `Config.redacted`, and provide an HttpClient.
- DON'T hardcode API keys / read `process.env` directly — always `Config.redacted`.
- DON'T forget the client layer in the wiring: the model Layer requires the provider Client.

```ts
import { AnthropicClient, AnthropicLanguageModel } from '@effect/ai-anthropic'
import { OpenAiClient, OpenAiLanguageModel } from '@effect/ai-openai'
import { Config, Layer } from 'effect'
import { FetchHttpClient } from 'effect/unstable/http'

const AnthropicClientLayer = AnthropicClient.layerConfig({
  apiKey: Config.redacted('ANTHROPIC_API_KEY'),
}).pipe(Layer.provide(FetchHttpClient.layer))

const OpenAiClientLayer = OpenAiClient.layerConfig({
  apiKey: Config.redacted('OPENAI_API_KEY'),
}).pipe(Layer.provide(FetchHttpClient.layer))
```

Signatures:

- `AnthropicClient.layerConfig(options?)` → `Layer<AnthropicClient, Config.ConfigError, HttpClient.HttpClient>`. Options are all `Config.Config<...>`: `apiKey?: Config.Config<Redacted | undefined>`, `apiUrl?`, `apiVersion?`.
- `OpenAiClient.layerConfig(options?)` → `Layer<OpenAiClient, Config.ConfigError, HttpClient.HttpClient>`. Options: `apiKey?`, `apiUrl?`, `organizationId?`, `projectId?` (all `Config.Config`, redacted where secret).
- `apiKey` is optional (proxy / test clients). Anthropic default url `https://api.anthropic.com`; OpenAI uses bearer token header.
- `Client.layer(options)` takes literal `Redacted` values (non-Config); `Client.make(options)` returns the service effectfully — prefer `layerConfig` in app code.
- Provide both clients when a service uses multiple providers: `Layer.provide([OpenAiClientLayer, AnthropicClientLayer])`.

## ExecutionPlan — multi-provider fallback

```ts
import { ExecutionPlan } from 'effect'

const DraftPlan = ExecutionPlan.make(
  { provide: OpenAiLanguageModel.model('gpt-5.2'), attempts: 3 },
  { provide: AnthropicLanguageModel.model('claude-opus-4-6'), attempts: 2 },
)

const draftsModel = yield * DraftPlan.captureRequirements

Effect.withExecutionPlan(draftsModel).pipe(Layer.provide([OpenAiClientLayer, AnthropicClientLayer]))
```

- DON'T forget: `ExecutionPlan`s require every provider's client layer.
