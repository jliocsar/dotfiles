import { raw } from '@dotfiles/jsx'
import type { Node, Raw } from '@dotfiles/jsx'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import { Icon } from '../components/Icon.tsx'
import { Layout, ThemeToggle } from '../components/Layout.tsx'
import { UploadDialog } from '../components/UploadDialog.tsx'
import { Entries } from '../services/Entries.ts'
import { Markdown } from '../services/Markdown.ts'
import { DEFAULT_SHARE_TTL, SHARE_TTL_SHORT, sectionOf, ShareTtl } from '../domain.ts'
import type { Entry, EntrySlug, MeetingRef, Section, ShareLink, Tag, TagCount } from '../domain.ts'
import { ShareLinks } from '../services/ShareLinks.ts'
import { artifactFile, formatBytes, previewOf } from '../artifacts.ts'
import type { ArtifactFile, Preview } from '../artifacts.ts'
import { hueOf } from '../tags.ts'
import { parseTasks, taskProgress } from '../tasks.ts'
import type { Task } from '../tasks.ts'
import { clock } from '../zone.ts'

interface Back {
  readonly href: string
  readonly label: string
}

const PROSE = [
  'prose prose-sm max-w-none font-mono',
  'prose-headings:font-serif prose-headings:font-medium',
  'prose-a:underline-offset-[3px] prose-code:font-normal prose-code:rounded-sm prose-pre:rounded-md',
  'prose-code:before:content-none prose-code:after:content-none',
  'prose-blockquote:font-normal prose-blockquote:not-italic',
  '[&_blockquote_p]:before:content-none [&_blockquote_p]:after:content-none',
  '[--tw-prose-body:var(--foreground)] [--tw-prose-headings:var(--foreground)]',
  '[--tw-prose-bold:var(--foreground)] [--tw-prose-links:var(--foreground)]',
  '[--tw-prose-code:var(--foreground)] [--tw-prose-pre-code:var(--foreground)]',
  '[--tw-prose-pre-bg:var(--muted)] [--tw-prose-hr:var(--border)]',
  '[--tw-prose-quotes:var(--muted-foreground)] [--tw-prose-quote-borders:var(--border)]',
  '[--tw-prose-bullets:var(--muted-foreground)] [--tw-prose-counters:var(--muted-foreground)]',
  '[--tw-prose-th-borders:var(--border)] [--tw-prose-td-borders:var(--border)]',
].join(' ')

const DIVIDER =
  "relative after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-border after:content-['']"

export const ROW = [
  'grid h-[34px] grid-cols-[1fr_auto] items-center gap-4 -mx-2 px-2 rounded-md text-[13.5px]',
  DIVIDER,
  'transition-colors hover:bg-muted active:bg-muted',
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
].join(' ')

const ARCHIVED_ROW = [
  'grid h-[34px] grid-cols-[1fr_auto_auto] items-center gap-4 -mx-2 px-2 text-[13.5px] text-muted-foreground',
  DIVIDER,
].join(' ')

const ROW_ACTION = 'btn -ml-2 aria-pressed:bg-muted aria-pressed:text-foreground'

const TASK_ITEM = 'group flex h-7 items-center gap-2.5'

const TASK_CHECK = 'size-3.5 shrink-0 cursor-pointer accent-foreground'

const TASK_TEXT = [
  'h-7 w-full bg-transparent outline-none placeholder:text-muted-foreground/60',
  'group-has-[:checked]:text-muted-foreground group-has-[:checked]:line-through',
].join(' ')

const TITLE_INPUT = 'w-full bg-transparent outline-none placeholder:text-muted-foreground/60'

const NEW_BUTTON = 'btn ml-auto border-transparent'

const SHARE_PANEL = [
  'fixed inset-auto m-0 w-[400px] max-w-[calc(100vw-2rem)] rounded-lg border bg-background p-1 text-xs text-muted-foreground shadow-lg',
  '[position-anchor:--share] [top:calc(anchor(bottom)+6px)] [right:anchor(right)] [position-try-fallbacks:flip-inline]',
].join(' ')

const MEETING_PANEL = [
  'fixed inset-auto m-0 w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border bg-background p-1 text-xs text-muted-foreground shadow-lg',
  '[position-anchor:--meeting] [top:calc(anchor(bottom)+6px)] [right:anchor(right)] [position-try-fallbacks:flip-inline]',
].join(' ')

