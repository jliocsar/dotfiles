# Observability

Effect v4 observability pillar: logging, tracing, metrics, OpenTelemetry wiring.

- [logging.md](./logging.md): `Effect.log*`, `annotateLogs`, `withLogSpan`, `Logger.layer`/`toFile`/`batched`, min level via `References.MinimumLogLevel`.
- [tracing.md](./tracing.md): `Effect.withSpan`, `annotateCurrentSpan`/`annotateSpans`, `Effect.fn` auto-span, auto error capture.
- [metrics.md](./metrics.md): `Metric.counter`/`gauge`/`histogram`/`frequency`/`summary`/`timer`; standalone `Metric.update`/`modify`/`value`/`withAttributes`.
- [opentelemetry.md](./opentelemetry.md): `@effect/opentelemetry` `NodeSdk.layer`/`WebSdk`; lightweight `effect/unstable/observability` `Otlp.layerJson`, `PrometheusMetrics`.
