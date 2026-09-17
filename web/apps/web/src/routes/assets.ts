import * as Layer from 'effect/Layer'
import * as HttpStaticServer from 'effect/unstable/http/HttpStaticServer'

const IMMUTABLE = 'public, max-age=31536000, immutable'

const REVALIDATE = 'no-cache'

export const AssetRoutes = Layer.mergeAll(
  HttpStaticServer.layer({
    root: 'public',
    prefix: '/assets',
    cacheControl: REVALIDATE,
    mimeTypes: { webmanifest: 'application/manifest+json' },
  }),
  HttpStaticServer.layer({
    root: 'node_modules/basecoat-css/dist/js',
    prefix: '/vendor/basecoat',
    cacheControl: IMMUTABLE,
  }),
  HttpStaticServer.layer({
    root: 'node_modules/htmx.org/dist',
    prefix: '/vendor/htmx',
    cacheControl: IMMUTABLE,
  }),
)