const SHARE_ROW =
  'grid h-8 grid-cols-[1fr_auto_auto_auto] items-center gap-1.5 rounded-md pr-1 pl-2 hover:bg-muted'

const SHARE_TTL = [
  'flex h-[22px] flex-1 cursor-pointer items-center justify-center rounded-md text-xs font-medium text-muted-foreground',
  'transition-colors has-checked:bg-background has-checked:text-foreground has-checked:shadow-[0_1px_2px_rgba(0,0,0,.08),0_0_0_1px_var(--border)]',
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
].join(' ')

const TAG_PILL = [
  'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border bg-background px-1.5',
  'text-[11.5px] leading-none font-medium whitespace-nowrap text-foreground',
].join(' ')

const TAG_DOT = 'size-1.5 shrink-0 rounded-full bg-[oklch(var(--tag-l)_var(--tag-c)_var(--h))]'

const TAG_MORE = [
  'inline-flex h-5 shrink-0 items-center rounded-full border px-1.5 text-[11.5px] leading-none font-medium',
  'text-muted-foreground tabular-nums transition-colors hover:bg-muted hover:text-foreground',
].join(' ')

const TAG_PANEL = [
  'fixed inset-auto m-0 w-[240px] rounded-lg border bg-background p-0 text-[13px] shadow-lg',
  '[position-anchor:--tags] [top:calc(anchor(bottom)+6px)] [position-try-fallbacks:flip-inline]',
].join(' ')

// `relative` keeps each row's sr-only checkbox inside the row; otherwise it's placed
// against the popover and makes the whole panel scroll on top of the list.
const TAG_ROW = [
  'group relative flex h-7 cursor-pointer items-center gap-2 rounded-md px-2',
  'hover:bg-muted aria-pressed:font-medium has-checked:font-medium',
].join(' ')

const TAG_LIST = 'flex max-h-[232px] flex-col overflow-y-auto p-1'

const TAG_COUNT = 'ml-auto pl-3 text-[11.5px] text-muted-foreground tabular-nums'

const TAG_SEARCH = 'w-full bg-transparent outline-none placeholder:text-muted-foreground'

const NO_PREVIEW =
  'flex min-h-[40vh] items-center justify-center rounded-md border border-dashed text-muted-foreground'

const BACK =
  'inline-flex h-7 items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground'

export const titleOf = (entry: Entry) => (entry.title === '' ? 'Untitled' : entry.title)

const yearIfNotCurrent = (at: DateTime.Utc, currentYear: number) =>
  DateTime.getPartUtc(at, 'year') === currentYear ? undefined : 'numeric'

const shortDateOf = (at: DateTime.Utc, currentYear: number) =>
  DateTime.format(at, {
    locale: 'en',
    month: 'short',
    day: 'numeric',
    year: yearIfNotCurrent(at, currentYear),
  })

export const shortDate = (entry: Entry, currentYear: number) =>
  shortDateOf(entry.updatedAt, currentYear)

const monthOf = (entry: Entry, currentYear: number) =>
  DateTime.format(entry.updatedAt, {
    locale: 'en',
    month: 'long',
    year: yearIfNotCurrent(entry.updatedAt, currentYear),
  })
const BackLink = (props: { readonly back: Back | undefined }) =>
  props.back === undefined ? (
    <span />
  ) : (
    <a class={BACK} href={props.back.href} data-back>
      <Icon name="arrow-left" class="size-3.5" />
      {props.back.label}
    </a>
  )

export const Page = (props: {
  readonly back?: Back
  /** Replaces the back link on the crumbs row (home has no back). */
  readonly crumbs?: Node
  readonly actions?: Node
  readonly heading: Node
  readonly meta: Node
  /** Stretch to the viewport bottom so a flex-1 child (the editor) can fill it. */
  readonly fill?: boolean
  readonly children?: Node
}) => (
  <main
    class={`mx-auto max-w-[1000px] px-4 pt-[calc(2.5rem+env(safe-area-inset-top))] sm:px-8 ${props.fill === true ? 'flex min-h-dvh flex-col pb-[calc(2.5rem+env(safe-area-inset-bottom))]' : 'pb-[calc(6rem+env(safe-area-inset-bottom))]'}`}
  >
    <div class="mb-10 flex h-7 items-center justify-between">
      {props.crumbs ?? <BackLink back={props.back} />}
      <div class="flex items-center gap-1">
        {props.actions}
        <ThemeToggle />
      </div>
    </div>
    <h1 class="mb-2.5 font-serif text-[34px] leading-[39px] font-normal tracking-[-0.01em]">
      {props.heading}
    </h1>
    <div class="mb-6 flex min-h-[42px] flex-wrap items-center gap-x-2.5 gap-y-1 border-b py-1.5 text-xs whitespace-nowrap text-muted-foreground sm:py-0">
      {props.meta}
    </div>
    {props.children}
  </main>
)

