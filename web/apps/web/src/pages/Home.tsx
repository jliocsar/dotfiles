import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'

import { Icon } from '../components/Icon.tsx'
import { Layout } from '../components/Layout.tsx'
import { NAV, SECTIONS, sectionOf } from '../domain.ts'
import type { Entry } from '../domain.ts'
import { Calendar } from '../services/Calendar.ts'
import { Entries } from '../services/Entries.ts'
import { parseTasks } from '../tasks.ts'
import type { Task } from '../tasks.ts'
import { AccountsBlock, Empty, TodayPlaceholder } from './Calendar.tsx'
import { Dot, GroupLabel, Page, ROW, shortDate, titleOf } from './Entries.tsx'

interface OpenTask {
  readonly list: Entry
  readonly index: number
  readonly task: Task
}

const RECENT_LIMIT = 5

const TASK_ROW = [
  'grid h-[30px] grid-cols-[auto_1fr_auto] items-center gap-4 -mx-2 px-2 rounded-md text-[13.5px]',
  'transition-colors hover:bg-muted',
  "relative after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-border after:content-['']",
  'has-checked:[&_.title]:text-muted-foreground has-checked:[&_.title]:line-through',
].join(' ')

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

const SignOut = () => (
  <form method="post" action="/logout" hx-boost="false" data-sign-out>
    <button type="submit" class="btn" data-variant="ghost" data-size="icon" aria-label="Sign out">
      <Icon name="log-out" />
    </button>
  </form>
)

export const HomePage = Effect.fn('HomePage')(function* (props: {
  readonly zone: DateTime.TimeZone
}) {
  const entries = yield* Entries
  const calendar = yield* Calendar
  const recent = yield* entries.recent(RECENT_LIMIT)
  const lists = yield* entries.list('task', false, undefined)
  const accounts = yield* calendar.accounts
  const open = openTasksOf(lists)
  const now = yield* DateTime.now
  const currentYear = DateTime.getPartUtc(now, 'year')
  const zonedNow = DateTime.setZone(now, props.zone)
  const heading = DateTime.format(zonedNow, {
    locale: 'en',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <Layout title="Home">
      <Page
        crumbs={
          <nav
            class="flex h-7 items-center gap-2 text-xs font-medium whitespace-nowrap text-muted-foreground sm:gap-2.5"
            aria-label="Sections"
          >
            {NAV.map((section, index) => (
              <>
                {index === 0 ? null : <Dot />}
                <a
                  class="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                  href={section.path}
                >
                  <Icon
                    name={section.type}
                    class={`hidden shrink-0 sm:block ${section.type === 'artifact' ? 'size-3.5' : 'size-4'}`}
                  />
                  {section.label}
                </a>
              </>
            ))}
          </nav>
        }
        actions={<SignOut />}
        heading={heading}
        meta={
          <button
            type="button"
            class="flex items-center gap-1.5 transition-colors hover:text-foreground"
            data-search
          >
            <kbd class="kbd rounded-sm">ctrl k</kbd>
            <Icon name="search" class="hidden size-3.5 pointer-coarse:block" />
            jump anywhere
          </button>
        }
      >
        <div class="grid grid-cols-1 items-start gap-x-10 sm:grid-cols-2">
          <section>
            <GroupLabel>Calendar</GroupLabel>
            <TodayPlaceholder day={DateTime.formatIsoDate(zonedNow)} />
            <GroupLabel>Recent</GroupLabel>
            {recent.length === 0 ? <Empty>Nothing yet</Empty> : null}
            {recent.map((entry) => (
              <RecentRow entry={entry} currentYear={currentYear} />
            ))}
          </section>
          <section class="mt-[22px] sm:mt-0">
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
            <GroupLabel>Google</GroupLabel>
            <AccountsBlock accounts={accounts} />
          </section>
        </div>
      </Page>
    </Layout>
  )
})
