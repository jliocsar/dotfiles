import { Icon } from '../components/Icon.tsx'
import type { Section, Tag, TagCount } from '../domain.ts'
import { hueOf } from '../tags.ts'

interface TagFilter {
  readonly section: Section
  readonly archived: boolean
  readonly tags: readonly TagCount[]
  readonly active: readonly Tag[]
}

const TAG_PILL = [
  'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border bg-background px-1.5',
  'text-[12.5px] leading-none font-medium whitespace-nowrap text-foreground',
].join(' ')

const TAG_DOT = 'size-1.5 shrink-0 rounded-full bg-[oklch(var(--tag-l)_var(--tag-c)_var(--h))]'
const TAG_SEARCH = 'w-full bg-transparent outline-none placeholder:text-muted-foreground'
const TAG_COUNT = 'ml-auto pl-3 text-[12.5px] text-muted-foreground tabular-nums'

const TAG_STRIP =
  '-mx-4 -mt-2 mb-4 flex snap-x scroll-px-4 gap-1.5 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] sm:hidden'

const TAG_CHIP =
  'inline-flex h-8 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap text-muted-foreground aria-pressed:bg-muted aria-pressed:text-foreground'

export const TAG_PANEL = [
  'fixed inset-auto m-0 w-[240px] rounded-lg border bg-background p-0 text-[14px] shadow-lg',
  '[position-anchor:--tags] [top:calc(anchor(bottom)+6px)] [position-try-fallbacks:flip-inline]',
].join(' ')

export const TAG_ROW = [
  'group relative flex h-7 shrink-0 cursor-pointer items-center gap-2 rounded-md px-2',
  'hover:bg-muted aria-pressed:font-medium has-checked:font-medium',
].join(' ')

export const TAG_LIST = 'flex max-h-[232px] flex-col overflow-y-auto p-1'

export const TagDot = (props: { readonly tag: Tag }) => (
  <i class={TAG_DOT} style={`--h:${hueOf(props.tag)}`} />
)

export const TagPill = (props: { readonly tag: Tag; readonly hidden?: true | undefined }) => (
  <span class={TAG_PILL} data-pill hidden={props.hidden}>
    <TagDot tag={props.tag} />
    {props.tag}
  </span>
)

export const TagSearch = (props: { readonly placeholder: string; readonly name?: string }) => (
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

const listHref = (section: Section, archived: boolean, tags: readonly Tag[]) => {
  const params = new URLSearchParams()

  tags.forEach((tag) => {
    params.append('tag', tag)
  })

  if (archived) {
    params.set('archived', '')
  }

  return params.size === 0 ? section.path : `${section.path}?${params}`
}

const toggled = (tags: readonly Tag[], tag: Tag) =>
  tags.includes(tag) ? tags.filter((other) => other !== tag) : [...tags, tag]

export const TagMenu = (props: TagFilter) => (
  <>
    <button
      type="button"
      class="btn [anchor-name:--tags] aria-pressed:bg-muted aria-pressed:text-foreground"
      data-variant="ghost"
      popovertarget="tag-menu"
      aria-pressed={String(props.active.length > 0)}
    >
      <Icon name="tag" />
      {props.active.length === 0 ? 'Tags' : props.active.join(', ')}
      <Icon name="chevron-down" class="size-3 text-muted-foreground" />
    </button>
    <div
      id="tag-menu"
      popover
      class={`${TAG_PANEL} [left:anchor(left)]`}
      data-tag-menu
      data-tag-filter={listHref(props.section, props.archived, [])}
      hx-push-url="true"
    >
      <TagSearch placeholder="Filter by tags…" />
      <div class={TAG_LIST}>
        {props.tags.map(({ tag, count }) => (
          <a
            class={TAG_ROW}
            href={listHref(props.section, props.archived, toggled(props.active, tag))}
            aria-pressed={String(props.active.includes(tag))}
            data-tag-row
            data-tag={tag}
          >
            <TagDot tag={tag} />
            <span class="truncate">{tag}</span>
            <span class={TAG_COUNT}>{count}</span>
            <Icon name="check" class="size-3.5 shrink-0 opacity-0 group-aria-pressed:opacity-100" />
          </a>
        ))}
      </div>
    </div>
  </>
)

export const TagStrip = (props: TagFilter) => (
  <nav class={TAG_STRIP} aria-label="Filter by tags">
    {[
      ...props.active,
      ...props.tags.map(({ tag }) => tag).filter((tag) => !props.active.includes(tag)),
    ].map((tag) => (
      <a
        class={TAG_CHIP}
        href={listHref(props.section, props.archived, toggled(props.active, tag))}
        aria-pressed={String(props.active.includes(tag))}
      >
        <TagDot tag={tag} />
        {tag}
        {props.active.includes(tag) ? <Icon name="x" class="size-3 opacity-60" /> : null}
      </a>
    ))}
  </nav>
)