export const Dot = () => <span class="size-[3px] rounded-full bg-muted-foreground/60" />

const TagDot = (props: { readonly tag: Tag }) => (
  <i class={TAG_DOT} style={`--h:${hueOf(props.tag)}`} />
)

export const TagPill = (props: { readonly tag: Tag }) => (
  <span class={TAG_PILL} data-pill>
    <TagDot tag={props.tag} />
    {props.tag}
  </span>
)

const TagSearch = (props: { readonly placeholder: string; readonly name?: string }) => (
  <div class="flex h-[34px] items-center gap-2 border-b px-2.5">
    <Icon name="search" class="size-3.5 shrink-0 text-muted-foreground" />
    <input
      class={TAG_SEARCH}
      name={props.name}
      placeholder={props.placeholder}
      autocomplete="off"
      spellcheck="false"
      aria-label={props.placeholder}
      data-tag-search
    />
  </div>
)

const listHref = (section: Section, archived: boolean, tag: Tag | undefined) => {
  const params = new URLSearchParams()

  if (tag !== undefined) {
    params.set('tag', tag)
  }

  if (archived) {
    params.set('archived', '')
  }

  return params.size === 0 ? section.path : `${section.path}?${params}`
}

// One tag at a time (§3.7): picking the active one again clears the filter.
const TagMenu = (props: {
  readonly section: Section
  readonly archived: boolean
  readonly tags: readonly TagCount[]
  readonly active: Option.Option<Tag>
}) => (
  <>
    <button
      type="button"
      class="btn [anchor-name:--tags] aria-pressed:bg-muted aria-pressed:text-foreground"
      data-variant="ghost"
      popovertarget="tag-menu"
      aria-pressed={String(Option.isSome(props.active))}
    >
      {Option.match(props.active, {
        onNone: () => (
          <>
            <Icon name="tag" />
            Tag
          </>
        ),
        onSome: (tag) => (
          <>
            <TagDot tag={tag} />
            {tag}
          </>
        ),
      })}
      <Icon name="chevron-down" class="size-3 text-muted-foreground" />
    </button>
    <div id="tag-menu" popover class={`${TAG_PANEL} [left:anchor(left)]`} data-tag-menu>
      <TagSearch placeholder="Filter by tag…" />
      <div class={TAG_LIST}>
        {props.tags.map(({ tag, count }) => (
          <a
            class={TAG_ROW}
            href={listHref(
              props.section,
              props.archived,
              Option.contains(props.active, tag) ? undefined : tag,
            )}
            aria-pressed={String(Option.contains(props.active, tag))}
            data-tag-row
            data-tag={tag}
          >
            <TagDot tag={tag} />
            <span class="truncate">{tag}</span>
            <span class={TAG_COUNT}>{count}</span>
          </a>
        ))}
      </div>
    </div>
  </>
)

export const GroupLabel = (props: { readonly children: Node }) => (
  <div class="flex items-center justify-between pt-[22px] pb-1.5 text-[11px] leading-4 font-medium tracking-[0.08em] uppercase text-muted-foreground/60 first:pt-0">
    {props.children}
  </div>
)

const Progress = (props: { readonly entry: Entry }) => {
  const progress =
    props.entry.type === 'task' ? taskProgress(parseTasks(props.entry.body)) : undefined

  return progress === undefined || progress.total === 0 ? null : (
    <span class={progress.done === progress.total ? 'text-foreground' : undefined}>
      {progress.done}/{progress.total}
    </span>
  )
}

const Size = (props: { readonly entry: Entry }) =>
  props.entry.bytes === null ? null : <span>{formatBytes(props.entry.bytes)}</span>

