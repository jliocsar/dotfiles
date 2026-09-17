# HttpApi

`effect/unstable/httpapi`. Builders chain `.add(...)`: endpoints → group, groups → api.

Endpoint option keys: `params` (path `:name`), `query`, `headers`, `payload` (body for POST/PUT; **query for GET**), `success` (default no content; array = content-type negotiation), `error` (one schema or array).

DO keep API definition in its own package/files, separate from server impl, so clients import it cleanly.
DO use `transformClient` (not call-site) for client base-url + retry; provide `requiredForClient` middleware impls.
DO `HttpApiBuilder.layer(Api, { openapiPath })` — it only takes `openapiPath`; put title/version in `OpenApi.annotations`.
DON'T hand-build fetch calls against an HttpApi — use the generated client for end-to-end type safety.
DON'T forget GET `payload` maps to the query string while POST `payload` maps to the body.

## Define API

```ts
import { Schema } from 'effect'
import {
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  HttpApiSchema,
  OpenApi,
} from 'effect/unstable/httpapi'

export class UsersApiGroup extends HttpApiGroup.make('users')
  .add(
    HttpApiEndpoint.get('list', '/', {
      query: { search: Schema.optional(Schema.String) },
      success: Schema.Array(User),
    }),
    HttpApiEndpoint.get('getById', '/:id', {
      params: { id: Schema.FiniteFromString.pipe(Schema.decodeTo(UserId)) },
      success: User,
      error: UserNotFound.pipe(HttpApiSchema.asNoContent({ decode: () => new UserNotFound() })),
    }),
    HttpApiEndpoint.post('create', '/', {
      payload: Schema.Struct({ name: Schema.String, email: Schema.String }),
      success: User,
    }),
    HttpApiEndpoint.get('search', '/search', {
      payload: { search: Schema.String },
      success: [
        Schema.Array(User),
        Schema.String.pipe(HttpApiSchema.asText({ contentType: 'text/csv' })),
      ],
      error: [
        SearchQueryTooShort.pipe(
          HttpApiSchema.asNoContent({ decode: () => new SearchQueryTooShort() }),
        ),
        HttpApiError.RequestTimeoutNoContent,
      ],
    }),
  )
  .middleware(Authorization)
  .prefix('/users')
  .annotateMerge(OpenApi.annotations({ title: 'Users', description: '...' })) {}

export class Api extends HttpApi.make('user-api')
  .add(UsersApiGroup)
  .add(SystemApi)
  .annotateMerge(OpenApi.annotations({ title: 'Acme User API' })) {}
```

## Error status — two equivalent forms

```ts
export class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()(
  'UserNotFound',
  {},
  { httpApiStatus: 404 },
) {}

error: UserNotFound.pipe(HttpApiSchema.status(404))
```

`HttpApiSchema`: `.status(n)`, `.asNoContent({ decode })`, `.asText({ contentType })`.

## Handlers — `HttpApiBuilder.group(Api, name, build)`

```ts
import { Effect, Layer } from 'effect'
import { HttpApiBuilder, HttpApiError } from 'effect/unstable/httpapi'

export const UsersApiHandlers = HttpApiBuilder.group(
  Api,
  'users',
  Effect.fn(function* (handlers) {
    const users = yield* Users
    return handlers
      .handle('list', ({ query }) => users.list(query.search).pipe(Effect.orDie))
      .handle('getById', ({ params }) =>
        users
          .getById(params.id)
          .pipe(
            Effect.catchReasons('UsersError', { UserNotFound: (e) => Effect.fail(e) }, Effect.die),
          ),
      )
      .handle('me', () => CurrentUser)
  }),
).pipe(Layer.provide([Users.layer, AuthorizationLayer]))
```

Handler ctx object exposes decoded `payload`, `path`/`params`, `query`/`urlParams`, `headers`, `request`.

## Middleware — `HttpApiMiddleware.Service`

```ts
export class Authorization extends HttpApiMiddleware.Service<
  Authorization,
  {
    provides: CurrentUser
    requires: never
  }
>()('acme/HttpApi/Authorization', {
  requiredForClient: true,
  security: { bearer: HttpApiSecurity.bearer },
  error: Unauthorized,
}) {}
```

Server impl: `Layer.succeed(Authorization, (effect) => Effect.provideService(effect, CurrentUser, ...))`.
Security-scheme impl: `Layer.succeed(Auth)({ apiKey: (effect, { credential }) => ... })`.
`HttpApiSecurity`: `.bearer`, `.basic`, `.apiKey({ in: "header"|"query"|"cookie", key })`, `.http({ scheme })`.

## Serve + derive client

```ts
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node'
import {
  HttpRouter,
  HttpServer,
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from 'effect/unstable/http'
import {
  HttpApiBuilder,
  HttpApiClient,
  HttpApiMiddleware,
  HttpApiScalar,
} from 'effect/unstable/httpapi'
import { createServer } from 'node:http'

const ApiRoutes = HttpApiBuilder.layer(Api, { openapiPath: '/openapi.json' }).pipe(
  Layer.provide([UsersApiHandlers, SystemApiHandlers]),
)
const DocsRoute = HttpApiScalar.layer(Api, { path: '/docs' })

const HttpServerLayer = HttpRouter.serve(Layer.mergeAll(ApiRoutes, DocsRoute)).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
)
Layer.launch(HttpServerLayer).pipe(NodeRuntime.runMain)

// serverless: HttpRouter.toWebHandler(routes.pipe(Layer.provide(HttpServer.layerServices)))

const AuthorizationClient = HttpApiMiddleware.layerClient(
  Authorization,
  Effect.fn(function* ({ next, request }) {
    return yield* next(HttpClientRequest.bearerToken(request, 'dev-token'))
  }),
)

class ApiClient extends Context.Service<ApiClient, HttpApiClient.ForApi<typeof Api>>()(
  'acme/ApiClient',
) {
  static readonly layer = Layer.effect(
    ApiClient,
    HttpApiClient.make(Api, {
      transformClient: (client) =>
        client.pipe(
          HttpClient.mapRequest(HttpClientRequest.prependUrl('http://localhost:3000')),
          HttpClient.retryTransient({ schedule: Schedule.exponential(100), times: 3 }),
        ),
    }),
  ).pipe(Layer.provide(AuthorizationClient), Layer.provide(FetchHttpClient.layer))
}
// usage: const client = yield* ApiClient; yield* client.users.list();
//        yield* client.users.getById({ path: { id: 123 } })
```
