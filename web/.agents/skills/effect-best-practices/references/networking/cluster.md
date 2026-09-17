# Cluster

`effect/unstable/cluster`. Entities are sharded, addressable, stateful actors backed by Rpc defs.

- `Entity.make(name, [rpc...])` — entity = array of `Rpc` defs.
- `.toLayer(handlers, { maxIdleTime })` — passivation: idle entity stopped, recreated on demand.
- Client: `Entity.client` yields a `clientFor(id)` function; address by entity id.
- `ClusterSchema.Persisted` annotation persists messages (default = volatile/network-only).

DO use `TestRunner.layer` + `Layer.provideMerge` in tests (so tests can touch storage); `NodeClusterSocket.layer()` over a `SqlClient` layer in production.
DO `Rpc.fork` inside read handlers to allow concurrency (default = sequential per entity).
DON'T assume messages persist — they're volatile unless annotated `ClusterSchema.Persisted`.

```ts
import { NodeClusterSocket, NodeRuntime } from '@effect/platform-node'
import { Effect, Layer, Ref, Schema } from 'effect'
import { ClusterSchema, Entity, TestRunner } from 'effect/unstable/cluster'
import { Rpc } from 'effect/unstable/rpc'

const Increment = Rpc.make('Increment', {
  payload: { amount: Schema.Number },
  success: Schema.Number,
})
const GetCount = Rpc.make('GetCount', { success: Schema.Number }).annotate(
  ClusterSchema.Persisted,
  true,
)

const Counter = Entity.make('Counter', [Increment, GetCount])

const CounterEntityLayer = Counter.toLayer(
  Effect.gen(function* () {
    const count = yield* Ref.make(0)
    return Counter.of({
      Increment: ({ payload }) => Ref.updateAndGet(count, (c) => c + payload.amount),
      GetCount: () => Ref.get(count).pipe(Rpc.fork),
    })
  }),
  { maxIdleTime: '5 minutes' },
)

const useCounter = Effect.gen(function* () {
  const clientFor = yield* Counter.client
  const counter = clientFor('counter-123')
  yield* counter.Increment({ amount: 1 })
  yield* counter.GetCount()
})

const ClusterLayer = NodeClusterSocket.layer().pipe(Layer.provide(SqlClientLayer))
const Production = Layer.mergeAll(CounterEntityLayer).pipe(Layer.provide(ClusterLayer))

const TestLayer = Layer.mergeAll(CounterEntityLayer).pipe(Layer.provideMerge(TestRunner.layer))
Layer.launch(Production).pipe(NodeRuntime.runMain)
```

Lifecycle: created on first message, passivated after `maxIdleTime`, resumed on next message; with `ClusterSchema.Persisted`, state can be reconstructed from persisted messages. Sharding handled by the cluster runtime (`Sharding`, `ShardingConfig`, `Runner*`). Other primitives: `Singleton`, `ClusterCron`, `SqlMessageStorage`/`SqlRunnerStorage`, `ClusterWorkflowEngine` (bridges Workflow→cluster).
