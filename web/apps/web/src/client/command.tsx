import { render } from '@dotfiles/jsx'
import * as Arr from 'effect/Array'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Filter from 'effect/Filter'
import { identity } from 'effect/Function'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
import * as Stream from 'effect/Stream'

import { Icon } from '../components/Icon.tsx'
import type { IconName } from '../components/Icon.tsx'
import { NAV } from '../domain.ts'
import type { EntryType, MentionTarget } from '../domain.ts'
import {
  TABS,
  Tabs,
  capture,
  closestData,
  highlight,
  mark,
  search,
  squash,
  swallow,
  tabNamed,
  targetsEndpoint,
  wrap,
} from './mentions.tsx'
import type { Tab } from './mentions.tsx'

interface Item {
  readonly href: string
  readonly icon: IconName
  readonly title: string
  readonly meta: string
}

interface Page {
  readonly href: string
  readonly label: string
  readonly type: Option.Option<EntryType>
}

interface State {
  readonly targets: readonly MentionTarget[]
  readonly query: string
  readonly tab: Tab
  readonly selected: number
  readonly hits: readonly MentionTarget[]
  readonly items: readonly Item[]
}

interface Palette {
  readonly dialog: HTMLDialogElement
  readonly box: HTMLElement
  readonly input: HTMLInputElement
  readonly scopes: HTMLElement
  readonly menu: HTMLElement
}

const IDLE: State = { targets: [], query: '', tab: 'all', selected: 0, hits: [], items: [] }

const PAGES: readonly Page[] = [
  { href: '/', label: 'Home', type: Option.none() },
  ...NAV.map((section) => ({
    href: section.path,
    label: section.label,
    type: Option.some(section.type),
  })),
]

const inTab = (tab: Tab, type: EntryType) => tab === 'all' || type === tab

const pageInTab = (tab: Tab, page: Page) => tab === 'all' || Option.contains(page.type, tab)

const pageItem = (page: Page): Item => ({
  href: page.href,
  icon: 'arrow-up-right',
  title: `Go to ${page.label}`,
  meta: page.href,
})

const entryItem = (target: MentionTarget): Item => ({
  href: `/e/${target.slug}`,
  icon: target.type,
  title: target.title,
  meta: DateTime.format(target.updatedAt, { locale: 'en', month: 'short', day: 'numeric' }),
})

const derive = (current: State): State => {
  const hits = search(current.targets, current.query)
  const pages = PAGES.filter(
    (page) => pageInTab(current.tab, page) && squash(page.label).includes(squash(current.query)),
  )
  const items = [
    ...pages.map(pageItem),
    ...hits.filter((hit) => inTab(current.tab, hit.type)).map(entryItem),
  ]

  return {
    ...current,
    hits,
    items,
    selected: items.length === 0 ? 0 : Math.min(current.selected, items.length - 1),
  }
}

const wantsToggle = (event: Event) =>
  event instanceof KeyboardEvent && (event.ctrlKey || event.metaKey) && event.key === 'k'

const paletteOf = (dialog: HTMLDialogElement): Option.Option<Palette> =>
  Option.all({
    dialog: Option.some(dialog),
    box: Option.fromNullOr(dialog.querySelector<HTMLElement>('.command')),
    input: Option.fromNullOr(dialog.querySelector('input')),
    scopes: Option.fromNullOr(dialog.querySelector<HTMLElement>('[data-scopes]')),
    menu: Option.fromNullOr(dialog.querySelector<HTMLElement>('[data-menu]')),
  })

const Row = (props: {
  readonly item: Item
  readonly query: string
  readonly index: number
  readonly selected: boolean
}) => (
  <div role="menuitem" aria-selected={String(props.selected)} data-index={props.index}>
    <Icon name={props.item.icon} />
    <span>{mark(props.item.title, props.query)}</span>
    <span class="command-meta">{props.item.meta}</span>
  </div>
)

const Menu = (props: {
  readonly items: readonly Item[]
  readonly query: string
  readonly selected: number
}) =>
  props.items.length === 0 ? (
    <div class="command-empty">No results for “{props.query}”</div>
  ) : (
    <>
      {props.items.map((item, index) => (
        <Row item={item} query={props.query} index={index} selected={index === props.selected} />
      ))}
    </>
  )

const Hint = () => (
  <span class="command-hint">
    <kbd>←</kbd> <kbd>→</kbd>
  </span>
)

