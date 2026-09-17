# Schema

`Schema` lives at the TOP level. Import it from `effect` directly.

```ts
import { Schema } from 'effect'
// transforms also pull from:
import { SchemaGetter, SchemaTransformation } from 'effect'
```

- DO: `import { Schema } from "effect"`. It is NOT under `unstable/`.
- DON'T: trust v3 idioms (`Schema.filter`, `Schema.minLength`, `Schema.transform`, `Schema.Record({key,value})`, `decodeEither`) — all changed in v4. The whole module was rewritten.

## Struct, Class, TaggedClass

```ts
const User = Schema.Struct({ name: Schema.String, age: Schema.Int })
```

```ts
// no tag
Schema.Class<Self>(id)(fields)
// tagged: adds a "_tag" literal field, auto-populated
Schema.TaggedClass<Self>()(tag, fields)
```

```ts
const UserId = Schema.Int.pipe(Schema.brand('UserId'))
export type UserId = typeof UserId.Type
```

- DO: use `Schema.Class` for nominal domain models; `Schema.TaggedClass` when you need a `_tag` discriminant.
- Struct derivation: `.mapFields(Struct.pick/omit/assign/evolve(...))`; tuples: `.mapElements(Tuple.*)`.

## Type extraction

v3 `.To` / `.From` are GONE. Use `Type` (decoded) and `Encoded`.

```ts
type T = typeof MySchema.Type // v4 preferred (instance-level)
type E = typeof MySchema.Encoded
```

```ts
// also valid, more verbose (namespace form)
type T = Schema.Schema.Type<typeof MySchema>
type E = Schema.Schema.Encoded<typeof MySchema>
```

- DO: `typeof X.Type` / `typeof X.Encoded` — the idiom used in v4 domain fixtures.
- DON'T: `Schema.Schema.To` / `Schema.Schema.From` (v3, removed).

## Brands

```ts
const UserId = Schema.Int.pipe(Schema.brand('UserId'))
type UserId = typeof UserId.Type // Int & Brand<"UserId">
```

- `Schema.brand(id)` is type-only + metadata: it adds NO runtime check. Apply checks on the base FIRST, then brand. Chainable and stackable:

```ts
Schema.String.check(Schema.isMinLength(1)).pipe(Schema.brand('b'))
```

- `Schema.fromBrand(id, ctor)` applies a `Brand.Constructor`'s checks AND the brand tag.
- DO brand: entity IDs (`UserId`, `OrderId`), domain scalars that must not be mixed structurally.
- DON'T brand: transient/internal DTO shapes, or structs already nominal via `Schema.Class`.

## Filters / refinements

v3 `Schema.minLength` / `Schema.pattern` constructors are GONE. v4 uses `.check(...)` with `Schema.is*` filter factories. `filter` is NOT a top-level export — only `check` and `refine`.

```ts
Schema.String.check(Schema.isMinLength(5))
Schema.String.check(Schema.isPattern(/^[a-z]+$/))
Schema.String.check(Schema.isUUID(4)) // adds format:"uuid"
Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)) // multiple checks per call
Schema.Int.check(Schema.isBetween({ minimum: 5, maximum: 10 }))
```

- `Schema.refine(guard, annotations?)`: narrows the TS type via a `value is T` type guard + attaches a runtime filter.
- Filter annotations: `{ message: () => "...", expected, identifier }`. Default formatter uses `message`, then `expected`, then `<filter>`.
- DON'T: `Schema.String.pipe(Schema.filter(...))` or `Schema.minLength(5)` (v3) — use `.check(Schema.is*())`.
- No bare `Schema.UUID` const — it's the check `Schema.isUUID()` on `Schema.String`.

## Transforms

NO top-level `Schema.transform` / `Schema.transformOrFail` in v4. Transformations are applied as methods using `SchemaTransformation` (prebuilt) or `SchemaGetter` getters.

```ts
import { Schema, SchemaGetter, SchemaTransformation } from 'effect'

// prebuilt transformation
const Up = Schema.String.decode(SchemaTransformation.toUpperCase())
SchemaTransformation.numberFromString // also trim, dateFromString, optionFromNullOr…

// custom via decodeTo / encodeTo + getters
const NumberFromString = Schema.Number.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.transform((s: string) => Number(s)),
    encode: SchemaGetter.transform((n: number) => String(n)),
  }),
)
```

