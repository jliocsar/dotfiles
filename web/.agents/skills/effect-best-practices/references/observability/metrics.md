# Metrics

CRITICAL: in v4 metric updates/reads are STANDALONE functions, NOT methods. There is no `m.increment()`, no `m.record()`, no `Effect.withMetric`.

## Constructors

- `Metric.counter(name, { description?, attributes?, bigint?, incremental? })` → `Counter`. `incremental: true` = only accepts increments (negatives ignored).
- `Metric.gauge(name, { description?, attributes?, bigint? })` → `Gauge`.
- `Metric.frequency(name, { description?, attributes?, preregisteredWords? })` → `Frequency` (counts occurrences of string values).
- `Metric.histogram(name, { description?, attributes?, boundaries })` → `Histogram`. `boundaries: ReadonlyArray<number>` is REQUIRED.
- `Metric.summary(name, { description?, attributes?, maxAge, maxSize, quantiles })`.
- `Metric.timer(name, { ... })`.

## Update / read — standalone functions

- `Metric.update(metric, value)` — counters add, gauges set, frequency takes a string.
- `Metric.modify(metric, delta)` — gauge relative change (+/-).
- `Metric.value(metric)` → `Effect<State>` — read current state.
- `Metric.withAttributes(metric, attrs)` — tag/dimension a metric (v3 `tagged`/`taggedWithLabels` equivalent).
- `Metric.snapshot` → `Effect<ReadonlyArray<Snapshot>>` of all metrics.

```ts
import { Effect, Metric } from 'effect'

const requestCounter = Metric.counter('http_requests_total', {
  description: 'Total HTTP requests',
  incremental: true,
})
const memoryGauge = Metric.gauge('memory_usage_mb')
const responseTime = Metric.histogram('response_time_ms', {
  boundaries: [10, 50, 100, 250, 500, 1000],
})
const statusCodes = Metric.frequency('status_codes')

const program = Effect.gen(function* () {
  yield* Metric.update(requestCounter, 1)
  yield* Metric.update(memoryGauge, 512) // gauge: set absolute
  yield* Metric.modify(memoryGauge, 128) // gauge: relative +128
  yield* Metric.update(responseTime, 750)
  yield* Metric.update(statusCodes, '200') // frequency: string input
  const snap = yield* Metric.value(requestCounter)
})
```

## DO / DON'T

- DO call `Metric.update(metric, v)` / `Metric.modify(metric, delta)` — top-level functions returning Effects.
- DO define metric instances once at module scope (cheap descriptors) and reuse.
- DO supply `boundaries` for histograms (required) and `incremental: true` for monotonic counters.
- DO add dimensions via `Metric.withAttributes(metric, attrs)`.
- DON'T write `metric.increment()` / `metric.record(v)` — those methods DO NOT EXIST in v4.
- DON'T reach for `Effect.withMetric` — it does not exist in v4.
