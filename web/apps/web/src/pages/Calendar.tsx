import { raw } from '@dotfiles/jsx'
import type { Node } from '@dotfiles/jsx'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'

import { Icon } from '../components/Icon.tsx'
import { SECTIONS } from '../domain.ts'
import type { Entry, GoogleAccount } from '../domain.ts'
import { todaysSlots } from '../meetings.ts'
import type { Slot } from '../meetings.ts'
import { Calendar } from '../services/Calendar.ts'
import { clock } from '../zone.ts'

type SlotState = 'past' | 'now' | 'future'

const SLOT = [
  'relative grid h-[34px] grid-cols-[44px_8px_1fr_auto] items-center gap-x-3 -mx-2 px-2 text-[13.5px]',
  "before:absolute before:inset-y-0 before:left-[57px] before:w-px before:content-['']",
].join(' ')

const PIP = 'relative z-[1] ml-1 size-[7px] rounded-full border'

const SLOT_STYLE = {
  past: {
    rail: 'before:bg-foreground',
    time: 'text-muted-foreground',
    pip: 'border-muted-foreground/40 bg-background',
    title: 'text-muted-foreground',
  },
  now: {
    rail: 'before:bg-foreground',
    time: 'text-foreground',
    pip: 'border-foreground bg-foreground',
    title: '',
  },
  future: {
    rail: 'before:bg-border',
    time: 'text-muted-foreground',
    pip: 'border-foreground bg-foreground',
    title: '',
  },
} satisfies Record<SlotState, Record<'rail' | 'time' | 'pip' | 'title', string>>

const PICK_ROW = [
  'grid h-8 w-full grid-cols-[40px_1fr_auto] items-center gap-2 rounded-md px-2 text-left text-[13px]',
  'transition-colors hover:bg-muted aria-pressed:text-muted-foreground',
].join(' ')

const ACCOUNT_ROW =
  'grid h-[34px] grid-cols-[1fr_auto] items-center gap-4 -mx-2 px-2 text-[13.5px] text-muted-foreground'

const millis = DateTime.toEpochMillis

const stateOf = (slot: Slot, now: DateTime.Utc): SlotState => {
  if (millis(slot.event.end) <= millis(now)) {
    return 'past'
  }

  return millis(slot.event.start) <= millis(now) ? 'now' : 'future'
}

const untilText = (slot: Slot, now: DateTime.Utc) => {
  const minutes = Math.round((millis(slot.event.start) - millis(now)) / 60_000)

  return minutes >= 60 ? `in ${Math.floor(minutes / 60)}h` : `in ${minutes}m`
}

export const Empty = (props: { readonly children: Node }) => (
  <p class="h-[34px] leading-[34px] text-[13.5px] text-muted-foreground/60">{props.children}</p>
)

const SlotAction = (props: {
  readonly slot: Slot
  readonly state: SlotState
  readonly now: DateTime.Utc
}) => {
  if (props.slot.note !== undefined) {
    return (
      <a class="btn -mr-[9px]" data-variant="ghost" href={`/e/${props.slot.note.slug}`}>
        Open note
      </a>
    )
  }

  if (props.state === 'now') {
    return (
      <form method="post" action={SECTIONS.meeting.path}>
        <button type="submit" class="btn -mr-[9px]" data-variant="ghost">
          <Icon name="plus" />
          New note
        </button>
      </form>
    )
  }

  return props.state === 'future' ? (
    <span class="text-xs text-muted-foreground/60 tabular-nums">
      {untilText(props.slot, props.now)}
    </span>
  ) : (
    <span />
  )
}

const SlotRow = (props: {
  readonly slot: Slot
  readonly now: DateTime.Utc
  readonly zone: DateTime.TimeZone
}) => {
  const state = stateOf(props.slot, props.now)
  const style = SLOT_STYLE[state]

  return (
    <div class={`${SLOT} ${style.rail}`} data-state={state}>
      <span class={`font-mono text-xs tabular-nums ${style.time}`}>
        {clock(props.slot.event.start, props.zone)}
      </span>
      <span class={`${PIP} ${style.pip}`} />
      <span class={`truncate ${style.title}`}>{props.slot.event.title}</span>
      <SlotAction slot={props.slot} state={state} now={props.now} />
    </div>
  )
}