- `Schema.decodeTo(to, {decode, encode})` / `Schema.encodeTo(to, {decode, encode})`: method-based transform to/from another schema.
- `SchemaTransformation.transform({decode,encode})` and `.transformOrFail({decode,encode})` (returns Effect) live in the `SchemaTransformation` module.
- `Schema.decode({decode,encode})`: identity-target transform on the same Type using `SchemaGetter.Getter`s.
- DON'T: `Schema.transform(...)` / `Schema.transformOrFail(...)` at top level (v3, removed).

## Decode / Encode variants

All take `(schema)(input)`. The suffix decides the result wrapper. `decode*` assumes input already typed as `Encoded`; `decodeUnknown*` accepts `unknown`.

| fn                                       | returns                                    |
| ---------------------------------------- | ------------------------------------------ |
| `decodeUnknownEffect` / `decodeEffect`   | **Effect** (no bare `decodeUnknown` in v4) |
| `decodeUnknownSync` / `decodeSync`       | value, **throws** on failure               |
| `decodeUnknownOption` / `decodeOption`   | **Option**                                 |
| `decodeUnknownResult` / `decodeResult`   | **Result** (NOT `Either`)                  |
| `decodeUnknownExit` / `decodeExit`       | **Exit**                                   |
| `decodeUnknownPromise` / `decodePromise` | **Promise**                                |

Mirror set for `encode*`: `encodeSync`, `encodeOption`, `encodeResult`, `encodeExit`, `encodePromise`, plus `encodeUnknown*`.

Schema-level constructors (no de/encode): `.make(input)` throws, `.makeOption(input)` → Option, `.makeEffect(input)` → Effect.

```ts
// boundary decode inside Effect.gen
const user = yield * Schema.decodeUnknownEffect(User)(input)
```

- DO at boundaries: `Schema.decodeUnknownEffect(S)(input)` (Effect) inside `Effect.gen`; reach for `decodeUnknownResult` / `decodeUnknownOption` when failure is expected and handled locally; `decodeUnknownSync` only at trusted edges/tests.
- DON'T: `Schema.decodeUnknownEither` / `decodeEither` (v3) — it's `*Result` now.

## Union, Record, optional, Option fields

```ts
Schema.Union([a, b]) // takes an ARRAY now
Schema.Literals(['x', 'y']) // literal unions
Schema.Literal('x') // single literal
Schema.Record(key, value) // POSITIONAL args (not {key,value})
```

```ts
Schema.optionalKey(S)   // exact optional: key may be ABSENT (no `| undefined`)
Schema.optional(S)      // = optionalKey(UndefinedOr(S)): absent OR `| undefined`
Schema.mutableKey(S)    // fields are readonly by default; opt-in mutable
Schema.NullOr(S)        // also UndefinedOr, NullishOr
S.pipe(Schema.withDecodingDefault(() => v))   // default when key missing/undefined during DECODE
S.pipe(Schema.withConstructorDefault(...))     // default for .make()
```

Option-valued fields (decode into `Option<T>` while wire form is `T | null`):

```ts
Schema.OptionFromNullOr(S) // also OptionFromNullishOr
// SchemaTransformation.optionFromOptionalKey / optionFromNullOr / …
```

- DO: model "maybe present" with `optionalKey` (exact) for API shapes; use `OptionFromNullOr` when the domain Type should be `Option<T>`.
- DON'T: hand-roll `| null | undefined` unions when a combinator exists; don't use loose `optional` when you mean exact-optional `optionalKey`.

## Discriminated unions without classes

```ts
Schema.TaggedStruct(tag, fields) // struct with a "_tag" literal
Schema.TaggedUnion({ Tag: { fields } }) // discriminated union
Schema.tag('X') // a "_tag" literal field with constructor default
Schema.tagDefaultOmit('X') // like tag(), but STRIPPED from encoded output
Schema.Opaque<Self>()(schema) // nominal opaque type/class
```

```ts
class UserId extends Schema.Opaque<UserId>()(Schema.String) {}
```

`Schema.TaggedUnion` returns a schema carrying `.cases`, `.guards`, `.isAnyOf`, `.match`:

```ts
const Shape = Schema.TaggedUnion({
  Circle: { radius: Schema.Number },
  Rectangle: { width: Schema.Number, height: Schema.Number },
})

Shape.cases.Circle.make({ radius: 5 }) // { _tag: "Circle", radius: 5 } — each case is a TaggedStruct
Shape.match(value, {
  // data-first OR data-last (cases-only) match
  Circle: (c) => Math.PI * c.radius ** 2,
  Rectangle: (r) => r.width * r.height,
})
```

