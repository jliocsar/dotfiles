# Effect v4 SQL — Schema, Resolvers, Models, Migrations

## SqlSchema — decode query results with Schema

Each helper takes `{ Request, Result, execute }` and returns `(request: Req["Type"]) => Effect<...>`. `execute` receives `Req["Encoded"]` (the ENCODED request) and returns `ReadonlyArray<unknown>` rows.

| Helper                    | Result on rows         | Empty result               |
| ------------------------- | ---------------------- | -------------------------- |
| `findAll`                 | `Array<Res>`           | `[]`                       |
| `findNonEmpty`            | `NonEmptyArray<Res>`   | fails `NoSuchElementError` |
| `findOne`                 | `Res` (first row)      | fails `NoSuchElementError` |
| `findOneOption`           | `Option<Res>`          | `Option.none`              |
| `void` (`SqlSchema.void`) | `void` (discards rows) | n/a                        |

```ts
import { SqlSchema } from 'effect/unstable/sql'
import { Schema } from 'effect'

const getUser = SqlSchema.findOne({
  Request: Schema.Number,
  Result: Schema.Struct({ id: Schema.Number, name: Schema.String }),
  execute: (id) => sql`SELECT * FROM users WHERE id = ${id}`,
})
const user = yield * getUser(1) // Effect<{id,name}, SchemaError | NoSuchElementError | SqlError, ...>
```

- GOTCHA: `execute` gets `Req["Encoded"]` not `Req["Type"]` — schema transforms/JSON/dates/bigints must match the dialect.
- Result schemas decode rows AFTER the client's row transforms have run.
- `findOne`/`findOneOption` only inspect the FIRST row; they do NOT assert exactly one row.

## SqlResolver — batched queries via RequestResolver

Wraps `Effect.request` so concurrent lookups batch into one SQL op. Payload equality/hash drive batching + dedup. Constructors: `ordered`, `findById`, `grouped`, `void`.

```ts
import { SqlResolver } from 'effect/unstable/sql'

const Select = SqlResolver.findById({
  Id: Schema.Number,
  Result: Schema.Struct({ id: Schema.Number, name: Schema.String }),
  ResultId: (r) => r.id,
  execute: (ids) => sql`SELECT * FROM test WHERE ${sql.in('id', ids)}`,
})

const exec = SqlResolver.request(Select) // curried form
const a = yield * Effect.all([exec(1), exec(2)], { concurrency: 'unbounded' })
// also: SqlResolver.request(payload, resolver)
```

- `ordered`: result count + ORDER must match request batch, else `ResultLengthMismatch`.
- `findById`: `where id in (...)`; missing ids fail `NoSuchElementError`.
- `grouped`: one-to-many; takes `RequestGroupKey` + `ResultGroupKey`.
- `void`: side-effecting (insert/update/delete).
- GOTCHA: batches split by active transaction connection — requests in different transactions don't batch together. DON'T assume `WHERE id IN (...)` preserves input order — use `findById`/`grouped`.

## SqlModel — repository / resolver patterns

Models come from `effect/unstable/schema` `Model.Class`. NOT from `SqlSchema.make`.

```ts
import { Model } from 'effect/unstable/schema'
import { SqlModel, SqlClient, SqlResolver } from 'effect/unstable/sql'
import { Schema } from 'effect'

class User extends Model.Class<User>('User')({
  id: Schema.Int.pipe(Model.FieldExcept(['insert'])), // db-generated, not in insert variant
  name: Schema.String,
  age: Schema.Int,
}) {}
// Variant schemas: User (select), User.insert, User.update, User.json, ...
// Build payloads with: User.insert.make({ name, age })

const repo =
  yield *
  SqlModel.makeRepository(User, {
    tableName: 'users',
    idColumn: 'id',
    spanPrefix: 'UserRepository',
    softDeleteColumn: 'deletedAt', // optional: reads filter `is null`, delete sets CURRENT_TIMESTAMP
  })
// repo: { insert, insertVoid, update, updateVoid, findById, delete }
const u = yield * repo.insert(User.insert.make({ name: 'Alice', age: 30 })) // -> User instance

// Batched resolver variant (returns RequestResolvers, run via SqlResolver.request):
const resolvers =
  yield * SqlModel.makeResolvers(User, { tableName: 'users', idColumn: 'id', spanPrefix: 'User' })
const alice =
  yield * SqlResolver.request(User.insert.make({ name: 'Alice', age: 30 }), resolvers.insert)
```

- DO model db-generated columns with `Model.FieldExcept(["insert"])`; soft-delete column with `Model.FieldOnly(["select","update"])`.
- Model field helpers: `FieldExcept`, `FieldOnly`, `FieldOption`, `GeneratedByApp`, `GeneratedByDb`, `Sensitive`, `DateTimeInsert`, `DateTimeUpdate`, `JsonFromString`.
- DON'T use `SqlSchema.DateTimeInsert` or `Schema.primaryKey` — they do not exist. Use `Model.*`.
- GOTCHA: dialects with RETURNING get the row back directly; MySQL does a follow-up `SELECT ... WHERE id = LAST_INSERT_ID()` — generated values must be observable from that query.

## Migrator

Generic `Migrator.make`; drivers re-export as `PgMigrator.run/layer`, `SqliteMigrator.run/layer`. Loaders: `fromFileSystem(dir)`, `fromGlob(record)`, `fromBabelGlob(record)`, `fromRecord(record)`.

```ts
import { SqliteMigrator } from '@effect/sql-sqlite-node'
import { SqlClient } from 'effect/unstable/sql'

// run form (provide SqlClient):
yield *
  SqliteMigrator.run({
    loader: SqliteMigrator.fromFileSystem('./migrations'),
    // schemaDirectory: "sql/migrations", table: "effect_sql_migrations"
  }).pipe(Effect.provideService(SqlClient.SqlClient, client))

// or as a layer that blocks dependents until migrations finish:
const MigratorLive = SqliteMigrator.layer({
  loader: SqliteMigrator.fromRecord({ '1_init': Effect.void }),
})
```

- Migration ids are unique NUMBERS; file pattern `<id>_<name>.{js,ts,mjs,mts}`; default-export an `Effect` using the current `SqlClient`. Only ids > latest recorded run execute — editing old migrations won't re-run them.
- Migrations run inside a transaction. On Postgres the migrations table is explicitly locked; other dialects rely on a table constraint to detect concurrent runners.
- `MigrationError` (`Data.TaggedError`) kinds: `BadState | ImportError | Failed | Duplicates | Locked`.
