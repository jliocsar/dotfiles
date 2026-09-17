import * as Alchemy from 'alchemy'
import * as Docker from 'alchemy/Docker'
import * as Fly from 'alchemy/Fly'
import * as Output from 'alchemy/Output'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

const APP_NAME = 'jc-dotfiles-web'

const REGION = 'gru'

const PORT = 3123

const Site = Fly.App('Site', { name: APP_NAME })

const Artifacts = Fly.Bucket('Artifacts', { name: 'dotfiles-web-artifacts' })

const required = <Value>(label: string) =>
  Output.mapEffect((value: Value | undefined) => {
    if (value === undefined) {
      return Effect.die(`${label} was not returned by the provider`)
    }

    return Effect.succeed(value)
  })

export default Alchemy.Stack(
  'DotfilesWeb',
  {
    providers: Layer.mergeAll(Fly.providers(), Docker.providers()),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const site = yield* Site
    const artifacts = yield* Artifacts

    yield* Fly.Secret('PasswordHash', {
      app: site,
      name: 'PASSWORD_HASH',
      value: yield* Config.redacted('PASSWORD_HASH'),
    })
    yield* Fly.Secret('EncryptionKey', {
      app: site,
      name: 'ENCRYPTION_KEY',
      value: yield* Config.redacted('ENCRYPTION_KEY'),
    })
    yield* Fly.Secret('SessionSecret', {
      app: site,
      name: 'SESSION_SECRET',
      value: yield* Config.redacted('SESSION_SECRET'),
    })
    yield* Fly.Secret('BucketName', {
      app: site,
      name: 'BUCKET_NAME',
      value: artifacts.bucketName.pipe(required('bucketName')),
    })
    yield* Fly.Secret('BucketEndpoint', {
      app: site,
      name: 'AWS_ENDPOINT_URL_S3',
      value: artifacts.endpoint.pipe(required('endpoint')),
    })
    yield* Fly.Secret('BucketAccessKey', {
      app: site,
      name: 'AWS_ACCESS_KEY_ID',
      value: artifacts.accessKeyId.pipe(required('accessKeyId')),
    })
    yield* Fly.Secret('BucketSecretKey', {
      app: site,
      name: 'AWS_SECRET_ACCESS_KEY',
      value: artifacts.secretAccessKey.pipe(required('secretAccessKey')),
    })

    const image = yield* Docker.Image('Image', {
      name: `registry.fly.io/${APP_NAME}`,
      build: { context: '../..', platform: 'linux/amd64' },
      registry: {
        server: 'registry.fly.io',
        username: 'x',
        password: yield* Config.redacted('FLY_API_TOKEN'),
      },
    })

    const web = yield* Fly.Machine('Web', {
      app: site,
      name: 'web',
      region: REGION,
      image: image.repoDigest.pipe(required('repoDigest')),
      guest: { cpuKind: 'shared', cpus: 1, memoryMb: 512 },
      mounts: [{ path: '/data', sizeGb: 1, snapshotRetention: 30 }],
      restart: { policy: 'always' },
      services: [
        {
          protocol: 'tcp',
          internalPort: PORT,
          autostop: 'off',
          autostart: true,
          minMachinesRunning: 1,
          ports: [
            { port: 80, handlers: ['http'], forceHttps: true },
            { port: 443, handlers: ['tls', 'http'] },
          ],
        },
      ],
    })

    const ipv4 = yield* Fly.IpAssignment('V4', { app: site, type: 'shared_v4' })
    const ipv6 = yield* Fly.IpAssignment('V6', { app: site, type: 'v6' })

    return { url: web.url, ipv4: ipv4.ip, ipv6: ipv6.ip }
  }),
)
