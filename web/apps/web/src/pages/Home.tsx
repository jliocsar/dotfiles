import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'

import { Icon } from '../components/Icon.tsx'
import { Layout } from '../components/Layout.tsx'
import { NAV, SECTIONS, sectionOf } from '../domain.ts'
import type { Entry } from '../domain.ts'
import { Entries } from '../services/Entries.ts'
import { parseTasks } from '../tasks.ts'
import type { Task } from '../tasks.ts'
import { Dot, GroupLabel, Page, ROW, shortDate, titleOf } from './Entries.tsx'

type EventState = 'past' | 'now' | 'future'

interface CalendarEvent {
  readonly startHours: number
  readonly endHours: number
  readonly title: string
  readonly noteHref?: string
}

interface OpenTask {
  readonly list: Entry
  readonly index: number
  readonly task: Task
}

const MOCK_CALENDAR: readonly CalendarEvent[] = [
  { startHours: 9.25, endHours: 9.5, title: 'Standup' },
  { startHours: 10, endHours: 10.5, title: 'Platform weekly', noteHref: '/e/platform-weekly' },
  { startHours: 14, endHours: 15, title: 'Design review' },
  { startHours: 16.5, endHours: 17, title: '1:1 with Ana' },
]

const RECENT_LIMIT = 5

const SLOT = [
  'relative grid h-[34px] grid-cols-[44px_8px_1fr_auto] items-center gap-x-3 -mx-2 px-2 text-[13.5px]',
  "before:absolute before:inset-y-0 before:left-[57px] before:w-px before:content-['']",
].join(' ')

const PIP = 'relative z-[1] ml-1 size-[7px] rounded-full border'

const TASK_ROW = [
  'grid h-[30px] grid-cols-[auto_1fr_auto] items-center gap-4 -mx-2 px-2 rounded-md text-[13.5px]',
  'transition-colors hover:bg-muted',
  "relative after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-border after:content-['']",
  'has-checked:[&_.title]:text-muted-foreground has-checked:[&_.title]:line-through',
].join(' ')

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
} satisfies Record<EventState, Record<'rail' | 'time' | 'pip' | 'title', string>>

const pad = (value: number) => value.toString().padStart(2, '0')

const hhmm = (hours: number) => `${pad(Math.floor(hours))}:${pad(Math.round((hours % 1) * 60))}`

const stateOf = (event: CalendarEvent, nowHours: number): EventState => {
  if (event.endHours <= nowHours) {
    return 'past'
  }

  return event.startHours <= nowHours ? 'now' : 'future'
}

const untilText = (event: CalendarEvent, nowHours: number) => {
  const hours = event.startHours - nowHours

  return hours >= 1 ? `in ${Math.floor(hours)}h` : `in ${Math.round(hours * 60)}m`
}

