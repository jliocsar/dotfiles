import { render } from '@dotfiles/jsx'
import type { Node } from '@dotfiles/jsx'
import { StateEffect } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Filter from 'effect/Filter'
import { identity } from 'effect/Function'
import * as Option from 'effect/Option'
import * as Queue from 'effect/Queue'
import * as Ref from 'effect/Ref'
import type * as Scope from 'effect/Scope'
import * as Stream from 'effect/Stream'
import * as HttpClient from 'effect/unstable/http/HttpClient'
import * as HttpApiClient from 'effect/unstable/httpapi/HttpApiClient'
import { animate } from 'motion'
import type { AnimationOptions } from 'motion'

import { Api } from '../api.ts'
import { Icon } from '../components/Icon.tsx'
import type { IconName } from '../components/Icon.tsx'
import type { EntryId, EntryType, MentionTarget } from '../domain.ts'

export interface Host {
  readonly root: HTMLElement
  readonly edits: Stream.Stream<Edit>
  readonly blurs: Stream.Stream<unknown>
  readonly context: () => Option.Option<Context>
  readonly caret: (at: number) => Option.Option<Caret>
  readonly replace: (context: Context, insert: string) => void
}

interface Edit {
  readonly typed: boolean
}

interface Caret {
  readonly left: number
  readonly bottom: number
}

interface Context {
  readonly from: number
  readonly to: number
  readonly query: string
}

interface Size {
  readonly width: number
  readonly height: number
}

interface State {
  readonly targets: readonly MentionTarget[]
  readonly tab: Tab
  readonly selected: number
  readonly pickable: readonly MentionTarget[]
  readonly dismissedAt: Option.Option<number>
  readonly box: Option.Option<HTMLElement>
  readonly key: string
}

export type Tab = 'all' | EntryType

type Action = (context: Context) => Effect.Effect<void, never, Scope.Scope>

type Test = (title: string, slug: string, query: string) => boolean

export const TABS: readonly Tab[] = ['all', 'note', 'meeting', 'task', 'artifact']

const TAB_LABEL = {
  all: 'All',
  note: 'Notes',
  meeting: 'Meetings',
  task: 'Tasks',
  artifact: 'Artifacts',
} satisfies Record<Tab, string>

const TAB_ICON = {
  all: 'at',
  note: 'note',
  meeting: 'meeting',
  task: 'task',
  artifact: 'artifact',
} satisfies Record<Tab, IconName>

const CLOSED: State = {
  targets: [],
  tab: 'all',
  selected: 0,
  pickable: [],
  dismissedAt: Option.none(),
  box: Option.none(),
  key: '',
}