`Schema.toTaggedUnion(tagKey)` augments an EXISTING `Schema.Union` of structs that discriminate on a CUSTOM key (not `_tag`), adding the same `.cases`/`.match`/`.guards`:

```ts
const A = Schema.Struct({ type: Schema.Literal('a'), value: Schema.Number })
const B = Schema.Struct({ type: Schema.Literal('b'), name: Schema.String })
const U = Schema.Union([A, B]).pipe(Schema.toTaggedUnion('type'))
U.match({ type: 'a', value: 1 }, { a: (x) => x.value, b: (x) => x.name })
```

- DO: `TaggedUnion({...})` to build from scratch (keys become `_tag`); `toTaggedUnion(key)` to add utils to a union that already discriminates on another literal key.
- Throws at construction if members share a discriminant value / lack a unique literal on `tagKey`.
- Use `tagDefaultOmit` for wire formats that omit the discriminator but you still want a `_tag` for matching.

## Struct field derivation

`.fields` exposes each member schema for reuse; several combinators reshape structs:

```ts
const User = Schema.Struct({ name: Schema.String, age: Schema.Int })
User.fields.name // reuse a single field schema

// add fields to a struct or every member of a union (shortcut for mapFields(Struct.assign(...)))
Schema.Union([Schema.Struct({ a: Schema.String })]).mapMembers(([m]) => [
  Schema.fieldsAssign({ c: Schema.Number })(m),
])

// rename encoded (wire) keys without changing the decoded Type: { decodedKey: encodedKey }
const P = Schema.Struct({ name: Schema.String }).pipe(Schema.encodeKeys({ name: 'full_name' }))
// decode { full_name } -> { name };  encode { name } -> { full_name }

// derive decoded-only fields (Option-returning); stripped on encode
Schema.Struct({ first: Schema.String, last: Schema.String }).pipe(
  Schema.extendTo(
    { fullName: Schema.String },
    { fullName: (p) => Option.some(`${p.first} ${p.last}`) },
  ),
)
```

- DO: `.fields.X` to share field schemas; `encodeKeys` for decoded↔wire key renaming; `extendTo` for computed fields that must NOT appear in the encoded form.
- `encodeKeys` throws if two fields collapse to the same encoded key. `fieldsAssign(fields)` is curried — apply to a struct (or map over union members).

## Scalars

`Schema.NonEmptyString`, `Schema.Finite`, `Schema.Trim`, `Schema.Date` (instanceOf), `Schema.DateTimeUtc` (declare-based), `Schema.DateTimeUtcFromDate`, `Schema.Int`.

- `Schema.DateTimeUtcFromString` — decodes an ISO string → `DateTime.Utc` (`_tag: "Utc"`); encodes back to the ISO string. (Also `DateTimeUtcFromMillis`, `DateTimeZonedFromString`.)
- `Schema.Json` — validates any immutable JSON-compatible value (`Codec<Json>`); rejects non-JSON (functions, etc.). `Schema.MutableJson` for the mutable variant.

```ts
Schema.decodeUnknownSync(Schema.DateTimeUtcFromString)('2024-01-01T00:00:00Z') // DateTime.Utc
Schema.decodeUnknownOption(Schema.Json)({ key: [1, true, null] }) // Option<Json>
```

## Annotations

Attach via the relevant API's annotations arg or annotation calls: `{ message: () => "...", expected, identifier }` on filters; class metadata as the trailing annotations arg (e.g. `httpApiStatus`).

## Tagged errors

Schema-based errors use `Schema.TaggedErrorClass` (note the `Class` suffix — v3 used `Schema.TaggedError` without it). They mix in `Cause.YieldableError` so instances are `yield*`-able. Full error coverage lives in `../core/error-handling.md`.

```ts
export class UserNotFound extends Schema.TaggedErrorClass<UserNotFound>()(
  'UserNotFound',
  {},
  { httpApiStatus: 404 }, // HTTP status is an ANNOTATION (3rd arg), not a field
) {}
```

- DON'T: `Schema.TaggedError` / `Schema.TaggedClass(...)` for errors — error variants require the `Class` suffix and `(Tagged)ErrorClass` for yieldability. See `../core/error-handling.md`.
