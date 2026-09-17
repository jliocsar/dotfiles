import * as Duration from 'effect/Duration'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

export type EntryType = typeof EntryType.Type

export type EntryId = typeof EntryId.Type

export type EntrySlug = typeof EntrySlug.Type

export type Entry = typeof Entry.Type

export type MentionTarget = typeof MentionTarget.Type

export type ShareLinkId = typeof ShareLinkId.Type

export type ShareToken = typeof ShareToken.Type

export type ShareTtl = typeof ShareTtl.Type

export type ShareLink = typeof ShareLink.Type

export interface Section {
  readonly type: EntryType
  readonly path: `/${string}`
  readonly label: string
  readonly noun: string
}

export const EntryType = Schema.Literals(['note', 'meeting', 'task', 'artifact'])

export const EntryId = Schema.String.pipe(Schema.brand('EntryId'))

export const entryId = Schema.decodeSync(EntryId)

export const EntrySlug = Schema.String.pipe(Schema.brand('EntrySlug'))

export const entrySlug = Schema.decodeSync(EntrySlug)

export const Entry = Schema.Struct({
  id: EntryId,
  type: EntryType,
  slug: EntrySlug,
  title: Schema.String,
  body: Schema.String,
  objectKey: Schema.NullOr(Schema.String),
  mime: Schema.NullOr(Schema.String),
  bytes: Schema.NullOr(Schema.Int),
  version: Schema.Int,
  updatedAt: Schema.DateTimeUtcFromString,
}).pipe(Schema.encodeKeys({ updatedAt: 'updated_at', objectKey: 'object_key' }))

export const MentionTarget = Schema.Struct({
  id: EntryId,
  slug: EntrySlug,
  title: Schema.String,
  type: EntryType,
  updatedAt: Schema.DateTimeUtcFromString,
}).pipe(Schema.encodeKeys({ updatedAt: 'updated_at' }))

export class EntryNotFound extends Schema.TaggedError<EntryNotFound>()('EntryNotFound', {
  ref: Schema.Union([EntryId, EntrySlug]),
}) {}

export class VersionConflict extends Schema.TaggedError<VersionConflict>()('VersionConflict', {
  entry: Entry,
}) {}

export const ShareLinkId = Schema.String.pipe(Schema.brand('ShareLinkId'))

export const shareLinkId = Schema.decodeSync(ShareLinkId)

export const ShareToken = Schema.String.pipe(Schema.brand('ShareToken'))

export const shareToken = Schema.decodeSync(ShareToken)

export const ShareTtl = Schema.Literals(['1h', '1d', '7d', 'never'])

export const DEFAULT_SHARE_TTL: ShareTtl = '7d'

export const ShareLink = Schema.Struct({
  id: ShareLinkId,
  entryId: EntryId,
  token: ShareToken,
  expiresAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  revokedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  createdAt: Schema.DateTimeUtcFromString,
}).pipe(
  Schema.encodeKeys({
    entryId: 'entry_id',
    expiresAt: 'expires_at',
    revokedAt: 'revoked_at',
    createdAt: 'created_at',
  }),
)

export class ShareNotFound extends Schema.TaggedError<ShareNotFound>()('ShareNotFound', {
  token: ShareToken,
}) {}

const SHARE_TTL_DURATIONS = {
  '1h': Option.some(Duration.hours(1)),
  '1d': Option.some(Duration.days(1)),
  '7d': Option.some(Duration.days(7)),
  never: Option.none(),
} satisfies Record<ShareTtl, Option.Option<Duration.Duration>>

export const SHARE_TTL_SHORT = {
  '1h': '1h',
  '1d': '1d',
  '7d': '7d',
  never: '∞',
} satisfies Record<ShareTtl, string>

export const shareTtlDuration = (ttl: ShareTtl) => SHARE_TTL_DURATIONS[ttl]

export const SECTIONS = {
  note: { type: 'note', path: '/notes', label: 'Notes', noun: 'note' },
  meeting: { type: 'meeting', path: '/meetings', label: 'Meeting Notes', noun: 'meeting note' },
  task: { type: 'task', path: '/tasks', label: 'Tasks', noun: 'task' },
  artifact: { type: 'artifact', path: '/artifacts', label: 'Artifacts', noun: 'artifact' },
} satisfies Record<EntryType, Section>

export const NAV: readonly Section[] = [
  SECTIONS.note,
  SECTIONS.meeting,
  SECTIONS.task,
  SECTIONS.artifact,
]

export const sectionOf = (type: EntryType): Section => SECTIONS[type]