const run = Effect.fn('runCommand')(function* (palette: Palette) {
  const state = yield* Ref.make(IDLE)
  const targets = yield* targetsEndpoint

  const show = Effect.gen(function* () {
    const next = yield* Ref.updateAndGet(state, derive)

    palette.scopes.innerHTML = render([<Tabs hits={next.hits} tab={next.tab} />, <Hint />])
    palette.menu.innerHTML = render(
      <Menu items={next.items} query={next.query} selected={next.selected} />,
    )
    palette.menu.scrollTop = 0
    yield* highlight(palette.menu, next.selected)
  })

  const load = targets({}).pipe(
    Effect.flatMap((loaded) => Ref.update(state, (current) => ({ ...current, targets: loaded }))),
    Effect.andThen(show),
    Effect.catchCause((cause) => Effect.logWarning('command targets failed', cause)),
  )

  const open = Effect.gen(function* () {
    yield* Ref.update(state, (current) => ({ ...IDLE, targets: current.targets }))
    palette.input.value = ''
    palette.dialog.showModal()
    palette.input.focus()
    yield* show
    yield* Effect.forkScoped(load)
  })

  const close = Effect.sync(() => {
    palette.dialog.close()
  })

  const toggle = Effect.suspend(() => (palette.dialog.open ? close : open))

  const select = (index: number) =>
    Effect.flatMap(
      Ref.updateAndGet(state, (current) => ({ ...current, selected: index })),
      (next) => highlight(palette.menu, next.selected),
    )

  const move = (step: number) =>
    Effect.flatMap(Ref.get(state), (current) =>
      select(wrap(current.selected + step, current.items.length)),
    )

  const selectTab = (tab: Tab) =>
    Effect.andThen(
      Ref.update(state, (current) => ({ ...current, selected: 0, tab })),
      show,
    )

  const switchTab = (step: number) =>
    Effect.flatMap(Ref.get(state), (current) =>
      selectTab(TABS[wrap(TABS.indexOf(current.tab) + step, TABS.length)] ?? 'all'),
    )

  const goIndex = (index: number) =>
    Effect.flatMap(Ref.get(state), (current) =>
      Effect.sync(() => {
        Option.map(Arr.get(current.items, index), (item) => {
          window.location.assign(item.href)
        })
      }),
    )

  const goSelected = Effect.flatMap(Ref.get(state), (current) => goIndex(current.selected))

  const actions: ReadonlyMap<string, Effect.Effect<void>> = new Map([
    ['ArrowDown', move(1)],
    ['ArrowUp', move(-1)],
    ['ArrowRight', switchTab(1)],
    ['ArrowLeft', switchTab(-1)],
    ['Enter', goSelected],
    ['Escape', close],
  ])

  const claim = <Value,>(event: Event, value: Value) => {
    swallow(event)

    return value
  }

  const toggles = capture(document, 'keydown', (event) =>
    Option.map(Option.liftPredicate(event, wantsToggle), (hit) => claim(hit, toggle)),
  )

  const keys = capture(palette.dialog, 'keydown', (event) =>
    Option.map(
      Option.fromUndefinedOr(event instanceof KeyboardEvent ? actions.get(event.key) : undefined),
      (action) => claim(event, action),
    ),
  )

  const clicks = capture(palette.dialog, 'mousedown', (event) =>
    event.target === palette.dialog
      ? Option.some(close)
      : Option.map(
          Option.orElse(
            Option.map(closestData(event.target, 'index'), (index) => goIndex(Number(index))),
            () =>
              closestData(event.target, 'tab').pipe(Option.flatMap(tabNamed), Option.map(selectTab)),
          ),
          (action) => claim(event, action),
        ),
  )

  const hovers = Stream.fromEventListener<MouseEvent>(palette.menu, 'mousemove').pipe(
    Stream.filterMap(Filter.fromPredicateOption((event) => closestData(event.target, 'index'))),
    Stream.map((index) => select(Number(index))),
  )

  const inputs = Stream.fromEventListener(palette.input, 'input').pipe(
    Stream.map(() =>
      Effect.andThen(
        Ref.update(state, (current) => ({ ...current, query: palette.input.value, selected: 0 })),
        show,
      ),
    ),
  )

  const scrolls = Stream.fromEventListener(palette.menu, 'scroll').pipe(
    Stream.map(() =>
      Effect.sync(() => {
        palette.box.toggleAttribute('data-scrolled', palette.menu.scrollTop > 0)
      }),
    ),
  )

  yield* Stream.mergeAll({ concurrency: 'unbounded' })([
    toggles,
    keys,
    clicks,
    hovers,
    inputs,
    scrolls,
  ]).pipe(Stream.runForEach(identity))
})

export const mountCommand = (dialog: HTMLDialogElement) =>
  Option.match(paletteOf(dialog), { onNone: () => Effect.void, onSome: run })
