import * as Schema from 'effect/Schema'
import * as HttpApi from 'effect/unstable/httpapi/HttpApi'
import * as HttpApiEndpoint from 'effect/unstable/httpapi/HttpApiEndpoint'
import * as HttpApiGroup from 'effect/unstable/httpapi/HttpApiGroup'
import * as HttpApiSchema from 'effect/unstable/httpapi/HttpApiSchema'

import { EntryId, EntryNotFound, EntrySlug, MentionTarget, VersionConflict } from './domain.ts'

export const SaveRequest = Schema.Struct({
  title: Schema.String,
  body: Schema.String,
  version: Schema.Int,
})

export const SaveResponse = Schema.Struct({
  version: Schema.Int,
  html: Schema.String,
})

// A batch is one request each way; a title an artifact already has comes back in `skipped`.
export const PresignRequest = Schema.Struct({
  titles: Schema.Array(Schema.String),
})

export const PresignTarget = Schema.Struct({
  title: Schema.String,
  key: Schema.String,
  url: Schema.String,
})

export const PresignResponse = Schema.Struct({
  targets: Schema.Array(PresignTarget),
  skipped: Schema.Array(Schema.String),
})

export const RegisterFile = Schema.Struct({
  key: Schema.String,
  title: Schema.String,
  mime: Schema.String,
  bytes: Schema.Int,
})

export const RegisterRequest = Schema.Struct({
  files: Schema.Array(RegisterFile),
})

export const RegisterResponse = Schema.Struct({
  slugs: Schema.Array(EntrySlug),
  skipped: Schema.Array(Schema.String),
})

export class EntriesApi extends HttpApiGroup.make('entries')
  .add(HttpApiEndpoint.get('targets', '/targets', { success: Schema.Array(MentionTarget) }))
  .add(
    HttpApiEndpoint.put('save', '/:id', {
      params: { id: EntryId },
      payload: SaveRequest,
      success: SaveResponse,
      error: [
        EntryNotFound.pipe(HttpApiSchema.status(404)),
        VersionConflict.pipe(HttpApiSchema.status(409)),
      ],
    }),
  )
  .prefix('/entries') {}

export class ArtifactsApi extends HttpApiGroup.make('artifacts')
  .add(
    HttpApiEndpoint.post('presign', '/presign', {
      payload: PresignRequest,
      success: PresignResponse,
    }),
  )
  .add(
    HttpApiEndpoint.post('register', '/register', {
      payload: RegisterRequest,
      success: RegisterResponse,
    }),
  )
  .prefix('/artifacts') {}

export class Api extends HttpApi.make('dotfiles')
  .add(EntriesApi)
  .add(ArtifactsApi)
  .prefix('/api') {}
