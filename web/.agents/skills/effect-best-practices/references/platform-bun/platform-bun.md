# platform-bun

## Import paths

Platform service Tags live in CORE `effect`, NOT `@effect/platform`. Bun adapters live in `@effect/platform-bun`.

- `FileSystem` → `effect/FileSystem`
- `Path` → `effect/Path`
- `Crypto` → `effect/Crypto`
- `Terminal` → `effect/Terminal`
- `Stdio` → `effect/Stdio`
- `ChildProcessSpawner` → `effect/unstable/process/ChildProcessSpawner`
- HTTP → `effect/unstable/http/*` (`HttpServer`, `HttpServerResponse`, `HttpClient`, `FetchHttpClient`, ...)
- Bun adapters → `@effect/platform-bun` (`BunRuntime`, `BunServices`, `BunHttpServer`, `BunFileSystem`, ...)

- DON'T import `HttpServerResponse`/`Crypto`/`FileSystem` from `@effect/platform` — wrong package in v4.
- DO yield the service Tag (`FileSystem.FileSystem`, `Path.Path`, ...) — same identity whether provided by Bun or Node layers, so libraries depend on the Tag, not the Bun layer.

## App entrypoint: `BunRuntime.runMain`

`BunRuntime` exports ONLY `runMain` (delegates to NodeRuntime). There is NO `BunRuntime.layer`.

`runMain` RUNS the program; it does NOT provide FS/network/terminal services. You provide those FIRST. It sets the process exit code, logs errors (pretty by default), and maps SIGINT/SIGTERM → interruption so scoped resources finalize.

```ts
export const runMain: {
  (options?: {
    readonly disableErrorReporting?: boolean | undefined
    readonly teardown?: Teardown | undefined
  }): <E, A>(effect: Effect<A, E>) => void
  <E, A>(
    effect: Effect<A, E>,
    options?: {
      readonly disableErrorReporting?: boolean | undefined
      readonly teardown?: Teardown | undefined
    },
  ): void
} = NodeRuntime.runMain
```

Canonical pattern:

```ts
import { BunRuntime, BunServices } from '@effect/platform-bun'
import * as Effect from 'effect/Effect'

program.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain)
```

- DON'T use `BunRuntime.layer` — it does not exist.

## Platform services bundle: `BunServices.layer`

```ts
export type BunServices = ChildProcessSpawner | Crypto | FileSystem | Path | Terminal | Stdio

export const layer: Layer.Layer<BunServices> = BunChildProcessSpawner.layer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      BunFileSystem.layer,
      BunCrypto.layer,
      BunPath.layer,
      BunStdio.layer,
      BunTerminal.layer,
    ),
  ),
)
```

- DO provide `BunServices.layer` near the edge for apps/CLIs that touch FS, paths, stdio, terminal, subprocesses.
- It does NOT include HttpServer, HttpClient, sockets, workers, or Redis — provide those separately.
- Most Bun core services re-export Node-shared impls:
  - `BunFileSystem.layer = NodeFileSystem.layer`
  - `BunPath.layer = NodePath.layer` (also `layerPosix`, `layerWin32`)
  - `BunTerminal.layer = NodeTerminal.layer`
  - `BunStdio.layer = NodeStdio.layer`
  - `BunChildProcessSpawner` re-exports `NodeChildProcessSpawner`
  - `BunHttpClient` re-exports `FetchHttpClient`, so `BunHttpClient.layer === FetchHttpClient.layer`.

## HTTP server: `BunHttpServer`

Layer API:

- `layer(options)` → provides `HttpServer | HttpPlatform | Etag.Generator | BunServices` (the FULL bundle; use for apps).
- `layerServer(options)` → ONLY `HttpServer` (server socket, no support services).
- `layerHttpServices` → `HttpPlatform + Etag.layerWeak + BunServices.layer` (support services only).
- `layerConfig(configWrap)` → like `layer` but reads serve options from `Config` (fails with `ConfigError`).
- `layerTest` → ephemeral port (`port: 0`) + fetch-based `HttpClient` for tests. Provides `HttpServer | HttpPlatform | FileSystem | Etag.Generator | Path | HttpClient`.
- `make(options)` → scoped constructor returning the `HttpServer` service.

Options = `ServeOptions<R>` = Bun `Serve` options (port/hostname/unix/routes) plus optional `disablePreemptiveShutdown?` and `gracefulShutdownTimeout?: Duration.Input` (default graceful timeout = 20s).

`HttpServer.serve` (from `effect/unstable/http/HttpServer`) turns a response Effect into a Layer requiring `HttpServer`:

```ts
export const serve: {
  <E, R>(
    effect: Effect.Effect<HttpServerResponse, E, R>,
  ): Layer.Layer<never, never, HttpServer | Exclude<R, HttpServerRequest | Scope.Scope>>
}
```

Canonical Bun HTTP app:

```ts
import { BunHttpServer, BunRuntime } from '@effect/platform-bun'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as HttpServer from 'effect/unstable/http/HttpServer'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'

const app = HttpServerResponse.text('Hello from Bun!')

HttpServer.serve(app).pipe(
  Layer.provide(BunHttpServer.layer({ port: 3000 })),
  Layer.launch,
  BunRuntime.runMain,
)
```

- DO use `BunHttpServer.layer({ port })` for apps; `layerTest`/`layer({ port: 0 })` for tests; `layerConfig` for config-driven ports.
- `Bun.serve` has ONE active `fetch` handler; each `serve` reloads it and restores the previous handler when the serve scope finalizes.
- WebSocket upgrade via `HttpServerRequest.upgrade` (calls `server.upgrade`); fails if not upgradeable; non-normal close codes map to `Socket` errors.
- Server stopped with `server.stop()` on scope close; preemptive graceful shutdown unless `disablePreemptiveShutdown: true`.
- DON'T acquire long-lived servers/subscriptions/worker loops outside a scope — breaks graceful shutdown on SIGINT/SIGTERM.

## FileSystem / Path / Command usage

```ts
import { BunFileSystem } from '@effect/platform-bun'
import * as FileSystem from 'effect/FileSystem'
import * as Effect from 'effect/Effect'

const read = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  return yield* fs.readFileString('config.json')
}).pipe(Effect.provide(BunFileSystem.layer))
```

- Child processes: use the `ChildProcessSpawner` Tag (from `effect/unstable/process/ChildProcessSpawner`) backed by `BunChildProcessSpawner.layer` (in `BunServices.layer`). v4 has no separate `Command` re-export in platform-bun; spawning goes through `ChildProcessSpawner`.
