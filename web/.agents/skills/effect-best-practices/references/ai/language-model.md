# LanguageModel

Core lives in `effect/unstable/ai` (part of the `effect` package, not a separate package). Verified exports of `effect/unstable/ai`: `AiError, AnthropicStructuredOutput, Chat, EmbeddingModel, IdGenerator, LanguageModel, McpSchema, McpServer, Model, OpenAiStructuredOutput, Prompt, Response, ResponseIdTracker, Telemetry, Tokenizer, Tool, Toolkit`.

- DO call the module-level functions `LanguageModel.generateText/generateObject/streamText`; they require `LanguageModel.LanguageModel` in context.
- Method forms also valid: `const model = yield* LanguageModel.LanguageModel; model.generateText(...)`.
- DON'T assume `effect/ai-*` for core — only provider packages are `@effect/ai-<provider>`.
- `prompt` is `Prompt.RawInput` (string | messages[] | Prompt).

## generateText

```ts
import { Effect } from 'effect'
import { LanguageModel, Model } from 'effect/unstable/ai'

const gen = Effect.gen(function* () {
  const model = yield* LanguageModel.LanguageModel
  const provider = yield* Model.ProviderName
  const response = yield* model.generateText({
    prompt: 'Write a short launch announcement...',
  })
  response.text // concatenated text parts
  response.reasoningText // string | undefined
  response.toolCalls // Response.ToolCallParts[]
  response.toolResults // Response.ToolResultParts[]
  response.finishReason // "stop" | "length" | ... | "unknown"
  response.usage // Response.Usage { inputTokens.total, outputTokens.total, ... }
  return response.text
}).pipe(Effect.provide(modelLayer))
```

## streamText

- DO filter for the part type you want; `streamText` emits a `Response.StreamPart` union, NOT raw strings.
- DON'T treat stream output as strings.
- Part `type` discriminants: `"text"`, `"text-delta"`, `"reasoning"`, `"tool-call"`, `"tool-result"`, `"finish"`. Stream parts use the delta variants.

```ts
import { Stream } from 'effect'
import { LanguageModel, type Response } from 'effect/unstable/ai'

LanguageModel.streamText({ prompt: `...` }).pipe(
  Stream.filter((part): part is Response.TextDeltaPart => part.type === 'text-delta'),
  Stream.map((part) => part.delta),
  Stream.provide(modelLayer),
)
```

## Provider-agnostic pattern

- DO wrap AI usage in a `Context.Service` + `Layer.effect`; capture the model with `.captureRequirements` inside the layer body (see `providers.md`).
- DO name effects with `Effect.fn("Service.method")` for tracing.
- The model layer provides `LanguageModel.LanguageModel` (and `Model.ProviderName`, `Model.ModelName`); the same `generateText`/`streamText` code works across any provider once the model layer is supplied.