const MENTION_BEFORE = /(?:^|[\s(])@([\w-]*)$/u

const NOISE = /[^a-z0-9]+/gu

const MAX_HITS = 100

const RANKS: readonly Test[] = [
  (title, _slug, query) => title.startsWith(query),
  (_title, slug, query) => slug.startsWith(query),
  (title, _slug, query) => title.includes(query),
  (_title, slug, query) => slug.includes(query),
]

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches

const ENTER: AnimationOptions = REDUCED
  ? { duration: 0.03 }
  : { type: 'spring', duration: 0.26, bounce: 0.12 }

const RESIZE: AnimationOptions = REDUCED
  ? { duration: 0.03 }
  : { type: 'spring', duration: 0.22, bounce: 0 }

const EXIT: AnimationOptions = { duration: REDUCED ? 0.02 : 0.08, ease: 'easeOut' }

export const targetsEndpoint = Effect.flatMap(HttpClient.HttpClient, (httpClient) =>
  HttpApiClient.endpoint(Api, { group: 'entries', endpoint: 'targets', httpClient }),
)

export const squash = (text: string) => text.toLowerCase().replace(NOISE, '')

const rank = (target: MentionTarget, query: string): number =>
  query === ''
    ? 0
    : RANKS.findIndex((test) => test(squash(target.title), squash(target.slug), query))

export const search = (targets: readonly MentionTarget[], query: string): readonly MentionTarget[] => {
  const squashed = squash(query)

  return targets
    .map((target) => ({ target, score: rank(target, squashed) }))
    .filter((hit) => hit.score >= 0)
    .sort((left, right) => left.score - right.score)
    .slice(0, MAX_HITS)
    .map((hit) => hit.target)
}

export const wrap = (index: number, length: number) =>
  length === 0 ? 0 : ((index % length) + length) % length

export const mark = (title: string, query: string): Node => {
  const at = query === '' ? -1 : title.toLowerCase().indexOf(query.toLowerCase())

  if (at < 0) {
    return title
  }

  return [
    title.slice(0, at),
    <b>{title.slice(at, at + query.length)}</b>,
    title.slice(at + query.length),
  ]
}

const mentionBefore = (text: string, head: number): Option.Option<Context> =>
  Option.fromUndefinedOr(MENTION_BEFORE.exec(text)?.[1]).pipe(
    Option.map((query) => ({ from: head - query.length - 1, to: head, query })),
  )

const size = (element: HTMLElement): Size => ({
  width: element.offsetWidth,
  height: element.offsetHeight,
})

export const closestData = (target: EventTarget | null, key: string): Option.Option<string> =>
  target instanceof Element
    ? Option.fromUndefinedOr(target.closest<HTMLElement>(`[data-${key}]`)?.dataset[key])
    : Option.none()

const inside = (box: HTMLElement, target: EventTarget | null) =>
  target instanceof Element && box.contains(target)

export const swallow = (event: Event) => {
  event.preventDefault()
  event.stopPropagation()
}

const enter = (box: HTMLElement) =>
  Effect.sync(() => {
    animate(box, { opacity: [0, 1], y: [-4, 0], scale: [0.98, 1] }, ENTER)
  })

const leave = Effect.fn('leave')(function* (box: HTMLElement) {
  yield* Effect.promise(() => animate(box, { opacity: 0, y: -3 }, EXIT).finished)
  box.remove()
})

const settle = Effect.fn('settle')(function* (box: HTMLElement, from: Size, to: Size) {
  if (from.width === to.width && from.height === to.height) {
    return
  }

  box.style.width = `${from.width}px`
  box.style.height = `${from.height}px`
  yield* Effect.promise(
    () => animate(box, { width: `${to.width}px`, height: `${to.height}px` }, RESIZE).finished,
  )
  box.style.width = ''
  box.style.height = ''
})

export const capture = <Value,>(
  target: EventTarget,
  type: string,
  accept: (event: Event) => Option.Option<Value>,
): Stream.Stream<Value> =>
  Stream.callback<Value>((queue) => {
    const emit = (event: Event) => {
      Option.map(accept(event), (value) => {
        Queue.offerUnsafe(queue, value)
      })
    }

    return Effect.acquireRelease(
      Effect.sync(() => {
        target.addEventListener(type, emit, true)
      }),
      () =>
        Effect.sync(() => {
          target.removeEventListener(type, emit, true)
        }),
    )
  })

const editorEdits = (view: EditorView): Stream.Stream<Edit> =>
  Stream.callback<Edit>((queue) =>
    Effect.sync(() => {
      const listener = EditorView.updateListener.of((update) => {
        if (update.docChanged || update.selectionSet) {
          Queue.offerUnsafe(queue, { typed: update.docChanged })
        }
      })

      view.dispatch({ effects: StateEffect.appendConfig.of(listener) })
    }),
  )

export const editorHost = (view: EditorView): Host => ({
  root: view.dom,
  edits: editorEdits(view),
  blurs: Stream.fromEventListener(view.contentDOM, 'blur'),
  context: () => {
    const head = view.state.selection.main.head
    const line = view.state.doc.lineAt(head)

    return mentionBefore(line.text.slice(0, head - line.from), head)
  },
  caret: (at) =>
    Option.map(Option.fromNullOr(view.coordsAtPos(at)), (box) => ({
      left: box.left,
      bottom: box.bottom,
    })),
  replace: (context, insert) => {
    view.dispatch({
      changes: { from: context.from, to: context.to, insert },
      selection: { anchor: context.from + insert.length },
    })
  },
})

const focusedInput = (root: HTMLElement): Option.Option<HTMLInputElement> =>
  Option.fromNullOr(document.activeElement).pipe(
    Option.filter((element) => element instanceof HTMLInputElement),
    Option.filter((input) => input.type === 'text' && root.contains(input)),
  )

const textWidth = (input: HTMLInputElement, text: string): number =>
  Option.fromNullOr(document.createElement('canvas').getContext('2d')).pipe(
    Option.map((canvas) => {
      canvas.font = getComputedStyle(input).font

      return canvas.measureText(text).width
    }),
    Option.getOrElse(() => 0),
  )

export const inputsHost = (root: HTMLElement): Host => ({
  root,
  edits: Stream.mergeAll({ concurrency: 'unbounded' })(
    ['input', 'keyup', 'click'].map((type) =>
      Stream.fromEventListener(root, type).pipe(Stream.map(() => ({ typed: type === 'input' }))),
    ),
  ),
  blurs: Stream.fromEventListener(root, 'focusout'),
  context: () =>
    Option.flatMap(focusedInput(root), (input) => {
      const head = input.selectionStart ?? input.value.length

      return mentionBefore(input.value.slice(0, head), head)
    }),
  caret: (at) =>
    Option.map(focusedInput(root), (input) => {
      const box = input.getBoundingClientRect()
      const padding = parseFloat(getComputedStyle(input).paddingLeft)

      return {
        left: box.left + padding + textWidth(input, input.value.slice(0, at)) - input.scrollLeft,
        bottom: box.bottom,
      }
    }),
  replace: (context, insert) => {
    Option.map(focusedInput(root), (input) => {
      input.setRangeText(insert, context.from, context.to, 'end')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  },
})

export const tabNamed = (name: string): Option.Option<Tab> =>
  Arr.findFirst(TABS, (tab) => tab === name)

export const highlight = (box: HTMLElement, selected: number) =>
  Effect.sync(() => {
    box.querySelectorAll<HTMLElement>('[data-index]').forEach((row) => {
      row.setAttribute('aria-selected', String(Number(row.dataset['index']) === selected))
    })
    box.querySelector('[data-index][aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  })

const highlightBox = (current: State) =>
  Option.match(current.box, {
    onNone: () => Effect.void,
    onSome: (box) => highlight(box, current.selected),
  })

const mount = (host: Host) =>
  Effect.sync(() => {
    const box = document.createElement('div')

    box.className = 'mention-pop'
    box.setAttribute('role', 'listbox')
    host.root.append(box)

    return box
  })

const place = (host: Host, box: HTMLElement, at: number) => {
  const frame = host.root.getBoundingClientRect()

  Option.map(host.caret(at), (caret) => {
    box.style.left = `${Math.max(0, Math.min(caret.left - frame.left, frame.width - box.offsetWidth))}px`
    box.style.top = `${caret.bottom - frame.top + 4}px`
  })
}

const Row = (props: {
  readonly target: MentionTarget
  readonly query: string
  readonly index: number
  readonly selected: boolean
}) => (
  <div
    class="mention-row"
    role="option"
    aria-selected={String(props.selected)}
    data-index={props.index}
  >
    <Icon name={props.target.type} />
    <span>{mark(props.target.title, props.query)}</span>
  </div>
)

const List = (props: {
  readonly pickable: readonly MentionTarget[]
  readonly query: string
  readonly selected: number
}) => (
  <div class="mention-list">
    {props.pickable.length === 0 ? (
      <div class="mention-empty">Nothing here</div>
    ) : (
      props.pickable.map((target, index) => (
        <Row
          target={target}
          query={props.query}
          index={index}
          selected={index === props.selected}
        />
      ))
    )}
  </div>
)

export const Tabs = (props: { readonly hits: readonly MentionTarget[]; readonly tab: Tab }) => (
  <div class="mention-tabs">
    {TABS.map((tab) => (
      <span role="tab" aria-selected={String(tab === props.tab)} data-tab={tab}>
        <Icon name={TAB_ICON[tab]} />
        <em>{TAB_LABEL[tab]}</em>
        <i>
          {tab === 'all' ? props.hits.length : props.hits.filter((hit) => hit.type === tab).length}
        </i>
      </span>
    ))}
  </div>
)

const Popup = (props: {
  readonly hits: readonly MentionTarget[]
  readonly pickable: readonly MentionTarget[]
  readonly query: string
  readonly tab: Tab
  readonly selected: number
}) =>
  props.hits.length === 0 ? (
    <div class="mention-empty">No entry matches “{props.query}”</div>
  ) : (
    <>
      <List pickable={props.pickable} query={props.query} selected={props.selected} />
      <Tabs hits={props.hits} tab={props.tab} />
    </>
  )

export const mountMentions = Effect.fn('mountMentions')(function* (host: Host, self: EntryId) {
  const state = yield* Ref.make(CLOSED)
  const targets = yield* targetsEndpoint

  const withContext = (action: Action) =>
    Effect.suspend(() =>
      Option.match(host.context(), { onNone: () => Effect.void, onSome: action }),
    )

  const close = Effect.gen(function* () {
    const previous = yield* Ref.getAndUpdate(state, (current) => ({
      ...CLOSED,
      targets: current.targets,
      dismissedAt: current.dismissedAt,
    }))

    yield* Option.match(previous.box, {
      onNone: () => Effect.void,
      onSome: (box) => Effect.forkScoped(leave(box)),
    })
  })

  const show = Effect.fn('show')(function* (context: Context) {
    const current = yield* Ref.get(state)
    const hits = search(current.targets, context.query)
    const pickable = current.tab === 'all' ? hits : hits.filter((hit) => hit.type === current.tab)
    const box = yield* Option.match(current.box, {
      onNone: () => mount(host),
      onSome: Effect.succeed,
    })
    const before = size(box)
    const next = yield* Ref.updateAndGet(state, (latest) => ({
      ...latest,
      pickable,
      selected: pickable.length === 0 ? 0 : Math.min(latest.selected, pickable.length - 1),
      key: `${context.query}|${latest.tab}`,
      box: Option.some(box),
    }))

    if (next.key === current.key) {
      yield* highlightBox(next)
    } else {
      box.style.width = ''
      box.style.height = ''
      box.innerHTML = render(
        <Popup
          hits={hits}
          pickable={pickable}
          query={context.query}
          tab={next.tab}
          selected={next.selected}
        />,
      )
      place(host, box, context.from)
      Option.map(Option.fromNullOr(box.querySelector<HTMLElement>('.mention-list')), (list) => {
        list.toggleAttribute('data-overflow', list.scrollHeight > list.clientHeight)
      })
      yield* highlightBox(next)
      yield* Option.isNone(current.box)
        ? enter(box)
        : Effect.forkScoped(settle(box, before, size(box)))
    }
  })

  const follow = Effect.fn('follow')(function* (edit: Edit) {
    const { dismissedAt } = yield* Ref.get(state)
    const found = host.context()
    const open = Option.filter(found, (context) => !Option.contains(dismissedAt, context.from))

    if (Option.isNone(open)) {
      yield* Ref.update(state, (current) => ({
        ...current,
        dismissedAt: Option.isNone(found) ? Option.none() : current.dismissedAt,
      }))
      yield* close
    } else {
      yield* Ref.update(state, (current) => ({
        ...current,
        selected: edit.typed ? 0 : current.selected,
      }))
      yield* show(open.value)
    }
  })

  const pick = (context: Context, target: MentionTarget) =>
    Effect.andThen(
      Effect.sync(() => {
        host.replace(context, `[${target.title}](@${target.slug})`)
      }),
      close,
    )

  const move =
    (step: number): Action =>
    () =>
      Effect.flatMap(
        Ref.updateAndGet(state, (current) => ({
          ...current,
          selected: wrap(current.selected + step, current.pickable.length),
        })),
        highlightBox,
      )

  const switchTab =
    (step: number): Action =>
    (context) =>
      Effect.andThen(
        Ref.update(state, (current) => ({
          ...current,
          selected: 0,
          tab: TABS[wrap(TABS.indexOf(current.tab) + step, TABS.length)] ?? 'all',
        })),
        show(context),
      )

  const selectTab =
    (tab: Tab): Action =>
    (context) =>
      Effect.andThen(
        Ref.update(state, (current) => ({ ...current, selected: 0, tab })),
        show(context),
      )

  const pickIndex =
    (index: number): Action =>
    (context) =>
      Effect.flatMap(Ref.get(state), (current) =>
        Option.match(Arr.get(current.pickable, index), {
          onNone: () => Effect.void,
          onSome: (target) => pick(context, target),
        }),
      )

  const pickSelected: Action = (context) =>
    Effect.flatMap(Ref.get(state), (current) => pickIndex(current.selected)(context))

  const dismiss: Action = (context) =>
    Effect.andThen(
      Ref.update(state, (current) => ({ ...current, dismissedAt: Option.some(context.from) })),
      close,
    )

  const actions: ReadonlyMap<string, Action> = new Map([
    ['ArrowDown', move(1)],
    ['ArrowUp', move(-1)],
    ['ArrowRight', switchTab(1)],
    ['ArrowLeft', switchTab(-1)],
    ['Enter', pickSelected],
    ['Tab', pickSelected],
    ['Escape', dismiss],
  ])

  const keys = capture(host.root, 'keydown', (event) => {
    const current = Ref.getUnsafe(state)
    const action = event instanceof KeyboardEvent ? actions.get(event.key) : undefined
    const inert = current.pickable.length === 0 && action === pickSelected

    if (Option.isNone(current.box) || action === undefined || inert) {
      return Option.none()
    }

    swallow(event)

    return Option.some(action)
  })

  const clicks = capture(host.root, 'mousedown', (event) => {
    const current = Ref.getUnsafe(state)

    if (Option.isNone(current.box) || !inside(current.box.value, event.target)) {
      return Option.none()
    }

    swallow(event)

    return Option.orElse(
      Option.map(closestData(event.target, 'index'), (index) => pickIndex(Number(index))),
      () =>
        closestData(event.target, 'tab').pipe(Option.flatMap(tabNamed), Option.map(selectTab)),
    )
  })

  const hovers = Stream.fromEventListener<MouseEvent>(host.root, 'mousemove').pipe(
    Stream.filterMap(Filter.fromPredicateOption((event) => closestData(event.target, 'index'))),
    Stream.map((index) =>
      Effect.flatMap(
        Ref.updateAndGet(state, (current) => ({ ...current, selected: Number(index) })),
        highlightBox,
      ),
    ),
  )

  const blurs = Stream.map(host.blurs, () => close)

  yield* Effect.forkScoped(
    targets({}).pipe(
      Effect.flatMap((loaded) =>
        Ref.update(state, (current) => ({
          ...current,
          targets: loaded.filter((target) => target.id !== self),
        })),
      ),
      Effect.catchCause((cause) => Effect.logWarning('mention targets failed', cause)),
    ),
  )

  yield* Effect.forkScoped(
    Stream.mergeAll({ concurrency: 'unbounded' })([
      Stream.map(host.edits, follow),
      Stream.map(keys, withContext),
      Stream.map(clicks, withContext),
      hovers,
      blurs,
    ]).pipe(Stream.runForEach(identity)),
  )
})