const EntryRow = (props: { readonly entry: Entry; readonly currentYear: number }) => (
  <a class={ROW} href={`/e/${props.entry.slug}`} data-row>
    <span class="flex min-w-0 items-center gap-2.5">
      <span class="min-w-0 truncate">{titleOf(props.entry)}</span>
      {props.entry.tags.length === 0 ? null : (
        <span class="hidden min-w-0 items-center gap-1 overflow-hidden sm:flex">
          {props.entry.tags.map((tag) => (
            <TagPill tag={tag} />
          ))}
        </span>
      )}
    </span>
    <span class="flex items-center gap-2.5 text-xs text-muted-foreground tabular-nums">
      <Progress entry={props.entry} />
      <Size entry={props.entry} />
      <span>{shortDate(props.entry, props.currentYear)}</span>
    </span>
  </a>
)

const ArchivedRow = (props: { readonly entry: Entry; readonly currentYear: number }) => (
  <div class={ARCHIVED_ROW}>
    <span class="truncate">{titleOf(props.entry)}</span>
    <span class="text-xs tabular-nums">{shortDate(props.entry, props.currentYear)}</span>
    <span class="flex gap-1">
      <form method="post" action={`/e/${props.entry.slug}/restore`}>
        <button type="submit" class="btn" data-variant="ghost">
          <Icon name="archive-restore" />
          Unarchive
        </button>
      </form>
      <button
        type="button"
        class="btn"
        data-variant="ghost"
        command="show-modal"
        commandfor={`remove-${props.entry.id}`}
      >
        <Icon name="trash" />
        Delete
      </button>
      <dialog
        id={`remove-${props.entry.id}`}
        class="alert-dialog"
        data-size="sm"
        aria-labelledby={`remove-${props.entry.id}-title`}
      >
        <div>
          <header>
            <h2 id={`remove-${props.entry.id}-title`}>Delete "{titleOf(props.entry)}"?</h2>
            <p>This can't be undone.</p>
          </header>
          <footer>
            <button
              type="button"
              class="btn"
              data-variant="outline"
              command="close"
              commandfor={`remove-${props.entry.id}`}
            >
              Cancel
            </button>
            <form method="post" action={`/e/${props.entry.slug}/remove`}>
              <button type="submit" class="btn w-full" data-variant="destructive">
                Delete
              </button>
            </form>
          </footer>
        </div>
      </dialog>
    </span>
  </div>
)

export const MissingPage = (props: { readonly slug: string }) => (
  <Layout title="No entry">
    <Page
      back={{ href: '/', label: 'Home' }}
      heading={props.slug}
      meta={<span>Nothing links here yet</span>}
    >
      <form method="post" action={`/e/${props.slug}/create`}>
        <button type="submit" class="btn" data-variant="outline">
          <Icon name="plus" class="size-4" />
          Create a note with this slug
        </button>
      </form>
    </Page>
  </Layout>
)

