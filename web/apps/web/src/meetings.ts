import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import { snapshotEvent } from './domain.ts'
import type { CalendarEvent, Entry, EntryId } from './domain.ts'
import { Calendar } from './services/Calendar.ts'
import { Entries } from './services/Entries.ts'

/** A calendar event paired with the live meeting note created from it, if any. */
export interface Slot {
  readonly event: CalendarEvent
  readonly note: Entry | undefined
}

// §3.2: an event counts as "now" if it overlaps [now - grace, now + grace].
const GRACE = '10 minutes'

const millis = DateTime.toEpochMillis

const closestTo = (now: DateTime.Utc) => (left: CalendarEvent, right: CalendarEvent) =>
  Math.abs(millis(left.start) - millis(now)) - Math.abs(millis(right.start) - millis(now))

/** Today's events in the user's zone, each with its note when one exists (§3.3). */
export const todaysSlots = Effect.fn('todaysSlots')(function* (zone: DateTime.TimeZone) {
  const calendar = yield* Calendar
  const entries = yield* Entries
  const today = DateTime.setZone(yield* DateTime.now, zone)
  const events = yield* calendar.events(
    DateTime.toUtc(DateTime.startOf(today, 'day')),
    DateTime.toUtc(DateTime.endOf(today, 'day')),
  )
  const notes = yield* entries.byEventIds(events.map((event) => event.id))

  return events.map((event): Slot => ({ event, note: notes.get(event.id) }))
})

/**
 * §3.2. Opens the note for the meeting happening right now, creating it on
 * first click; falls back to a timestamp-titled meeting note.
 */
export const newMeetingNote = Effect.fn('newMeetingNote')(function* (zone: DateTime.TimeZone) {
  const calendar = yield* Calendar
  const entries = yield* Entries
  const now = yield* DateTime.now
  const overlapping = yield* calendar.events(
    DateTime.subtractDuration(now, GRACE),
    DateTime.addDuration(now, GRACE),
  )
  const event = overlapping.toSorted(closestTo(now)).at(0)

  if (event === undefined) {
    return yield* entries.create({
      type: 'meeting',
      title: Option.none(),
      zone,
      meeting: { accountId: null, start: now, attendees: [] },
    })
  }

  const existing = (yield* entries.byEventIds([event.id])).get(event.id)

  if (existing !== undefined) {
    return existing
  }

  return yield* entries.create({
    type: 'meeting',
    title: Option.some(event.title),
    zone,
    meeting: snapshotEvent(event),
  })
})

/** §3.3. Picks one of today's events for an existing note. Unknown ids are a no-op. */
export const attachMeeting = Effect.fn('attachMeeting')(function* (
  id: EntryId,
  eventId: string,
  zone: DateTime.TimeZone,
) {
  const entries = yield* Entries
  const slots = yield* todaysSlots(zone)
  const picked = slots.find((slot) => slot.event.id === eventId)

  if (picked === undefined) {
    return Option.none<Entry>()
  }

  return Option.some(
    yield* entries.setMeeting({
      id,
      title: picked.event.title,
      meeting: snapshotEvent(picked.event),
    }),
  )
})
