import * as Schema from 'effect/Schema'
import * as HttpApi from 'effect/unstable/httpapi/HttpApi'
import * as HttpApiEndpoint from 'effect/unstable/httpapi/HttpApiEndpoint'
import * as HttpApiGroup from 'effect/unstable/httpapi/HttpApiGroup'
import * as HttpApiSchema from 'effect/unstable/httpapi/HttpApiSchema'

import {
  Attendee,
  Entry,
  EntryId,
  EntryNotFound,
  EntryRef,
  EntrySlug,
  EntrySummary,
  EntryType,
  EventNotFound,
  GoogleAccountId,
  MentionTarget,
  NotAnArtifact,
  ShareLinkId,
  ShareTtl,
  Tag,
  TagCount,
  VersionConflict,
  WrongPassword,
} from './domain.ts'

const NotFound = EntryNotFound.pipe(HttpApiSchema.status(404))

const Conflict = VersionConflict.pipe(HttpApiSchema.status(409))

const RefParams = { ref: EntryRef }

export const SaveRequest = Schema.Struct({
  title: Schema.optionalKey(Schema.String),
  body: Schema.optionalKey(Schema.String),
  version: Schema.Int,
})

export const SaveResponse = Schema.Struct({
  version: Schema.Int,
  html: Schema.String,
})

export const Cursor = Schema.StringFromBase64Url.pipe(
  Schema.decodeTo(Schema.fromJsonString(Schema.Struct({ updatedAt: Schema.String, id: EntryId }))),
)

export const LIST_LIMIT_DEFAULT = 50
export const LIST_LIMIT_MAX = 200

export const ListQuery = {
  type: Schema.optionalKey(EntryType),
  tag: Schema.optionalKey(Tag),
  archived: Schema.optionalKey(Schema.Literals(['true', 'false'])),
  title: Schema.optionalKey(Schema.String),
  limit: Schema.optionalKey(
    Schema.FiniteFromString.check(
      Schema.isInt(),
      Schema.isBetween({ minimum: 1, maximum: LIST_LIMIT_MAX }),
    ),
  ),
  cursor: Schema.optionalKey(Cursor),
}

export const ListResponse = Schema.Struct({
  entries: Schema.Array(EntrySummary),
  cursor: Schema.NullOr(Cursor),
})

export const ShareView = Schema.Struct({
  id: ShareLinkId,
  url: Schema.String,
  expiresAt: Schema.NullOr(Schema.DateTimeUtcFromString),
})

export const EntryDetail = Schema.Struct({
  entry: Entry,
  url: Schema.NullOr(Schema.String),
  shares: Schema.Array(ShareView),
})

export const CreateRequest = Schema.Struct({
  type: Schema.Literals(['note', 'task']),
  title: Schema.optionalKey(Schema.String),
  body: Schema.optionalKey(Schema.String),
})

export const TagsRequest = Schema.Struct({ tags: Schema.Array(Tag) })

export const TagsQuery = { type: Schema.optionalKey(EntryType) }

export const AttachRequest = Schema.Struct({ eventId: Schema.String })

export const ShareRequest = Schema.Struct({ ttl: ShareTtl })

export const MeetingSlot = Schema.Struct({
  event: Schema.Struct({
    accountId: GoogleAccountId,
    id: Schema.String,
    title: Schema.String,
    start: Schema.DateTimeUtcFromString,
    end: Schema.DateTimeUtcFromString,
    attendees: Schema.Array(Attendee),
    link: Schema.NullOr(Schema.String),
  }),
  note: Schema.NullOr(EntrySlug),
})

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
})

export const RegisterRequest = Schema.Struct({
  files: Schema.Array(RegisterFile),
})

export const RegisterResponse = Schema.Struct({
  slugs: Schema.Array(EntrySlug),
  skipped: Schema.Array(Schema.String),
  rejected: Schema.Array(Schema.String),
})

export const LoginRequest = Schema.Struct({ password: Schema.String })

export const LoginResponse = Schema.Struct({ token: Schema.String })

export const ZONE_HEADER = 'x-time-zone'
export const LOGIN_PATH = '/api/auth/login'

export class AuthApi extends HttpApiGroup.make('auth')
  .add(
    HttpApiEndpoint.post('login', '/login', {
      payload: LoginRequest,
      success: LoginResponse,
      error: WrongPassword.pipe(HttpApiSchema.status(401)),
    }),
  )
  .prefix('/auth') {}

export class EntriesApi extends HttpApiGroup.make('entries')
  .add(HttpApiEndpoint.get('targets', '/targets', { success: Schema.Array(MentionTarget) }))
  .add(HttpApiEndpoint.get('list', '/', { query: ListQuery, success: ListResponse }))
  .add(HttpApiEndpoint.post('create', '/', { payload: CreateRequest, success: Entry }))
  .add(
    HttpApiEndpoint.get('get', '/:ref', {
      params: RefParams,
      success: EntryDetail,
      error: NotFound,
    }),
  )
  .add(
    HttpApiEndpoint.put('save', '/:id', {
      params: { id: EntryId },
      payload: SaveRequest,
      success: SaveResponse,
      error: [NotFound, Conflict],
    }),
  )
  .add(
    HttpApiEndpoint.put('setTags', '/:ref/tags', {
      params: RefParams,
      payload: TagsRequest,
      success: Entry,
      error: NotFound,
    }),
  )
  .add(
    HttpApiEndpoint.post('archive', '/:ref/archive', {
      params: RefParams,
      success: Entry,
      error: NotFound,
    }),
  )
  .add(
    HttpApiEndpoint.post('restore', '/:ref/restore', {
      params: RefParams,
      success: Entry,
      error: NotFound,
    }),
  )
  .add(
    HttpApiEndpoint.post('attach', '/:ref/meeting', {
      params: RefParams,
      payload: AttachRequest,
      success: Entry,
      error: [NotFound, EventNotFound.pipe(HttpApiSchema.status(404))],
    }),
  )
  .prefix('/entries') {}

export class TagsApi extends HttpApiGroup.make('tags')
  .add(HttpApiEndpoint.get('list', '/', { query: TagsQuery, success: Schema.Array(TagCount) }))
  .prefix('/tags') {}

export class MeetingsApi extends HttpApiGroup.make('meetings')
  .add(HttpApiEndpoint.get('today', '/', { success: Schema.Array(MeetingSlot) }))
  .add(HttpApiEndpoint.post('start', '/', { success: Entry }))
  .prefix('/meetings') {}

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
  .add(
    HttpApiEndpoint.post('share', '/:ref/shares', {
      params: RefParams,
      payload: ShareRequest,
      success: ShareView,
      error: [NotFound, NotAnArtifact.pipe(HttpApiSchema.status(422))],
    }),
  )
  .add(
    HttpApiEndpoint.delete('unshare', '/shares/:id', {
      params: { id: ShareLinkId },
      success: HttpApiSchema.NoContent,
    }),
  )
  .prefix('/artifacts') {}

export class Api extends HttpApi.make('dotfiles')
  .add(AuthApi)
  .add(EntriesApi)
  .add(TagsApi)
  .add(MeetingsApi)
  .add(ArtifactsApi)
  .prefix('/api') {}