export const ListPage = Effect.fn('ListPage')(function* (props: {
  readonly section: Section
  readonly archived: boolean
  readonly tag: Option.Option<Tag>
}) {
  const entries = yield* Entries
  const listed = yield* entries.list(
    props.section.type,
    props.archived,
    Option.getOrUndefined(props.tag),
  )
  const tags = yield* entries.distinctTags(props.section.type, props.archived)
  const currentYear = DateTime.getPartUtc(yield* DateTime.now, 'year')
  const groups = Arr.groupBy(listed, (entry) => monthOf(entry, currentYear))

  return (
    <Layout title={props.section.label}>
      <Page
        back={{ href: '/', label: 'Home' }}
        heading={props.section.label}
        meta={
          <>
            <a
              class={ROW_ACTION}
              data-variant="ghost"
              href={props.archived ? props.section.path : `${props.section.path}?archived`}
              aria-pressed={String(props.archived)}
            >
              <Icon name="archive" />
              Archived
            </a>
            <Dot />
            {tags.length === 0 && Option.isNone(props.tag) ? null : (
              <>
                <TagMenu
                  section={props.section}
                  archived={props.archived}
                  tags={tags}
                  active={props.tag}
                />
                <Dot />
              </>
            )}
            <span>
              {listed.length} {props.section.noun}
              {listed.length === 1 ? '' : 's'}
            </span>
            <span class="hidden items-center gap-2.5 sm:flex">
              <Dot />
              <span>Newest first</span>
            </span>
            {props.section.type === 'artifact' ? (
              <button
                type="button"
                class={NEW_BUTTON}
                data-variant="outline"
                data-new
                command="show-modal"
                commandfor="upload"
              >
                <Icon name="plus" />
                New
                <kbd class="kbd rounded-sm dark:bg-foreground/10">n</kbd>
              </button>
            ) : (
              <form class="ml-auto" method="post" action={props.section.path}>
                <button type="submit" class={NEW_BUTTON} data-variant="outline" data-new>
                  <Icon name="plus" />
                  New
                  <kbd class="kbd rounded-sm dark:bg-foreground/10">n</kbd>
                </button>
              </form>
            )}
          </>
        }
      >
        {listed.length === 0 ? (
          <GroupLabel>
            {Option.match(props.tag, {
              onNone: () => (props.archived ? 'Nothing archived' : 'Nothing yet'),
              onSome: (tag) => `Nothing tagged ${tag}`,
            })}
          </GroupLabel>
        ) : null}
        {Object.entries(groups).map(([month, grouped]) => (
          <>
            <GroupLabel>{month}</GroupLabel>
            {grouped.map((entry) =>
              props.archived ? (
                <ArchivedRow entry={entry} currentYear={currentYear} />
              ) : (
                <EntryRow entry={entry} currentYear={currentYear} />
              ),
            )}
          </>
        ))}
      </Page>
      {props.section.type === 'artifact' ? <UploadDialog /> : null}
    </Layout>
  )
})

const TaskItem = (props: { readonly task?: Task }) => (
  <li class={TASK_ITEM}>
    <input type="checkbox" class={TASK_CHECK} checked={props.task?.done === true} />
    <input
      type="text"
      class={TASK_TEXT}
      value={props.task?.text}
      placeholder="New task"
      autocomplete="off"
    />
  </li>
)

const TaskList = (props: { readonly body: string }) => (
  <>
    <ul class="relative font-mono text-sm" data-tasks>
      {parseTasks(props.body).map((task) => (
        <TaskItem task={task} />
      ))}
      <TaskItem />
    </ul>
    <template data-task-template>
      <TaskItem />
    </template>
  </>
)

const ShareRow = (props: {
  readonly entry: Entry
  readonly link: ShareLink
  readonly origin: string
  readonly currentYear: number
}) => (
  <li class={SHARE_ROW} data-share-url={`${props.origin}/s/${props.link.token}`}>
    <code
      class="truncate font-mono text-foreground"
      title={`${props.origin}/s/${props.link.token}`}
    >
      /s/{props.link.token}
    </code>
    <span class="whitespace-nowrap text-[11.5px] tabular-nums">
      {props.link.expiresAt === null
        ? 'Never expires'
        : `Expires ${shortDateOf(props.link.expiresAt, props.currentYear)}`}
    </span>
    <button type="button" class="btn h-6" data-variant="ghost" data-copy>
      <Icon name="copy" />
      <span data-copy-label>Copy</span>
    </button>
    <form method="post" action={`/e/${props.entry.slug}/share/${props.link.id}/revoke`}>
      <button
        type="submit"
        class="btn size-6"
        data-variant="ghost"
        data-size="icon"
        aria-label="Revoke link"
      >
        <Icon name="x" />
      </button>
    </form>
  </li>
)

const SharePanel = (props: {
  readonly entry: Entry
  readonly links: readonly ShareLink[]
  readonly origin: string
  readonly currentYear: number
  readonly open: boolean
}) => (
  <div id="share-panel" popover class={SHARE_PANEL} data-share-panel data-open={props.open}>
    {props.links.length === 0 ? (
      <p class="px-2 py-2.5 text-xs text-muted-foreground/60">
        No active links. Anyone with a link can open the file until it expires.
      </p>
    ) : (
      <ul class="flex flex-col">
        {props.links.map((link) => (
          <ShareRow
            entry={props.entry}
            link={link}
            origin={props.origin}
            currentYear={props.currentYear}
          />
        ))}
      </ul>
    )}
    <form
      method="post"
      action={`/e/${props.entry.slug}/share`}
      class="mt-1 flex items-center gap-2 border-t pt-1 pl-1"
    >
      <fieldset class="flex flex-1 gap-0.5 rounded-lg bg-muted p-0.5" aria-label="Expires in">
        {ShareTtl.literals.map((ttl) => (
          <label class={SHARE_TTL}>
            <input
              type="radio"
              name="ttl"
              value={ttl}
              class="sr-only"
              checked={ttl === DEFAULT_SHARE_TTL}
            />
            {SHARE_TTL_SHORT[ttl]}
          </label>
        ))}
      </fieldset>
      <button type="submit" class="btn">
        <Icon name="link" />
        New link
      </button>
    </form>
  </div>
)

