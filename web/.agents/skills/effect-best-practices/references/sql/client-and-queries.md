# Effect v4 SQL — Client, Queries, Transactions, Errors

## Imports

```ts
import {
  SqlClient,
  SqlSchema,
  SqlResolver,
  SqlModel,
  Statement,
  Migrator,
  SqlError,
  SqlStream,
  SqlConnection,
} from 'effect/unstable/sql'
import * as SqlClient from 'effect/unstable/sql/SqlClient'

import { Model } from 'effect/unstable/schema'

import { PgClient, PgMigrator } from '@effect/sql-pg'
import { SqliteClient, SqliteMigrator } from '@effect/sql-sqlite-bun'
import { SqliteClient, SqliteMigrator } from '@effect/sql-sqlite-node'
import { MysqlClient } from '@effect/sql-mysql2'
```

- DO get the client via the service tag: `const sql = yield* SqlClient.SqlClient`.
- DON'T write `import * as Sql from "effect/unstable/sql"` then `Sql.SqlClient` — `SqlClient` is itself a namespace; the tag is `SqlClient.SqlClient`.

## Building a SqlClient layer

Every driver `layer(config)` returns `Layer.Layer<DriverClient | SqlClient.SqlClient, ...>` and internally pipes through `Layer.provide(Reactivity.layer)`. The layer provides BOTH the driver tag (`PgClient`, `SqliteClient`) AND the generic `SqlClient.SqlClient`, plus Reactivity.

- DO depend on `SqlClient.SqlClient` in generic code; reach for the driver tag only for driver-specific helpers (`pg.json`, `pg.listen`, `sqlite.export`).
- DO wrap secrets (`password`/`url`) in `Redacted.make` — those fields are `Redacted.Redacted`.
- GOTCHA: calling `.make(...)` directly (not `.layer`) requires you to provide `Reactivity.Reactivity` + a `Scope` yourself. Tests do `Effect.provide([NodeFileSystem.layer, Reactivity.layer])`.

### pg

`PgClient.layer` / `layerConfig` / `make` (scoped pool) / `makeClient` (single client) / `fromPool` / `fromClient`. Pool-backed by default.

```ts
import { PgClient } from '@effect/sql-pg'
import { Config, Duration, Redacted, String } from 'effect'

const PgLive = PgClient.layer({
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  username: 'postgres',
  password: Redacted.make('password'),
  // url: Redacted.make("postgresql://user:pass@localhost:5432/mydb"),
  ssl: false,
  maxConnections: 10,
  minConnections: 2,
  connectionTTL: Duration.minutes(5),
  idleTimeout: Duration.seconds(30),
  connectTimeout: Duration.seconds(5),
  applicationName: 'my-app',
  transformResultNames: String.snakeToCamel,
  transformQueryNames: String.camelToSnake,
})

const PgFromEnv = PgClient.layerConfig({
  url: Config.redacted('DATABASE_URL'),
})
```

`PgClientConfig` fields: `url, host, port, path, ssl, database, username, password, connectTimeout, stream, applicationName, spanAttributes, transformResultNames, transformQueryNames, transformJson, types`. Pool adds: `idleTimeout, maxConnections, minConnections, connectionTTL`.

pg-specific client API:

- `pg.json(value): Fragment`
- `pg.listen(channel): Stream<string, SqlError>`
- `pg.notify(channel, payload): Effect<void, SqlError>`

GOTCHA: `pg.listen` opens a scoped long-lived client and runs `UNLISTEN` on scope close. Keep the stream scoped only as long as you need notifications.

### sqlite-bun (`bun:sqlite`)

```ts
import { SqliteClient } from '@effect/sql-sqlite-bun'

const Db = SqliteClient.layer({
  filename: './mydb.db', // or ":memory:"
  readonly: false,
  create: true,
  readwrite: true,
  disableWAL: false,
  transformResultNames: (s) => s,
  transformQueryNames: (s) => s,
})
```

Bun `SqliteClientConfig` (ONLY these): `filename, readonly, create, readwrite, disableWAL, spanAttributes, transformResultNames, transformQueryNames`.

Bun-specific client API:

- `sqlite.export: Effect<Uint8Array, SqlError>`
- `sqlite.loadExtension(path)`

Bun GOTCHAs:

- One scoped `bun:sqlite` `Database` handle per client; access is serialized via a semaphore. A transaction holds the permit for its whole scope — other fibers on the same client wait.
- WAL is enabled by default — set `disableWAL: true` for read-only DBs or unwritable dirs.
- `executeStream` is not implemented (`sql.stream` dies). `updateValues` is not supported (SQLite).
- Safe-integer handling follows the fiber-local `SqlClient.SafeIntegers` reference (default `false`).

### sqlite-node (`better-sqlite3`)

Config (ONLY these): `filename, readonly, prepareCacheSize, prepareCacheTTL, disableWAL, spanAttributes, transformResultNames, transformQueryNames`.

- DON'T use `create`, `readwrite`, `fileMustExist`, `timeout`, `verbose` on sqlite-node — they do not exist. (`create`/`readwrite` exist only on the bun config.)

## The `sql` tagged-template API

