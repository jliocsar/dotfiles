# Effect v4 Reference

Best-practice references for Effect v4. Source of truth is the Effect v4 monorepo; these docs are verified against it. Navigate to the pillar you need.

- [Core](core/index.md): writing effects (`Effect.gen`/`Effect.fn`), error handling, data types (`Option`/`Result`/`Data`/`Duration`).
- [Services](services/index.md): `Context.Service`, layer composition, runtime/scope, config.
- [Schema](schema/index.md): structs, branded types, filters, transforms, codecs, tagged errors.
- [Concurrency](concurrency/index.md): concurrency options, fibers, streams, queues/pubsub, scheduling, batching.
- [Observability](observability/index.md): logging, tracing, metrics, OpenTelemetry.
- [Networking](networking/index.md): HTTP client, HttpApi, RPC, Workflow, Cluster.
- [SQL](sql/index.md): clients, queries, schemas, models, migrations.
- [AI](ai/index.md): language models, providers, tools, structured output, embeddings, chat.
- [Atom](atom/index.md): reactive state (`@effect/atom`) and React bindings.
- [Platform Bun](platform-bun/index.md): Bun runtime entrypoint, services, HTTP server.
- [Testing](testing/index.md): `@effect/vitest` patterns.
- [Anti-Patterns](anti-patterns.md): forbidden patterns and v3 holdovers, with corrections.