const MeetingMeta = (props: { readonly meeting: MeetingRef; readonly zone: DateTime.TimeZone }) => (
  <>
    <span class="tabular-nums">
      {clock(props.meeting.start, props.zone)}
      {props.meeting.end === undefined ? '' : `–${clock(props.meeting.end, props.zone)}`}
    </span>
    <Dot />
    {props.meeting.attendees.length === 0 ? null : (
      <>
        <span title={props.meeting.attendees.map((attendee) => attendee.email).join('\n')}>
          {props.meeting.attendees.length} attendee
          {props.meeting.attendees.length === 1 ? '' : 's'}
        </span>
        <Dot />
      </>
    )}
    {props.meeting.link === undefined ? null : (
      <>
        <a
          class="inline-flex items-center gap-1 transition-colors hover:text-foreground"
          href={props.meeting.link}
          target="_blank"
          rel="noopener"
          hx-boost="false"
        >
          <Icon name="video" class="size-3.5" />
          Join
        </a>
        <Dot />
      </>
    )}
  </>
)

// The list of today's events is fetched when the panel first opens, not with the page.
const MeetingActions = (props: { readonly entry: Entry }) => (
  <>
    <button
      type="button"
      class="btn [anchor-name:--meeting]"
      data-variant="ghost"
      popovertarget="meeting-panel"
    >
      <Icon name="calendar" />
      {props.entry.meeting?.eventId === undefined ? 'Attach meeting' : 'Change meeting'}
    </button>
    <div
      id="meeting-panel"
      popover
      class={MEETING_PANEL}
      hx-get={`/e/${props.entry.slug}/meeting`}
      hx-trigger="toggle once"
      hx-swap="innerHTML"
    >
      <p class="px-2 py-2.5 text-xs text-muted-foreground/60">Loading today's meetings…</p>
    </div>
  </>
)

const ArtifactActions = (props: { readonly entry: Entry; readonly linkCount: number }) => (
  <>
    <button
      type="button"
      class="btn [anchor-name:--share]"
      data-variant="ghost"
      popovertarget="share-panel"
    >
      <Icon name="link" />
      Share
      {props.linkCount === 0 ? null : (
        <span class="inline-flex h-4 items-center rounded-full bg-muted px-1.5 text-[10.5px] tabular-nums">
          {props.linkCount}
        </span>
      )}
    </button>
    <a
      class="btn"
      data-variant="ghost"
      href={`/a/${props.entry.slug}`}
      target="_blank"
      rel="noopener"
      hx-boost="false"
    >
      <Icon name="external-link" />
      Open
    </a>
    <a class="btn" data-variant="ghost" href={`/a/${props.entry.slug}?download`} hx-boost="false">
      <Icon name="download" />
      Download
    </a>
  </>
)

// Pills fill the free width of the meta row; the client folds the overflow into `+N`.
const TagPills = (props: { readonly entry: Entry; readonly oob?: boolean }) => (
  <span
    id="tag-pills"
    class="flex min-w-0 flex-1 items-center gap-2.5"
    hx-swap-oob={props.oob === true ? 'true' : undefined}
  >
    {props.entry.tags.length === 0 ? null : (
      <>
        <Dot />
        <span class="flex min-w-0 items-center gap-1 overflow-hidden" data-fold>
          {props.entry.tags.map((tag) => (
            <TagPill tag={tag} />
          ))}
          <button type="button" class={TAG_MORE} popovertarget="tags-panel" data-fold-more hidden>
            +0
          </button>
        </span>
      </>
    )}
  </span>
)

