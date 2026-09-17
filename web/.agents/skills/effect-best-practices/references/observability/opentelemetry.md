# OpenTelemetry

Two export paths:

- Full OTel integration → `@effect/opentelemetry` (`NodeSdk`, `WebSdk`, `Tracer`, `Metrics`, `Logger`, `Resource`). Use when wiring an existing OTel SDK / instrumentations.
- Lightweight, no peer deps → `effect/unstable/observability` (`Otlp*`, `PrometheusMetrics`). Prefer for new projects.

## @effect/opentelemetry — NodeSdk / WebSdk

`NodeSdk.layer` / `WebSdk.layer` take config lazily (`LazyArg<Configuration>`) or effectfully (`Effect<Configuration>`). Returns `Layer.Layer<Resource.Resource>`. Signals are enabled only when their processor/reader is supplied. The layer is scoped: it `forceFlush()` + `shutdown()`s providers on release, and always provides `Resource.Resource` (built from env + explicit resource).

`Configuration`:

```ts
spanProcessor?: SpanProcessor | SpanProcessor[]
tracerConfig?
metricReader?: MetricReader | MetricReader[]
metricTemporality?: Metrics.TemporalityPreference
logRecordProcessor?: LogRecordProcessor | LogRecordProcessor[]
loggerProviderConfig?
loggerMergeWithExisting?: boolean
resource?: { serviceName: string; serviceVersion?: string; attributes?: Otel.Attributes }
shutdownTimeout?: Duration.Input  // default 3000ms
```

### Verified bootstrap

```ts
import * as NodeSdk from '@effect/opentelemetry/NodeSdk'
import { Effect } from 'effect'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'

const TracingLive = NodeSdk.layer(
  Effect.sync(() => ({
    resource: { serviceName: 'test' },
    spanProcessor: [new SimpleSpanProcessor(new InMemorySpanExporter())],
  })),
)
```

### Production-shaped (OTLP HTTP)

```ts
import { NodeSdk } from '@effect/opentelemetry'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

const NodeSdkLayer = NodeSdk.layer(() => ({
  resource: { serviceName: 'my-app', serviceVersion: '1.0.0' },
  spanProcessor: new BatchSpanProcessor(
    new OTLPTraceExporter({ url: 'http://localhost:4318/v1/traces' }),
  ),
}))
```

- Spans land as `Tracer.OtelSpan`; `Effect.currentSpan` resolves to it.
- `NodeSdk.layerEmpty` / `layerTracerProvider` available for advanced cases.

### GOTCHA

Register Node auto-instrumentations BEFORE importing modules that should be patched — many Node instrumentations hook module loading. Provide the SDK layer once, at the top of the app.

## Lightweight alt — effect/unstable/observability

Modules: `Otlp`, `OtlpExporter`, `OtlpTracer`, `OtlpLogger`, `OtlpMetrics`, `OtlpResource`, `OtlpSerialization`, `PrometheusMetrics`.

HTTP exporters need a serializer (`OtlpSerialization.layerJson`) and an `HttpClient` (`FetchHttpClient.layer`).

```ts
import { Layer } from 'effect'
import { FetchHttpClient } from 'effect/unstable/http'
import { OtlpLogger, OtlpSerialization, OtlpTracer } from 'effect/unstable/observability'

const OtlpTracingLayer = OtlpTracer.layer({
  url: 'http://localhost:4318/v1/traces',
  resource: {
    serviceName: 'checkout-api',
    serviceVersion: '1.0.0',
    attributes: { 'deployment.environment': 'staging' },
  },
})
const OtlpLoggingLayer = OtlpLogger.layer({
  url: 'http://localhost:4318/v1/logs',
  resource: { serviceName: 'checkout-api', serviceVersion: '1.0.0' },
})

export const ObservabilityLayer = Layer.merge(OtlpTracingLayer, OtlpLoggingLayer).pipe(
  Layer.provide(OtlpSerialization.layerJson),
  Layer.provide(FetchHttpClient.layer),
)
// provide LAST at the top: Main.pipe(Layer.provide(ObservabilityLayer))
```

### Combined single-call layer

`Otlp.layerJson({ baseUrl, resource?, headers? })` wires logs + metrics + traces in one layer (serializer baked in; appends `/v1/logs`, `/v1/metrics`, `/v1/traces` to `baseUrl`). Requires only `HttpClient.HttpClient`. Use `Otlp.layer` (bring your own serializer) or `Otlp.layerProtobuf` for variants. `OtlpResource.fromConfig` (invoked internally when you pass a `resource`) reads `OTEL_SERVICE_NAME` / `OTEL_SERVICE_VERSION` / `OTEL_RESOURCE_ATTRIBUTES` and merges with explicit options.

```ts
const ObservabilityLayer = Otlp.layerJson({
  baseUrl: 'http://localhost:4318',
  resource: { serviceName: 'checkout-api', serviceVersion: '1.0.0' },
}).pipe(Layer.provide(FetchHttpClient.layer))
```

### Prometheus

`PrometheusMetrics.layerHttp()` adds a `GET /metrics` route to an `HttpRouter` (requires `HttpRouter.HttpRouter`; customize with `PrometheusMetrics.layerHttp({ path, prefix })`). For a raw scrape body use `PrometheusMetrics.format()` → `Effect<string>` (or `formatUnsafe`).

### Resource

`OtlpResource.make({ serviceName, serviceVersion?, attributes? })` (the dotted keys `service.name`/`service.version` are the OUTPUT attribute names, not the input shape).

## DO / DON'T

- DO provide the SDK/exporter layer once, at the top of the app (provide LAST).
- DO prefer `effect/unstable/observability` for new projects (zero peer deps).
- DO pass a `resource` to an `Otlp*` layer so ops can override service name/version via `OTEL_*` env vars without a rebuild (`OtlpResource.fromConfig` merges them).
- DON'T import patched modules before registering Node auto-instrumentations.
