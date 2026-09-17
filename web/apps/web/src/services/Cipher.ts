import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import * as Config from 'effect/Config'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import * as SchemaGetter from 'effect/SchemaGetter'
import * as SchemaIssue from 'effect/SchemaIssue'

import type { Entry as DomainEntry } from '../domain.ts'
import { entryFields, ENTRY_KEYS } from '../domain.ts'

export interface CipherShape {
  readonly seal: (plain: string) => string
  readonly isSealed: (stored: string) => boolean
  readonly Entry: Schema.Codec<DomainEntry, typeof DomainEntry.Encoded>
}

const ALGORITHM = 'aes-256-gcm'

const KEY_BYTES = 32

const IV_BYTES = 12

const TAG_BYTES = 16

const SEALED_PREFIX = 'enc:v1:'

export class UnsealFailed extends Schema.TaggedError<UnsealFailed>()('UnsealFailed', {
  cause: Schema.Unknown,
}) {}

const seal = (key: Buffer, plain: string) => {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])

  return SEALED_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64')
}

const unseal = (key: Buffer, stored: string) =>
  Result.try({
    try: () => {
      const packed = Buffer.from(stored.slice(SEALED_PREFIX.length), 'base64')
      const decipher = createDecipheriv(ALGORITHM, key, packed.subarray(0, IV_BYTES))
      decipher.setAuthTag(packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))

      return Buffer.concat([
        decipher.update(packed.subarray(IV_BYTES + TAG_BYTES)),
        decipher.final(),
      ]).toString('utf8')
    },
    catch: (cause) => new UnsealFailed({ cause }),
  })

const isSealed = (stored: string) => stored.startsWith(SEALED_PREFIX)

export class Cipher extends Context.Service<Cipher, CipherShape>()('app/Cipher', {
  make: Effect.gen(function* () {
    const key = yield* Config.redacted('ENCRYPTION_KEY').pipe(
      Config.map((value) => Buffer.from(Redacted.value(value), 'base64')),
    )

    if (key.length !== KEY_BYTES) {
      return yield* Effect.die(`ENCRYPTION_KEY must be ${KEY_BYTES} bytes, base64 encoded`)
    }

    const SealedString = Schema.String.pipe(
      Schema.decode({
        decode: SchemaGetter.transformOrFail((stored: string, options) =>
          isSealed(stored)
            ? Effect.fromResult(unseal(key, stored)).pipe(
                Effect.mapError(
                  (error) =>
                    new SchemaIssue.InvalidValue({ message: error.message }, stored, options),
                ),
              )
            : Effect.succeed(stored),
        ),
        encode: SchemaGetter.transform((plain: string) => seal(key, plain)),
      }),
    )

    const Entry = Schema.Struct({ ...entryFields, body: SealedString }).pipe(
      Schema.encodeKeys(ENTRY_KEYS),
    )

    return { seal: (plain) => seal(key, plain), isSealed, Entry } satisfies CipherShape
  }),
}) {
  static readonly layer = Layer.effect(this)(this.make)
}
