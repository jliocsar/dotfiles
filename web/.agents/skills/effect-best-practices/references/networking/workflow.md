# Workflow

`effect/unstable/workflow`. Durable, suspendable, idempotent execution.

`Workflow.make(name, { payload, idempotencyKey, success?, error?, suspendedRetrySchedule?, annotations? })`.

- `idempotencyKey: (payload) => string` (pure, stable) → deterministic `executionId` (hash of name+key).
- Returns: `.execute(payload, { discard? })`, `.executionId(payload)`, `.poll(id)`, `.interrupt(id)`, `.resume(id)`, `.toLayer(execute)`, `.withCompensation(effect, comp)`.
- `execute` body attached separately via `.toLayer((payload, executionId) => Effect)` — mirrors `Rpc.make`.

DO keep `idempotencyKey` stable for the same logical run; use `.executionId` then `.poll`/`.resume` for long runs.
DO register compensation at the TOP level of the workflow body — nested-activity compensation is NOT supported.
DON'T use `WorkflowEngine.layerMemory` in production (in-memory, lost on restart) — it's tests-only. Use a persistent engine (e.g. `ClusterWorkflowEngine` / SQL-backed via cluster) for durability.
DON'T call `Activity.make` with a positional `(name, fn)` — that's the mdx bug; pass an options object.

```ts
import { Effect, Layer, Schema } from 'effect'
import { Activity, Workflow, WorkflowEngine } from 'effect/unstable/workflow'

const ProcessOrder = Workflow.make('ProcessOrder', {
  payload: { orderId: Schema.String, items: Schema.Array(Schema.String) },
  success: Schema.Struct({ orderId: Schema.String, status: Schema.String }),
  idempotencyKey: ({ orderId }) => orderId,
})

const ProcessOrderLayer = ProcessOrder.toLayer((payload) =>
  Effect.gen(function* () {
    yield* reserveInventory
    yield* Effect.sleep('24 hours') // durable: survives restarts, suspends
    return { orderId: payload.orderId, status: 'shipped' }
  }),
)

const program = ProcessOrder.execute({ orderId: 'o-1', items: ['a'] }).pipe(
  Effect.provide(ProcessOrderLayer.pipe(Layer.provideMerge(WorkflowEngine.layerMemory))),
)
// fire-and-forget => deterministic id: ProcessOrder.execute(p, { discard: true })
```

## Activity.make — options object, `execute` is an Effect

`Activity.make({ name, execute, success?, error?, interruptRetryPolicy?, annotations? })`.

```ts
const reserveInventory = Activity.make({
  name: 'reserveInventory',
  success: Schema.Void,
  execute: Effect.gen(function* () {
    const inventory = yield* InventoryService
    yield* inventory.reserve('order-1')
  }),
})
```

- Named, schema-backed, durable units; results persisted per attempt (keyed by name+attempt).
- Retry: `Activity.retry(activity, schedulePolicy)` updates `Activity.CurrentAttempt` each attempt; `interruptRetryPolicy` controls retry-on-interrupt (exhaustion => die).
- `Activity.raceAll(name, ...activities)` races multiple external operations.

## Compensation (saga) — `withCompensation`

```ts
yield *
  ProcessOrder.withCompensation(
    reserveInventory,
    (value, cause) => releaseInventory(value), // runs on workflow failure; ONLY top-level effects
  )
```
