import { raw } from '@dotfiles/jsx'
import type { Node, Raw } from '@dotfiles/jsx'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'

import { Icon } from '../components/Icon.tsx'
import { Layout, ThemeToggle } from '../components/Layout.tsx'
import { Entries } from '../services/Entries.ts'
import { Markdown } from '../services/Markdown.ts'
import { DEFAULT_SHARE_TTL, SHARE_TTL_SHORT, sectionOf, ShareTtl } from '../domain.ts'
import type { Entry, EntrySlug, MeetingRef, Section, ShareLink } from '../domain.ts'
import { ShareLinks } from '../services/ShareLinks.ts'
import { artifactFile, formatBytes, previewOf } from '../artifacts.ts'
import type { ArtifactFile, Preview } from '../artifacts.ts'
import { parseTasks, taskProgress } from '../tasks.ts'
import type { Task } from '../tasks.ts'
import { clock } from '../zone.ts'

interface Back {
  readonly href: string
  readonly label: string
  readonly hint?: string
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
  'fixed inset-auto m-0 w-[400px] rounded-lg border bg-background p-1 text-xs text-muted-foreground shadow-lg',
  '[position-anchor:--share] [top:calc(anchor(bottom)+6px)] [right:anchor(right)]',
].join(' ')

const MEETING_PANEL = [
  'fixed inset-auto m-0 w-[360px] rounded-lg border bg-background p-1 text-xs text-muted-foreground shadow-lg',
  '[position-anchor:--meeting] [top:calc(anchor(bottom)+6px)] [right:anchor(right)]',
].join(' ')

const SHARE_ROW =
  'grid h-8 grid-cols-[1fr_auto_auto_auto] items-center gap-1.5 rounded-md pr-1 pl-2 hover:bg-muted'

const SHARE_TTL = [
  'flex h-[22px] flex-1 cursor-pointer items-center justify-center rounded-md text-xs font-medium text-muted-foreground',
  'transition-colors has-checked:bg-background has-checked:text-foreground has-checked:shadow-[0_1px_2px_rgba(0,0,0,.08),0_0_0_1px_var(--border)]',
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
].join(' ')

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
      {props.back.hint === undefined ? null : <kbd class="kbd rounded-sm">{props.back.hint}</kbd>}
    </a>
  )

export const Page = (props: {
  readonly back?: Back
  /** Replaces the back link on the crumbs row (home has no back). */
  readonly crumbs?: Node
  readonly actions?: Node
  readonly heading: Node
  readonly meta: Node
  readonly children?: Node
}) => (
  <main class="mx-auto max-w-[1000px] px-4 pt-10 pb-24 sm:px-8">
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
    <div class="mb-6 flex min-h-[42px] items-center gap-2.5 border-b text-xs text-muted-foreground">
      {props.meta}
    </div>
    {props.children}
  </main>
)

export const Dot = () => <span class="size-[3px] rounded-full bg-muted-foreground/60" />

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
    <span class="truncate">{titleOf(props.entry)}</span>
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
}) {
  const entries = yield* Entries
  const listed = yield* entries.list(props.section.type, props.archived)
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
            <span>
              {listed.length} {props.section.noun}
              {listed.length === 1 ? '' : 's'}
            </span>
            <Dot />
            <span>Newest first</span>
            {props.section.type === 'artifact' ? (
              <label class={NEW_BUTTON} data-variant="outline" data-new>
                <input type="file" class="sr-only" data-upload />
                <Icon name="plus" />
                <span data-upload-label>New</span>
                <kbd class="kbd rounded-sm dark:bg-foreground/10">n</kbd>
              </label>
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
          <GroupLabel>{props.archived ? 'Nothing archived' : 'Nothing yet'}</GroupLabel>
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
      class="font-mono text-sm leading-[1.75]"
      hidden={!props.startInSource}
    >
      <textarea class="min-h-[60vh] w-full resize-none bg-transparent outline-none" name="body">
        {props.body}
      </textarea>
    </div>
    <div id="preview" role="tabpanel" class={PROSE} hidden={props.startInSource}>
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
          back={{ href: section.path, label: section.label, hint: 'esc' }}
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
              <span>Edited {shortDate(entry, currentYear)}</span>
              <div class="ml-auto flex items-center gap-1.5">
                <span class="text-[11.5px] text-muted-foreground/60 tabular-nums" data-status />
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
          <EntryBody entry={entry} file={file} preview={preview} startInSource={startInSource} />
        </Page>
      </article>
    </Layout>
  )
})
