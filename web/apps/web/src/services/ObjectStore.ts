import * as Config from 'effect/Config'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'

export interface ObjectStoreShape {
  readonly newKey: Effect.Effect<string>
  readonly uploadUrl: (key: string) => string
  readonly downloadUrl: (key: string, mime: string, disposition: string) => string
  readonly remove: (key: string) => Effect.Effect<void>
}

const UPLOAD_TTL_SECONDS = 15 * 60

const DOWNLOAD_TTL_SECONDS = 5 * 60

const TIGRIS_ENDPOINT = 'https://t3.storage.dev'

export class ObjectStore extends Context.Service<ObjectStore, ObjectStoreShape>()(
  'app/ObjectStore',
  {
    make: Effect.gen(function* () {
      const config = yield* Config.all({
        accessKeyId: Config.redacted('AWS_ACCESS_KEY_ID'),
        secretAccessKey: Config.redacted('AWS_SECRET_ACCESS_KEY'),
        endpoint: Config.string('AWS_ENDPOINT_URL_S3').pipe(Config.withDefault(TIGRIS_ENDPOINT)),
        bucket: Config.string('BUCKET_NAME'),
      })

      const client = new Bun.S3Client({
        accessKeyId: Redacted.value(config.accessKeyId),
        secretAccessKey: Redacted.value(config.secretAccessKey),
        endpoint: config.endpoint,
        bucket: config.bucket,
        region: 'auto',
      })

      const newKey = Effect.sync(() => `artifacts/${Bun.randomUUIDv7()}`)

      const uploadUrl = (key: string) =>
        client.presign(key, { method: 'PUT', expiresIn: UPLOAD_TTL_SECONDS })

      const downloadUrl = (key: string, mime: string, disposition: string) =>
        client.presign(key, {
          method: 'GET',
          expiresIn: DOWNLOAD_TTL_SECONDS,
          type: mime,
          contentDisposition: disposition,
        })

      const remove = Effect.fn('ObjectStore.remove')((key: string) =>
        Effect.promise(() => client.delete(key)),
      )

      return { newKey, uploadUrl, downloadUrl, remove } satisfies ObjectStoreShape
    }),
  },
) {
  static readonly layer = Layer.effect(this)(this.make)
}