// The checklist is its own form so a toggle posts without the search text.
const TagOptions = (props: { readonly entry: Entry; readonly options: readonly Tag[] }) => (
  <form
    id="tag-options"
    class={TAG_LIST}
    hx-post={`/e/${props.entry.slug}/tags`}
    hx-trigger="change"
    hx-target="this"
    hx-swap="outerHTML"
  >
    {props.options.map((tag) => (
      <label class={TAG_ROW} data-tag-row data-tag={tag}>
        <input
          type="checkbox"
          name="tag"
          value={tag}
          class="sr-only"
          checked={props.entry.tags.includes(tag)}
        />
        <TagDot tag={tag} />
        <span class="truncate">{tag}</span>
        <Icon name="check" class="ml-auto size-3 opacity-0 group-has-checked:opacity-100" />
      </label>
    ))}
  </form>
)

/** What `POST /e/:slug/tags` returns: the checklist, plus the meta-row pills out of band. */
export const TagsFragment = (props: {
  readonly entry: Entry
  readonly options: readonly Tag[]
}) => (
  <>
    <TagOptions entry={props.entry} options={props.options} />
    <TagPills entry={props.entry} oob />
  </>
)

const TagsPanel = (props: { readonly entry: Entry; readonly options: readonly Tag[] }) => (
  <div id="tags-panel" popover class={`${TAG_PANEL} [right:anchor(right)]`} data-tag-menu>
    <form
      hx-post={`/e/${props.entry.slug}/tags`}
      hx-target="#tag-options"
      hx-swap="outerHTML"
      hx-include="#tag-options"
      data-tag-create
    >
      <TagSearch placeholder="Change tags…" name="create" />
    </form>
    <TagOptions entry={props.entry} options={props.options} />
    <button
      type="button"
      class={`${TAG_ROW} mx-1 mb-1 w-[calc(100%-8px)]`}
      data-tag-create-row
      hidden
    >
      <span class="text-muted-foreground">
        Create <b class="font-medium text-foreground" data-tag-create-name />
      </span>
    </button>
    <div class="flex h-7 items-center gap-2.5 border-t px-2.5 text-[11px] text-muted-foreground pointer-coarse:hidden">
      <span>
        <kbd class="kbd rounded-sm dark:bg-foreground/10">↵</kbd> toggle
      </span>
      <span>
        <kbd class="kbd rounded-sm dark:bg-foreground/10">esc</kbd> close
      </span>
    </div>
  </div>
)

/** Every tag in use (most used first), then whatever this entry alone carries. */
export const tagOptions = (entry: Entry, inUse: readonly TagCount[]): readonly Tag[] => {
  const known = inUse.map((row) => row.tag)

  return [...known, ...entry.tags.filter((tag) => !known.includes(tag))]
}

const PREVIEWS = {
  image: (src: string, name: string) => (
    <img class="max-h-[75vh] max-w-full rounded-md" src={src} alt={name} />
  ),
  pdf: (src: string, name: string) => (
    <iframe class="h-[75vh] w-full rounded-md border" src={src} title={name} />
  ),
  video: (src: string) => <video class="max-h-[75vh] max-w-full rounded-md" src={src} controls />,
  audio: (src: string) => <audio class="w-full" src={src} controls />,
} satisfies Record<Preview, (src: string, name: string) => Raw>

const ArtifactPreview = (props: { readonly entry: Entry; readonly file: ArtifactFile }) => {
  const preview = previewOf(props.file.mime)

  return preview === undefined ? (
    <div class={NO_PREVIEW}>No preview for {props.file.mime}</div>
  ) : (
    PREVIEWS[preview](`/a/${props.entry.slug}`, titleOf(props.entry))
  )
}

const SourcePreviewTabs = (props: { readonly startInSource: boolean }) => (
  <div class="tabs">
    <nav role="tablist" aria-orientation="horizontal">
      <button
        type="button"
        role="tab"
        aria-controls="source"
        aria-selected={String(props.startInSource)}
      >
        <Icon name="code" />
        Source
      </button>
      <button
        type="button"
        role="tab"
        aria-controls="preview"
        aria-selected={String(!props.startInSource)}
      >
        <Icon name="eye" />
        Preview
      </button>
    </nav>
  </div>
)

