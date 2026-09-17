# Tracing

Spans wrap effects; errors are auto-captured on the enclosing span.

- `Effect.withSpan(name, { attributes?, parent?, links?, ... })`.
- `Effect.annotateCurrentSpan(key, value | { ... })`.
- `Effect.annotateSpans(...)` — dual annotation helper.
- `Effect.fn("name")(function*(){...})` — auto-creates a span named `"name"` around the function body. Idiomatic way to name + trace a service method in one shot.
- `Effect.currentSpan` — access current span.
- `Layer.withSpan("name")` — attach a span around layer construction.

```ts
import { Context, Effect, Layer } from 'effect'

class Checkout extends Context.Service<
  Checkout,
  {
    processCheckout(orderId: string): Effect.Effect<void>
  }
>()('acme/Checkout') {
  static readonly layer = Layer.effect(
    Checkout,
    Effect.gen(function* () {
      return Checkout.of({
        processCheckout: Effect.fn('Checkout.processCheckout')(function* (orderId: string) {
          yield* Effect.logInfo('starting checkout', { orderId })
          yield* Effect.sleep('50 millis').pipe(
            Effect.withSpan('checkout.charge-card'),
            Effect.annotateSpans({ 'checkout.order_id': orderId, 'checkout.provider': 'acme-pay' }),
          )
        }),
      })
    }),
  )
}
```

## DO / DON'T

- DO name spans after operations: `"Database.query"`, `"API.fetch"`.
- DO prefer `Effect.fn("name")` over manual `Effect.withSpan` wrapping for service methods — gives span + stack trace naming.
- DO add IDs/types via `Effect.annotateCurrentSpan` / `Effect.annotateSpans`.
- DO provide the exporter/SDK layer at the very top (`Layer.provide(ObservabilityLayer)` last), so all spans flow to it.
- DON'T manually record errors — failures are auto-captured on the enclosing span.