`sql` is a `Constructor`: callable as a tagged template, OR as `sql(string) -> Identifier`. A `Statement<A>` is itself an `Effect<ReadonlyArray<A>, SqlError>` plus extra channels.

```ts
const sql = yield* SqlClient.SqlClient

// Interpolated values become BIND PARAMETERS (safe):
const rows = yield* sql`SELECT * FROM users WHERE id = ${id}`
const first = rows[0]

// Identifier escaping (table/column names):
yield* sql`SELECT * FROM ${sql("users")} WHERE ${sql("user_id")} = ${id}`

// IN clause:
sql`SELECT * FROM test WHERE id IN ${sql.in(ids)}`     // ArrayHelper form
sql`... WHERE ${sql.in("id", ids)}`                     // column+values -> Fragment
//   sql.in("id", []) compiles to `1=0` (neverFragment) — safe empty-IN.

// AND / OR chains:
sql`SELECT * FROM users WHERE ${sql.and([sql`age > ${18}`, sql`name = ${name}`])}`
sql.or([/* ... */])

// csv (ORDER BY / GROUP BY), optional prefix:
sql`SELECT * FROM t ${sql.csv("ORDER BY", [sql("a"), sql("b")])}`

// INSERT helper (single or array):
yield* sql`INSERT INTO users ${sql.insert({ name, email })}`
yield* sql`INSERT INTO users ${sql.insert(rows)}`                 // batch
yield* sql`INSERT INTO users ${sql.insert(row).returning("*")}`   // RETURNING (pg/sqlite)

// UPDATE single row (omit keys you don't want in SET, e.g. id):
sql`UPDATE users SET ${sql.update(row, ["id"])} WHERE id = ${row.id}`
// updateValues(rows, alias) — multi-row update; NOT supported in sqlite.

// Raw / unsafe (TRUSTED text only — no escaping of SQL syntax):
sql.unsafe<Row>("SELECT * FROM users WHERE id = $1", [id])
sql.literal("now()")

// Dialect branching:
sql.onDialect({ sqlite: () => /* ... */, pg: () => /* ... */, mysql: () => /* ... */, mssql: () => /* ... */, clickhouse: () => /* ... */ })
sql.onDialectOrElse({ orElse: () => /* ... */, mysql: () => /* ... */ })
```

Statement extra channels: `.raw` (driver result, e.g. sqlite `{ changes, lastInsertRowid }`), `.withoutTransform`, `.stream` (Stream), `.values` (array-of-arrays), `.unprepared`, `.compile(withoutTransform?) -> [sql, params]`.

- DO use `${value}` for data and `sql(name)` for identifiers.
- DON'T string-concatenate untrusted input into `sql.unsafe`/`sql.literal` — those bypass escaping. Bound params protect VALUES, not SQL syntax.
- For SQLite write metadata (`changes`, `lastInsertRowid`) use `.raw`, not the default row array.

## Transactions

`sql.withTransaction(effect)` wraps an effect so all queries run with the same client join the txn. Top-level => BEGIN/COMMIT/ROLLBACK; nested => SAVEPOINTs (`effect_sql_<id>`).

```ts
const transfer = (from: number, to: number, amount: number) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`UPDATE accounts SET balance = balance - ${amount} WHERE id = ${from}`
    yield* sql`UPDATE accounts SET balance = balance + ${amount} WHERE id = ${to}`
  }).pipe(sql.withTransaction)

// Equivalent call form: sql.withTransaction(sql`INSERT ...`)
```

- Rolls back on failure OR interruption (uninterruptible mask + exit-based commit/rollback).
- GOTCHA: a query only joins the txn when run with the SAME client service. DON'T mix clients or manually `reserve`d connections when atomicity matters.
- `sql.reserve` (scoped `Connection`) for lower-level work; `sql.withoutTransforms()` to bypass name transforms; `sql.safe` is a self-copy for tools like safeql.

## SqlError handling

`SqlError` is a `Schema.TaggedErrorClass` with `_tag: "SqlError"` and a single `reason` field. `error.message`/`error.cause`/`error.isRetryable` delegate to the reason.

Reason tags (each a `Schema.TaggedErrorClass`, carrying `cause`, `message`, `operation`): `ConnectionError` (retryable), `AuthenticationError`, `AuthorizationError`, `SqlSyntaxError`, `UniqueViolation` (+ `constraint`), `ConstraintError`, `DeadlockError` (retryable), `SerializationError` (retryable), `LockTimeoutError` (retryable), `StatementTimeoutError` (retryable), `UnknownError`. Also `ResultLengthMismatch` (resolver) with `expected`/`actual`.

```ts
program.pipe(
  Effect.catchTag('SqlError', (e) => {
    if (e.reason._tag === 'UniqueViolation') return Effect.fail({ _tag: 'Duplicate' as const })
    return Effect.fail(e)
  }),
)

program.pipe(Effect.retry({ while: (e) => SqlError.isSqlError(e) && e.isRetryable }))
```

- DO branch on `error.reason._tag` (structured) — don't string-match `error.message`.
- pg classifies by SQLSTATE code: `23505`->UniqueViolation, `40P01`->Deadlock, `40001`->Serialization, `57014`->StatementTimeout, `08*`->Connection.