const SourcePreview = (props: {
  readonly body: string
  readonly preview: string
  readonly startInSource: boolean
}) => (
  <>
    <div
      id="source"
      role="tabpanel"
      class="flex flex-1 flex-col font-mono text-sm leading-[1.75]"
      hidden={!props.startInSource}
    >
      <textarea class="min-h-[60vh] w-full resize-none bg-transparent outline-none" name="body">
        {props.body}
      </textarea>
    </div>
    <div id="preview" role="tabpanel" class={`${PROSE} pb-24`} hidden={props.startInSource}>
      {raw(props.preview)}
    </div>
  </>
)

const EntryBody = (props: {
  readonly entry: Entry
  readonly file: ArtifactFile | undefined
  readonly preview: string
  readonly startInSource: boolean
}) => {
  if (props.file !== undefined) {
    return <ArtifactPreview entry={props.entry} file={props.file} />
  }

  if (props.entry.type === 'task') {
    return <TaskList body={props.entry.body} />
  }

  return (
    <SourcePreview
      body={props.entry.body}
      preview={props.preview}
      startInSource={props.startInSource}
    />
  )
}

export const EntryPage = Effect.fn('EntryPage')(function* (props: {
  readonly slug: EntrySlug
  readonly origin: string
  readonly openShare: boolean
  readonly zone: DateTime.TimeZone
}) {
  const entries = yield* Entries
  const markdown = yield* Markdown
  const shares = yield* ShareLinks
  const entry = yield* entries.bySlug(props.slug)
  const links = entry.type === 'artifact' ? yield* shares.active(entry.id) : []
  const knownTags = yield* entries.distinctTags(undefined, false)
  const section = sectionOf(entry.type)
  const preview = yield* markdown.render(entry.body)
  const currentYear = DateTime.getPartUtc(yield* DateTime.now, 'year')
  const startInSource = entry.body === ''
  const isTaskList = entry.type === 'task'
  const file = artifactFile(entry)

  return (
    <Layout title={titleOf(entry)}>
      <article data-editor data-id={entry.id} data-version={String(entry.version)}>
        <Page
          back={{ href: section.path, label: section.label }}
          fill={!isTaskList && file === undefined}
          heading={
            <input
              class={TITLE_INPUT}
              value={entry.title}
              placeholder="Untitled"
              aria-label="Title"
              autocomplete="off"
              spellcheck="false"
              data-title
            />
          }
          meta={
            <>
              {file === undefined ? null : (
                <>
                  <span>{file.mime}</span>
                  <Dot />
                  <span class="tabular-nums">{formatBytes(file.bytes)}</span>
                  <Dot />
                </>
              )}
              {entry.meeting === null ? null : (
                <MeetingMeta meeting={entry.meeting} zone={props.zone} />
              )}
              <span class="whitespace-nowrap">Edited {shortDate(entry, currentYear)}</span>
              <TagPills entry={entry} />
              <div class="flex w-full flex-wrap items-center gap-1.5 sm:ml-auto sm:w-auto">
                <span class="text-[11.5px] text-muted-foreground/60 tabular-nums" data-status />
                <button
                  type="button"
                  class="btn [anchor-name:--tags]"
                  data-variant="ghost"
                  popovertarget="tags-panel"
                >
                  <Icon name="tag" />
                  Tags
                </button>
                {file === undefined ? null : (
                  <ArtifactActions entry={entry} linkCount={links.length} />
                )}
                {entry.type === 'meeting' ? <MeetingActions entry={entry} /> : null}
                {isTaskList || file !== undefined ? null : (
                  <SourcePreviewTabs startInSource={startInSource} />
                )}
                <form method="post" action={`/e/${entry.slug}/archive`}>
                  <button
                    type="submit"
                    class="btn"
                    data-variant="ghost"
                    data-size="icon"
                    aria-label={`Delete ${section.noun}`}
                  >
                    <Icon name="trash" class="size-4" />
                  </button>
                </form>
              </div>
            </>
          }
        >
          {file === undefined ? null : (
            <SharePanel
              entry={entry}
              links={links}
              origin={props.origin}
              currentYear={currentYear}
              open={props.openShare}
            />
          )}
          <TagsPanel entry={entry} options={tagOptions(entry, knownTags)} />
          <EntryBody entry={entry} file={file} preview={preview} startInSource={startInSource} />
        </Page>
      </article>
    </Layout>
  )
})