/** Home's calendar column. Fetched with htmx after the page paints so Google's latency never blocks Home. */
export const TodayFragment = Effect.fn('TodayFragment')(function* (props: {
  readonly zone: DateTime.TimeZone
}) {
  const calendar = yield* Calendar
  const accounts = yield* calendar.accounts

  if (accounts.length === 0) {
    return (
      <Empty>
        <a
          class="underline underline-offset-[3px] hover:text-foreground"
          href="/oauth/google"
          hx-boost="false"
        >
          Connect a Google account
        </a>{' '}
        to see today here
      </Empty>
    )
  }

  const slots = yield* todaysSlots(props.zone)
  const now = yield* DateTime.now

  return (
    <>
      {slots.length === 0 ? <Empty>Nothing on the calendar</Empty> : null}
      {slots.map((slot) => (
        <SlotRow slot={slot} now={now} zone={props.zone} />
      ))}
    </>
  )
})

const CALENDAR_CACHE_KEY = 'calendar:today'

/** Drops the cached calendar so event titles don't outlive the session. */
export const CLEAR_CALENDAR_CACHE = `localStorage.removeItem('${CALENDAR_CACHE_KEY}')`

// Stale-while-revalidate: paint today's last fetched calendar right away,
// then htmx's load request swaps fresh HTML over it and refreshes the cache.
const TODAY_CACHE_BOOT = `(() => {
  const calendar = document.currentScript.previousElementSibling
  const today = new Date().toDateString()
  const cached = JSON.parse(localStorage.getItem('${CALENDAR_CACHE_KEY}'))
  if (cached?.day === today) calendar.innerHTML = cached.html
  calendar.addEventListener('htmx:afterSwap', () => {
    localStorage.setItem('${CALENDAR_CACHE_KEY}', JSON.stringify({ day: today, html: calendar.innerHTML }))
  })
})()`

export const TodayPlaceholder = () => (
  <>
    <div hx-get="/calendar/today" hx-trigger="load" hx-swap="innerHTML">
      <Empty>Loading calendar…</Empty>
    </div>
    <script>{raw(TODAY_CACHE_BOOT)}</script>
  </>
)

/** The §3.3 picker: today's events, click one to retitle and re-snapshot the note. */
export const MeetingPicker = Effect.fn('MeetingPicker')(function* (props: {
  readonly entry: Entry
  readonly zone: DateTime.TimeZone
}) {
  const calendar = yield* Calendar
  const accounts = yield* calendar.accounts

  if (accounts.length === 0) {
    return (
      <p class="px-2 py-2.5 text-xs text-muted-foreground/60">
        <a class="underline underline-offset-[3px]" href="/oauth/google" hx-boost="false">
          Connect a Google account
        </a>{' '}
        to pick from today's meetings.
      </p>
    )
  }

  const slots = yield* todaysSlots(props.zone)

  if (slots.length === 0) {
    return (
      <p class="px-2 py-2.5 text-xs text-muted-foreground/60">Nothing on the calendar today.</p>
    )
  }

  return (
    <form method="post" action={`/e/${props.entry.slug}/meeting`} class="flex flex-col">
      {slots.map((slot) => (
        <button
          type="submit"
          name="eventId"
          value={slot.event.id}
          class={PICK_ROW}
          aria-pressed={String(props.entry.meeting?.eventId === slot.event.id)}
        >
          <span class="font-mono text-xs text-muted-foreground tabular-nums">
            {clock(slot.event.start, props.zone)}
          </span>
          <span class="truncate text-foreground">{slot.event.title}</span>
          {slot.note === undefined || slot.note.id === props.entry.id ? null : (
            <span class="text-[11px] text-muted-foreground/60">has a note</span>
          )}
        </button>
      ))}
    </form>
  )
})

export const AccountsBlock = (props: { readonly accounts: readonly GoogleAccount[] }) => (
  <>
    {props.accounts.map((account) => (
      <div class={ACCOUNT_ROW}>
        <span class="truncate">{account.email}</span>
        <form method="post" action={`/google/${account.id}/disconnect`}>
          <button
            type="submit"
            class="btn -mr-[9px] size-7"
            data-variant="ghost"
            data-size="icon"
            aria-label={`Disconnect ${account.email}`}
          >
            <Icon name="x" />
          </button>
        </form>
      </div>
    ))}
    <a
      class="btn mt-2 border-transparent"
      data-variant="outline"
      href="/oauth/google"
      hx-boost="false"
    >
      <Icon name="plus" />
      Connect {props.accounts.length === 0 ? 'a' : 'another'} Google account
    </a>
  </>
)
