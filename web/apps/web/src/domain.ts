import * as DateTime from 'effect/DateTime'
import * as Duration from 'effect/Duration'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as SchemaGetter from 'effect/SchemaGetter'

export type EntryType = typeof EntryType.Type

export type EntryId = typeof EntryId.Type

export type EntrySlug = typeof EntrySlug.Type

export type Entry = typeof Entry.Type

export type MentionTarget = typeof MentionTarget.Type

export type Tag = typeof Tag.Type

export type TagCount = typeof TagCount.Type

export type ShareLinkId = typeof ShareLinkId.Type

export type ShareToken = typeof ShareToken.Type

export type ShareTtl = typeof ShareTtl.Type

export type ShareLink = typeof ShareLink.Type

export type GoogleAccountId = typeof GoogleAccountId.Type

export type GoogleAccount = typeof GoogleAccount.Type

export type Attendee = typeof Attendee.Type

export type MeetingRef = typeof MeetingRef.Type

/** One calendar event, already normalised from whatever Google returned. */
export interface CalendarEvent {
  readonly accountId: GoogleAccountId
  readonly id: string
  readonly title: string
  readonly start: DateTime.Utc
  readonly end: DateTime.Utc
  readonly attendees: readonly Attendee[]
  readonly link: string | undefined
}

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

export const GoogleAccountId = Schema.String.pipe(Schema.brand('GoogleAccountId'))

export const googleAccountId = Schema.decodeSync(GoogleAccountId)

export const TAG_PATTERN = /^[a-z0-9-]{1,32}$/u

export const Tag = Schema.String.check(Schema.isPattern(TAG_PATTERN)).pipe(Schema.brand('Tag'))

/** What the user typed, folded into a tag when it can be: trim, lowercase, spaces to dashes. */
export const normaliseTag = (raw: string): Option.Option<Tag> =>
  Schema.decodeOption(Tag)(raw.trim().toLowerCase().replaceAll(/\s+/gu, '-'))

/** Space-joined in the row (a `group_concat` column), sorted, never empty strings. */
const TagList = Schema.NullOr(Schema.String).pipe(
  Schema.decodeTo(Schema.Array(Tag), {
    decode: SchemaGetter.transform((joined: string | null) =>
      joined === null ? [] : joined.split(' '),
    ),
    encode: SchemaGetter.transform((tags: readonly string[]) =>
      tags.length === 0 ? null : tags.join(' '),
    ),
  }),
)

export const TagCount = Schema.Struct({ tag: Tag, count: Schema.Int })

export const Attendee = Schema.Struct({
  email: Schema.String,
  name: Schema.optionalKey(Schema.String),
})

// Snapshotted from the calendar once, never re-synced (§1 MeetingRef).
export const MeetingRef = Schema.Struct({
  accountId: Schema.NullOr(GoogleAccountId),
  eventId: Schema.optionalKey(Schema.String),
  start: Schema.DateTimeUtcFromString,
  end: Schema.optionalKey(Schema.DateTimeUtcFromString),
  attendees: Schema.Array(Attendee),
  link: Schema.optionalKey(Schema.String),
})

export const entryFields = {
  id: EntryId,
  type: EntryType,
  slug: EntrySlug,
  title: Schema.String,
  body: Schema.String,
  meeting: Schema.NullOr(Schema.fromJsonString(MeetingRef)),
  objectKey: Schema.NullOr(Schema.String),
  mime: Schema.NullOr(Schema.String),
  bytes: Schema.NullOr(Schema.Int),
  version: Schema.Int,
  updatedAt: Schema.DateTimeUtcFromString,
  tags: TagList,
}

export const ENTRY_KEYS = {
  updatedAt: 'updated_at',
  objectKey: 'object_key',
} as const

export const Entry = Schema.Struct(entryFields).pipe(Schema.encodeKeys(ENTRY_KEYS))

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

export const googleAccountFields = {
  id: GoogleAccountId,
  email: Schema.String,
  calendarIds: Schema.fromJsonString(Schema.Array(Schema.String)),
  refreshToken: Schema.String,
  createdAt: Schema.DateTimeUtcFromString,
}

export const GOOGLE_ACCOUNT_KEYS = {
  calendarIds: 'calendar_ids',
  refreshToken: 'refresh_token',
  createdAt: 'created_at',
} as const

export const GoogleAccount = Schema.Struct(googleAccountFields).pipe(
  Schema.encodeKeys(GOOGLE_ACCOUNT_KEYS),
)

export const snapshotEvent = (event: CalendarEvent): MeetingRef => ({
  accountId: event.accountId,
  eventId: event.id,
  start: event.start,
  end: event.end,
  attendees: event.attendees,
  ...(event.link === undefined ? {} : { link: event.link }),
})

const pad = (value: number) => value.toString().padStart(2, '0')

/** Default title for a fresh entry: the wall-clock time in the user's zone. */
export const timestampTitle = (now: DateTime.Utc, zone: DateTime.TimeZone) => {
  const parts = DateTime.toParts(DateTime.setZone(now, zone))

  return (
    `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ` +
    `${pad(parts.hour)}:${pad(parts.minute)}`
  )
}

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
  meeting: {
    type: 'meeting',
    path: '/meetings',
    label: 'Meeting Notes',
    noun: 'meeting note',
  },
  task: { type: 'task', path: '/tasks', label: 'Tasks', noun: 'task' },
  artifact: {
    type: 'artifact',
    path: '/artifacts',
    label: 'Artifacts',
    noun: 'artifact',
  },
} satisfies Record<EntryType, Section>

export const NAV: readonly Section[] = [
  SECTIONS.note,
  SECTIONS.meeting,
  SECTIONS.task,
  SECTIONS.artifact,
]

export const sectionOf = (type: EntryType): Section => SECTIONS[type]
