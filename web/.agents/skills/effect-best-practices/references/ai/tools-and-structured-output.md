# Tools & Structured Output

## Tool.make / Toolkit.make / toLayer

- `Tool.make(name, { description, parameters: Schema.Struct, success, failureMode })`.
- `failureMode`: `"error"` (default) → error channel; `"return"` → captured into tool result.
- DO add `.annotate({ description })` to schema fields used as params.

```ts
import { Tool, Toolkit } from 'effect/unstable/ai'
import { Effect, Schema } from 'effect'

const SearchProducts = Tool.make('SearchProducts', {
  description: 'Search the product catalog by keyword',
  parameters: Schema.Struct({
    query: Schema.String.annotate({ description: 'The search query' }),
    maxResults: Schema.Number.pipe(Schema.withDecodingDefault(Effect.succeed(10))),
  }),
  success: Schema.Array(Product),
  failureMode: 'error',
})

const ProductToolkit = Toolkit.make(SearchProducts, GetInventory)
```

Handlers via `toLayer` — returns a Layer satisfying handler requirements for every tool. Can `yield*` other services (db client, etc.) in the body.

```ts
const ProductToolkitLayer = ProductToolkit.toLayer(
  Effect.gen(function* () {
    return ProductToolkit.of({
      SearchProducts: Effect.fn('ProductToolkit.SearchProducts')(function* ({ query, maxResults }) {
        return [].slice(0, maxResults)
      }),
      GetInventory: Effect.fn('ProductToolkit.GetInventory')(function* ({ productId }) {
        return { productId, available: 42 }
      }),
    })
  }),
)
```

## Passing the toolkit to generateText

- DO yield the toolkit handle (`const toolkit = yield* ProductToolkit`) and pass it; the framework auto-resolves params, invokes handlers, feeds results back.
- DO provide the handler layer: `Layer.provide(ProductToolkitLayer)`.

```ts
const response =
  yield *
  LanguageModel.generateText({
    prompt: question,
    toolkit,
    toolChoice: 'required',
  })
response.toolCalls // [{ name, id, params }]
response.toolResults // [{ name, id, result, isFailure }]
```

- `toolChoice`: `"auto"` (default) | `"none"` | `"required"` | `{ tool: name }` | `{ mode?, oneOf: [...] }`.
- Other `generateText` options: `concurrency?` (tool-call resolution concurrency), `disableToolCallResolution?: boolean` (resolve tool calls yourself).

## Provider-defined (server-side) tools

- DON'T write handlers for these — they run server-side and aren't in `toLayer`.
- `Tool.providerDefined({ id: "provider.name", customName, providerName, args?, parameters?, success?, failure?, requiresHandler? })`.
- Pre-built: `OpenAiTool.{ApplyPatch, CodeInterpreter, FileSearch, ImageGeneration, LocalShell, Mcp, Shell, WebSearch, WebSearchPreview}`; `AnthropicTool.{Bash_*, CodeExecution_*, ...}`.

```ts
const webSearch = OpenAiTool.WebSearch({ search_context_size: 'medium' })
const Tools = Toolkit.make(SearchProducts, GetInventory, webSearch)
```

Only user-defined tools that need handlers appear in `toLayer`.

## Structured output — generateObject

- DO use `Schema.Class` / `Schema.Struct` with `.annotate({ description })` on fields — descriptions become model guidance via JSON Schema.
- Result is validated & decoded through the schema; `response.value` is the typed instance.

```ts
import { Schema } from 'effect'

class LaunchPlan extends Schema.Class<LaunchPlan>('LaunchPlan')({
  audience: Schema.Literals(['developers', 'operators', 'platform teams']),
  channels: Schema.Array(Schema.String),
  launchDate: Schema.String,
  summary: Schema.String,
  keyRisks: Schema.Array(Schema.String),
}) {}

const response =
  yield *
  model.generateObject({
    objectName: 'launch_plan',
    prompt: 'Convert these notes into a launch plan object:\n' + notes,
    schema: LaunchPlan,
  })
response.value // typed, decoded LaunchPlan; extends GenerateTextResponse so .text etc. also present
```

- Provider-specific JSON-schema rewriting is handled by a `CodecTransformer` (default `defaultCodecTransformer`); `AnthropicStructuredOutput` / `OpenAiStructuredOutput` helpers also exist.