const SlotAction = (props: {
  readonly event: CalendarEvent
  readonly state: EventState
  readonly now: number
}) => {
  if (props.event.noteHref !== undefined) {
    return (
      <a class="btn -mr-[9px]" data-variant="ghost" href={props.event.noteHref}>
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
      {untilText(props.event, props.now)}
    </span>
  ) : (
    <span />
  )
}

const Slot = (props: { readonly event: CalendarEvent; readonly now: number }) => {
  const state = stateOf(props.event, props.now)
  const style = SLOT_STYLE[state]

  return (
    <div class={`${SLOT} ${style.rail}`} data-state={state}>
      <span class={`font-mono text-xs tabular-nums ${style.time}`}>
        {hhmm(props.event.startHours)}
      </span>
      <span class={`${PIP} ${style.pip}`} />
      <span class={`truncate ${style.title}`}>{props.event.title}</span>
      <SlotAction event={props.event} state={state} now={props.now} />
    </div>
  )
}

const RecentRow = (props: { readonly entry: Entry; readonly currentYear: number }) => (
  <a class={ROW} href={`/e/${props.entry.slug}`} data-row>
    <span class="truncate">{titleOf(props.entry)}</span>
    <span class="flex items-center gap-2.5 text-xs text-muted-foreground tabular-nums">
      <span>{sectionOf(props.entry.type).label}</span>
      <Dot />
      <span>{shortDate(props.entry, props.currentYear)}</span>
    </span>
  </a>
)

const openTasksOf = (lists: readonly Entry[]): readonly OpenTask[] =>
  lists.flatMap((list) =>
    parseTasks(list.body)
      .map((task, index) => ({ list, index, task }))
      .filter((open) => !open.task.done),
  )

const TaskRow = (props: { readonly open: OpenTask }) => (
  <form
    method="post"
    action={`/e/${props.open.list.slug}/tasks/${props.open.index}/done`}
    class={TASK_ROW}
  >
    <input
      type="checkbox"
      class="size-3.5 cursor-pointer accent-foreground"
      aria-label={`Done: ${props.open.task.text}`}
      onchange="this.form.requestSubmit()"
    />
    <span class="title truncate">{props.open.task.text}</span>
    <a class="text-xs text-muted-foreground" href={`/e/${props.open.list.slug}`}>
      {titleOf(props.open.list)}
    </a>
  </form>
)

const Empty = (props: { readonly children: string }) => (
  <p class="h-[34px] leading-[34px] text-[13.5px] text-muted-foreground/60">{props.children}</p>
)

const SignOut = () => (
  <form method="post" action="/logout" hx-boost="false">
    <button type="submit" class="btn" data-variant="ghost">
      <Icon name="log-out" />
      Sign out
    </button>
  </form>
)

export const HomePage = Effect.fn('HomePage')(function* () {
  const entries = yield* Entries
  const recent = yield* entries.recent(RECENT_LIMIT)
  const lists = yield* entries.list('task', false)
  const open = openTasksOf(lists)
  const now = yield* DateTime.now
  const currentYear = DateTime.getPartUtc(now, 'year')
  const local = DateTime.toDate(now)
  const nowHours = local.getHours() + local.getMinutes() / 60
  const heading = local.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <Layout title="Home">
      <Page
        actions={<SignOut />}
        heading={heading}
        meta={
          <>
            <nav class="flex items-center gap-2.5" aria-label="Sections">
              {NAV.map((section, index) => (
                <>
                  {index === 0 ? null : <Dot />}
                  <a class="transition-colors hover:text-foreground" href={section.path}>
                    {section.label}
                  </a>
                </>
              ))}
            </nav>
            <span class="ml-auto flex items-center gap-1.5">
              <kbd class="kbd rounded-sm">ctrl k</kbd>
              jump anywhere
            </span>
          </>
        }
      >
        <div class="grid grid-cols-1 items-start gap-x-10 sm:grid-cols-2">
          <section>
            <GroupLabel>Calendar</GroupLabel>
            {MOCK_CALENDAR.length === 0 ? <Empty>Nothing on the calendar</Empty> : null}
            {MOCK_CALENDAR.map((event) => (
              <Slot event={event} now={nowHours} />
            ))}
            <GroupLabel>Recent</GroupLabel>
            {recent.length === 0 ? <Empty>Nothing yet</Empty> : null}
            {recent.map((entry) => (
              <RecentRow entry={entry} currentYear={currentYear} />
            ))}
          </section>
          <section>
            <GroupLabel>
              <span>Open tasks</span>
              <a
                class="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                href={SECTIONS.task.path}
              >
                All {lists.length} list{lists.length === 1 ? '' : 's'}
                <Icon name="arrow-up-right" class="size-[11px]" />
              </a>
            </GroupLabel>
            {open.length === 0 ? <Empty>All done</Empty> : null}
            {open.map((task) => (
              <TaskRow open={task} />
            ))}
          </section>
        </div>
      </Page>
    </Layout>
  )
})
