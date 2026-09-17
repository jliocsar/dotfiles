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

export const PresignResponse = Schema.Struct({
  key: Schema.String,
  url: Schema.String,
})

export const RegisterRequest = Schema.Struct({
  key: Schema.String,
  title: Schema.String,
  mime: Schema.String,
  bytes: Schema.Int,
})

export const RegisterResponse = Schema.Struct({
  slug: EntrySlug,
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
  .add(HttpApiEndpoint.post('presign', '/presign', { success: PresignResponse }))
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
