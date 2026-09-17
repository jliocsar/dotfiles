# Networking

Effect v4 networking and distributed pillars. All modules live under `effect/unstable/*`; platform impls from `@effect/platform-node`.

- [HTTP Client](http-client.md): `HttpClient.HttpClient` service — bake base-url/headers/retry, decode bodies via Schema, `FetchHttpClient.layer`.
- [HTTP API](http-api.md): declarative `HttpApi`/`HttpApiGroup`/`HttpApiEndpoint`, serving, typed client derivation, middleware, security.
- [RPC](rpc.md): `Rpc.make`/`RpcGroup.make`, handlers, server/client wiring, serialization, streaming.
- [Workflow](workflow.md): durable `Workflow.make`/`Activity.make`, execution control, compensation (sagas).
- [Cluster](cluster.md): `Entity.make`, entity clients, persistence, socket vs test transports.
