# HttpClient

`effect/unstable/http`. Service `HttpClient.HttpClient`; impl layer `FetchHttpClient.layer` (also `NodeHttpClient`/`BunHttpClient`).

- Methods: `client.get/head/post/patch/put/del(url, options?)`, `client.execute(request)`.
- Combinators (pipeable): `mapRequest`, `mapRequestInput` (prepends, runs before existing middleware), `mapRequestEffect`, `filterStatus`, `filterStatusOk` (fail on non-2xx), `retryTransient({ schedule, times })`, `withRateLimiter(opts)`, `followRedirects`, `withCookiesRef`.
- Request builders: `HttpClientRequest.post/prependUrl/setUrl/setUrlParams/acceptJson/accept/bearerToken/bodyJson` (effectful) / `bodyJsonUnsafe` (sync) / `bodyText/bodyUrlParams`; `schemaBodyJson(Schema)(req, value)` → `Effect<HttpClientRequest, HttpBody.HttpBodyError>` (encodes body via schema).
- Response decoders: `HttpClientResponse.schemaBodyJson(schema)`, `schemaJson`, `schemaNoBody`; `HttpClientResponse.filterStatusOk(response)` → `Effect<HttpClientResponse, HttpClientError.HttpClientError>` (response-level variant of the client combinator).
- Errors: import module `HttpClientError` from `effect/unstable/http`; members `StatusCodeError`, `TransportError`, `DecodeError`, `EncodeError`, `EmptyBodyError`, `InvalidUrlError`, and `isHttpClientError(u)`. `StatusCodeError` carries `{ request, response }` (read `response.headers`).
- Rate limiting: `withRateLimiter({ limiter, window, limit, key, algorithm?, tokens?, disableResponseInspection?, disableAdaptiveLearning? })` adds `RateLimiter.RateLimiterError` to the client's error channel. `limiter` is the `RateLimiter.RateLimiter` service (from `effect/unstable/persistence`); provide `RateLimiter.layer` over a store (`RateLimiter.layerStoreMemory`, or Redis). `key` is a string or `(request) => string`. Paces requests proactively AND auto-retries HTTP `429` by inspecting `Retry-After` / rate-limit response headers (built-in — no manual `retry-after` parsing needed).

DO bake base-url/headers/retry into the client once via `mapRequest` + `filterStatusOk` + `retryTransient`.
DO decode bodies with `schemaBodyJson(Schema)`; wrap raw failures into a tagged error with `mapError`.
DO use `bodyJsonUnsafe` for already-validated sync payloads; `bodyJson` when encoding can fail.
DO reach for `withRateLimiter` to pace outbound calls to a rate-limited API; it handles `429` + `Retry-After` for you, so don't hand-roll header parsing.
DON'T forget `filterStatusOk` — without it 4xx/5xx are successful responses, not failures.
DON'T provide `FetchHttpClient.layer` at call site if the service layer already provides it.
DON'T forget the `RateLimiter` layer + a store when using `withRateLimiter`, and account for the added `RateLimiterError` in the error channel.

```ts
import { Effect, Layer } from 'effect'
import { FetchHttpClient, HttpClient } from 'effect/unstable/http'
import { RateLimiter } from 'effect/unstable/persistence'

const paced = Effect.gen(function* () {
  const limiter = yield* RateLimiter.RateLimiter
  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.withRateLimiter({ limiter, window: '1 second', limit: 5, key: 'api' }),
    HttpClient.filterStatusOk, // error channel now: HttpClientError | RateLimiterError
  )
  return yield* client.get('https://api.example.com/data')
}).pipe(
  Effect.provide(
    Layer.mergeAll(
      FetchHttpClient.layer,
      RateLimiter.layer.pipe(Layer.provide(RateLimiter.layerStoreMemory)),
    ),
  ),
)
```

```ts
import { Context, Effect, flow, Layer, Schedule, Schema } from 'effect'
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from 'effect/unstable/http'

class Todo extends Schema.Class<Todo>('Todo')({
  userId: Schema.Number,
  id: Schema.Number,
  title: Schema.String,
  completed: Schema.Boolean,
}) {}

export class JsonPlaceholder extends Context.Service<
  JsonPlaceholder,
  {
    readonly allTodos: Effect.Effect<ReadonlyArray<Todo>, JsonPlaceholderError>
    getTodo(id: number): Effect.Effect<Todo, JsonPlaceholderError>
  }
>()('app/JsonPlaceholder') {
  static readonly layer = Layer.effect(
    JsonPlaceholder,
    Effect.gen(function* () {
      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.mapRequest(
          flow(
            HttpClientRequest.prependUrl('https://jsonplaceholder.typicode.com'),
            HttpClientRequest.acceptJson,
          ),
        ),
        HttpClient.filterStatusOk,
        HttpClient.retryTransient({ schedule: Schedule.exponential(100), times: 3 }),
      )
      const allTodos = client.get('/todos').pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(Schema.Array(Todo))),
        Effect.mapError((cause) => new JsonPlaceholderError({ cause })),
        Effect.withSpan('JsonPlaceholder.allTodos'),
      )
      const getTodo = Effect.fn('JsonPlaceholder.getTodo')(function* (id: number) {
        yield* Effect.annotateCurrentSpan({ id })
        return yield* client.get(`/todos/${id}`, { urlParams: { format: 'json' } }).pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(Todo)),
          Effect.mapError((cause) => new JsonPlaceholderError({ cause })),
        )
      })
      return JsonPlaceholder.of({ allTodos, getTodo })
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer))
}

export class JsonPlaceholderError extends Schema.TaggedErrorClass<JsonPlaceholderError>()(
  'JsonPlaceholderError',
  { cause: Schema.Defect() },
) {}
```
