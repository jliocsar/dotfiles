import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { vim } from '@replit/codemirror-vim'
import { EditorView, minimalSetup } from 'codemirror'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as FiberHandle from 'effect/FiberHandle'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Option from 'effect/Option'
import * as Queue from 'effect/Queue'
import * as Ref from 'effect/Ref'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'
import * as FetchHttpClient from 'effect/unstable/http/FetchHttpClient'
import * as HttpBody from 'effect/unstable/http/HttpBody'
import * as HttpClient from 'effect/unstable/http/HttpClient'
import * as HttpClientResponse from 'effect/unstable/http/HttpClientResponse'
import * as HttpApiClient from 'effect/unstable/httpapi/HttpApiClient'

import { Api } from '../api.ts'
import { entryId, normaliseTag, VersionConflict } from '../domain.ts'
import type { EntryId } from '../domain.ts'
import { serializeTasks } from '../tasks.ts'
import type { Task } from '../tasks.ts'
import { mountCommand } from './command.tsx'
import { capture, editorHost, inputsHost, mountMentions, swallow } from './mentions.tsx'

type EditorStatus = 'saving' | 'saved' | 'conflict' | 'error'

interface Saved {
  readonly title: string
  readonly body: string
  readonly version: number
}

interface Saver {
  readonly edited: Effect.Effect<void>
  readonly run: (flushes: Stream.Stream<unknown>) => Effect.Effect<void>
}

interface EntryElements {
  readonly root: HTMLElement
  readonly title: HTMLInputElement
  readonly status: HTMLElement
  readonly id: EntryId
}

interface EditorElements extends EntryElements {
  readonly source: HTMLTextAreaElement
  readonly preview: HTMLElement
}

interface TaskElements extends EntryElements {
  readonly list: HTMLElement
  readonly template: HTMLTemplateElement
}

interface TaskItem {
  readonly item: HTMLLIElement
  readonly check: HTMLInputElement
  readonly text: HTMLInputElement
}

const STATUS_TEXT = {
  saving: 'Saving…',
  saved: 'Saved',
  conflict: 'Conflict',
  error: 'Save failed',
} satisfies Record<EditorStatus, string>

// Reads as page text and fills the page down to the vim status line, which sticks
// a page-margin above the viewport bottom. Colours come from the site theme
// (codemirror isn't told about dark mode); `--caret` is the one accent it has.
const editorTheme = EditorView.theme({
  '&': { flex: '1', outline: 'none', fontFamily: 'inherit', fontSize: 'inherit' },
  '&.cm-focused': { outline: 'none' },
  // The page scrolls, not the editor, so nothing (cursor at column 0 included) needs clipping.
  '.cm-scroller': {
    flex: '1',
    overflow: 'visible',
    fontFamily: 'inherit',
    lineHeight: 'inherit',
  },
  '.cm-content': { padding: '0', caretColor: 'var(--caret)' },
  '.cm-line': { padding: '0' },
  '.cm-cursor': { borderLeft: '2px solid var(--caret)', marginLeft: '-1px' },
  // `.cm-editor` is redundant but outranks the vim plugin's own pink block cursor.
  '&.cm-editor .cm-fat-cursor': { borderRadius: '2px', background: 'var(--caret)' },
  // The plugin sets the letter colour inline (transparent for half-height pending cursors).
  '&.cm-editor.cm-focused .cm-fat-cursor:not([style*="transparent"])': {
    color: 'var(--caret-foreground) !important',
  },
  '&.cm-editor:not(.cm-focused) .cm-fat-cursor': { outline: '1px solid var(--caret)' },
  '.cm-selectionBackground': { backgroundColor: 'var(--selection)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'var(--selection)',
  },
  '.cm-panels': {
    bottom: '2.5rem',
    zIndex: '1',
    borderTop: '1px solid var(--border)',
    backgroundColor: 'var(--muted)',
    color: 'var(--muted-foreground)',
  },
  '.cm-vim-panel': {
    alignItems: 'center',
    minHeight: '28px',
    padding: '0 8px',
    fontSize: '12px',
  },
  '.cm-vim-panel, .cm-vim-panel *': { fontFamily: 'var(--font-mono) !important' },
  '.cm-vim-panel input': { color: 'var(--foreground)', caretColor: 'var(--caret)' },
})

const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, textDecoration: 'underline', textUnderlineOffset: '3px' },
  {
    tag: [tags.url, tags.labelName, tags.processingInstruction, tags.meta],
    color: 'var(--muted-foreground)',
  },
])

const IDLE_SAVE = '2 seconds'

const CONFLICT_RETRIES = 2

const saveEndpoint = Effect.flatMap(HttpClient.HttpClient, (httpClient) =>
  HttpApiClient.endpoint(Api, {
    group: 'entries',
    endpoint: 'save',
    httpClient,
  }),
)

const uploadEndpoints = Effect.flatMap(HttpClient.HttpClient, (httpClient) =>
  Effect.all({
    presign: HttpApiClient.endpoint(Api, {
      group: 'artifacts',
      endpoint: 'presign',
      httpClient,
    }),
    register: HttpApiClient.endpoint(Api, {
      group: 'artifacts',
      endpoint: 'register',
      httpClient,
    }),
  }),
)

const FALLBACK_MIME = 'application/octet-stream'

const mimeOf = (file: File) => (file.type === '' ? FALLBACK_MIME : file.type)

const putObject = (url: string, file: File) =>
  HttpClient.put(url, {
    body: HttpBody.raw(file, { contentType: mimeOf(file) }),
  }).pipe(Effect.flatMap(HttpClientResponse.filterStatusOk))

const entryElements = (root: HTMLElement): Option.Option<EntryElements> =>
  Option.all({
    title: Option.fromNullOr(root.querySelector<HTMLInputElement>('[data-title]')),
    status: Option.fromNullOr(root.querySelector<HTMLElement>('[data-status]')),
    id: Option.fromUndefinedOr(root.dataset['id']).pipe(Option.map(entryId)),
  }).pipe(Option.map((found) => ({ root, ...found })))

const editorElements = (root: HTMLElement): Option.Option<EditorElements> =>
  Option.all({
    entry: entryElements(root),
    source: Option.fromNullOr(root.querySelector('textarea')),
    preview: Option.fromNullOr(root.querySelector<HTMLElement>('#preview')),
  }).pipe(Option.map(({ entry, ...found }) => ({ ...entry, ...found })))

const taskElements = (root: HTMLElement): Option.Option<TaskElements> =>
  Option.all({
    entry: entryElements(root),
    list: Option.fromNullOr(root.querySelector<HTMLElement>('[data-tasks]')),
    template: Option.fromNullOr(root.querySelector<HTMLTemplateElement>('[data-task-template]')),
  }).pipe(Option.map(({ entry, ...found }) => ({ ...entry, ...found })))

const taskItem = (item: HTMLLIElement): Option.Option<TaskItem> =>
  Option.all({
    check: Option.fromNullOr(item.querySelector<HTMLInputElement>('input[type="checkbox"]')),
    text: Option.fromNullOr(item.querySelector<HTMLInputElement>('input[type="text"]')),
  }).pipe(Option.map((found) => ({ item, ...found })))

const taskItems = (list: HTMLElement): readonly TaskItem[] =>
  Arr.getSomes(Arr.fromIterable(list.querySelectorAll('li')).map(taskItem))

const readTask = (item: TaskItem): Task => ({
  done: item.check.checked,
  text: item.text.value,
})

const taskItemOf = (target: EventTarget | null): Option.Option<TaskItem> =>
  target instanceof HTMLInputElement
    ? Option.fromNullOr(target.closest('li')).pipe(Option.flatMap(taskItem))
    : Option.none()

const isTextField = (item: TaskItem, target: EventTarget | null) => item.text === target

const focusEnd = (input: HTMLInputElement) => {
  input.focus()
  input.setSelectionRange(input.value.length, input.value.length)
}

const clickedPreviewTab = (event: MouseEvent): boolean =>
  event.target instanceof HTMLElement &&
  event.target.closest('[role="tab"]')?.getAttribute('aria-controls') === 'preview'

const inField = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.matches('input, textarea, select'))

const click = (selector: string) =>
  Effect.sync(() => {
    document.querySelector<HTMLElement>(selector)?.click()
  })

const focusRow = (step: 1 | -1) =>
  Effect.sync(() => {
    const rows = Arr.fromIterable(document.querySelectorAll<HTMLElement>('[data-row]'))
    const current = rows.findIndex((row) => row === document.activeElement)
    const fallback = step === 1 ? 0 : rows.length - 1
    const next = current === -1 ? fallback : current + step

    if (next >= 0 && next < rows.length) {
      rows[next]?.focus()
    }
  })

const SHORTCUTS: ReadonlyMap<string, Effect.Effect<void>> = new Map([
  ['n', click('[data-new]')],
  ['j', focusRow(1)],
  ['k', focusRow(-1)],
])

const shortcut = (event: KeyboardEvent): Effect.Effect<void> =>
  SHORTCUTS.get(event.key) ?? Effect.void

const mountSaver = Effect.fn('mountSaver')(function* (
  elements: EntryElements,
  readBody: () => string,
  onSaved: (html: string) => void,
) {
  const { root, title, status, id } = elements
  const save = yield* saveEndpoint
  const saved = yield* Ref.make<Saved>({
    title: title.value,
    body: readBody(),
    version: Number(root.dataset['version']),
  })
  const edits = yield* Queue.unbounded<void>()

  const setStatus = (next: EditorStatus) =>
    Effect.sync(() => {
      status.textContent = STATUS_TEXT[next]
    })

  const flush = Effect.gen(function* () {
    const patch = { title: title.value, body: readBody() }
    const current = yield* Ref.get(saved)

    if (patch.title !== current.title || patch.body !== current.body) {
      yield* setStatus('saving')

      const result = yield* save({
        params: { id },
        payload: { ...patch, version: current.version },
      })

      yield* Ref.set(saved, { ...patch, version: result.version })
      yield* Effect.sync(() => {
        root.dataset['version'] = String(result.version)
        document.title = patch.title === '' ? 'Untitled' : patch.title
        onSaved(result.html)
      })
    }
  })

  const commit = flush.pipe(
    Effect.tapErrorTag('VersionConflict', ({ entry }) =>
      Effect.andThen(
        Ref.update(saved, (current) => ({
          ...current,
          version: entry.version,
        })),
        setStatus('conflict'),
      ),
    ),
    Effect.retry({
      while: Schema.is(VersionConflict),
      times: CONFLICT_RETRIES,
    }),
    Effect.matchEffect({
      onFailure: (error) =>
        Effect.andThen(Effect.logWarning('save failed', error), setStatus('error')),
      onSuccess: () => setStatus('saved'),
    }),
  )

  const edited = Effect.sync(() => {
    Queue.offerUnsafe(edits, undefined)
  })

  yield* Effect.forkScoped(
    Stream.fromEventListener(title, 'input').pipe(Stream.runForEach(() => edited)),
  )
  yield* Effect.forkScoped(
    Stream.fromEventListener<KeyboardEvent>(title, 'keydown').pipe(
      Stream.filter((event) => event.key === 'Enter' || event.key === 'Escape'),
      Stream.runForEach(() =>
        Effect.sync(() => {
          title.blur()
        }),
      ),
    ),
  )

  const idle = Stream.fromQueue(edits).pipe(Stream.debounce(IDLE_SAVE))

  const titleBlurs = Stream.fromEventListener(title, 'focusout')

  const run = (flushes: Stream.Stream<unknown>) =>
    Stream.merge(Stream.merge(idle, titleBlurs), flushes).pipe(Stream.runForEach(() => commit))

  return { edited, run } satisfies Saver
})

const mountTasks = Effect.fn('mountTasks')(function* (elements: TaskElements) {
  const { list, template } = elements
  const saver = yield* mountSaver(
    elements,
    () => serializeTasks(taskItems(list).map(readTask)),
    () => undefined,
  )

  const insertAfter = (item: HTMLLIElement | null): Option.Option<TaskItem> => {
    const fragment = template.content.cloneNode(true)

    if (item === null) {
      list.append(fragment)
    } else {
      item.after(fragment)
    }

    return Option.fromNullOr(item === null ? list.lastElementChild : item.nextElementSibling).pipe(
      Option.filter((element) => element instanceof HTMLLIElement),
      Option.flatMap(taskItem),
    )
  }

  const keepTrailingDraft = Effect.sync(() => {
    const last = Arr.last(taskItems(list))

    if (Option.isNone(last) || last.value.text.value !== '') {
      insertAfter(null)
    }
  })

  yield* Effect.sync(() => {
    const items = taskItems(list)

    if (items.length === 1) {
      items[0]?.text.focus()
    }
  })

  const typing = Stream.fromEventListener<Event>(list, 'input').pipe(
    Stream.runForEach(() => Effect.andThen(keepTrailingDraft, saver.edited)),
  )

  const keys = Stream.fromEventListener<KeyboardEvent>(list, 'keydown').pipe(
    Stream.runForEach((event) =>
      Effect.gen(function* () {
        const current = taskItemOf(event.target)

        if (Option.isNone(current) || !isTextField(current.value, event.target)) {
          return
        }

        if (event.key === 'Enter') {
          event.preventDefault()
          Option.map(insertAfter(current.value.item), (next) => {
            next.text.focus()
          })
        } else if (event.key === 'Escape') {
          current.value.text.blur()
        } else if (event.key === 'Backspace' && current.value.text.value === '') {
          const previous = current.value.item.previousElementSibling

          if (previous instanceof HTMLLIElement) {
            event.preventDefault()
            current.value.item.remove()
            Option.map(taskItem(previous), (item) => {
              focusEnd(item.text)
            })
            yield* saver.edited
          }
        }
      }),
    ),
  )

  yield* Effect.forkScoped(typing)
  yield* Effect.forkScoped(keys)
  yield* mountMentions(inputsHost(list), elements.id)

  const toggles = Stream.fromEventListener<Event>(list, 'change').pipe(
    Stream.filter(
      (event) => event.target instanceof HTMLInputElement && event.target.type === 'checkbox',
    ),
  )

  const blurs = Stream.fromEventListener<FocusEvent>(list, 'focusout')

  yield* saver.run(Stream.merge(blurs, toggles))
})

const mountEditor = Effect.fn('mountEditor')(function* (elements: EditorElements) {
  const { source, preview } = elements
  const docChanges = yield* Queue.unbounded<void>()

  const view = yield* Effect.acquireRelease(
    Effect.sync(
      () =>
        new EditorView({
          doc: source.value,
          extensions: [
            vim({ status: true }),
            minimalSetup,
            markdown(),
            syntaxHighlighting(markdownHighlight),
            EditorView.lineWrapping,
            editorTheme,
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                Queue.offerUnsafe(docChanges, undefined)
              }
            }),
          ],
        }),
    ),
    (editor) =>
      Effect.sync(() => {
        editor.destroy()
      }),
  )

  yield* Effect.sync(() => {
    source.replaceWith(view.dom)

    if (view.state.doc.length === 0) {
      view.focus()
    }
  })

  yield* mountMentions(editorHost(view), elements.id)

  const saver = yield* mountSaver(
    elements,
    () => view.state.doc.toString(),
    (html) => {
      preview.innerHTML = html
    },
  )

  yield* Effect.forkScoped(Stream.fromQueue(docChanges).pipe(Stream.runForEach(() => saver.edited)))

  const previewClicks = Stream.fromEventListener<MouseEvent>(elements.root, 'click').pipe(
    Stream.filter(clickedPreviewTab),
  )

  const flushes = Stream.merge(Stream.fromEventListener(view.contentDOM, 'blur'), previewClicks)

  yield* saver.run(flushes)
})

const mountTitle = Effect.fn('mountTitle')(function* (elements: EntryElements) {
  const saver = yield* mountSaver(
    elements,
    () => '',
    () => undefined,
  )

  yield* saver.run(Stream.empty)
})

const mountEntry = (root: HTMLElement) =>
  Option.firstSomeOf([
    Option.map(taskElements(root), mountTasks),
    Option.map(editorElements(root), mountEditor),
    Option.map(entryElements(root), mountTitle),
  ]).pipe(Option.getOrElse(() => Effect.void))

const upload = Effect.fn('upload')(function* (input: HTMLInputElement) {
  const file = Option.fromUndefinedOr(input.files?.[0])
  const label = Option.fromNullishOr(
    input.closest('[data-new]')?.querySelector<HTMLElement>('[data-upload-label]'),
  )

  const setLabel = (text: string) =>
    Effect.sync(() => {
      Option.map(label, (element) => {
        element.textContent = text
      })
    })

  if (Option.isNone(file)) {
    return
  }

  const { presign, register } = yield* uploadEndpoints

  yield* Effect.gen(function* () {
    yield* setLabel('Uploading…')

    const target = yield* presign({})

    yield* putObject(target.url, file.value)

    const created = yield* register({
      payload: {
        key: target.key,
        title: file.value.name,
        mime: mimeOf(file.value),
        bytes: file.value.size,
      },
    })

    yield* Effect.sync(() => {
      window.location.assign(`/e/${created.slug}`)
    })
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.andThen(Effect.logWarning('upload failed', cause), setLabel('Upload failed')),
    ),
  )
})

const mountUpload = (input: HTMLInputElement) =>
  Stream.fromEventListener(input, 'change').pipe(Stream.runForEach(() => upload(input)))

const copyShareUrl = Effect.fn('copyShareUrl')(function* (button: HTMLElement) {
  const url = Option.fromNullishOr(
    button.closest<HTMLElement>('[data-share-url]')?.dataset['shareUrl'],
  )
  const label = Option.fromNullishOr(button.querySelector<HTMLElement>('[data-copy-label]'))

  if (Option.isNone(url)) {
    return
  }

  yield* Effect.promise(() => navigator.clipboard.writeText(url.value)).pipe(
    Effect.andThen(
      Effect.sync(() => {
        Option.map(label, (element) => {
          element.textContent = 'Copied'
        })
      }),
    ),
    Effect.catchCause((cause) => Effect.logWarning('copy failed', cause)),
  )
})

// Hide pills from the end until what's left plus the `+N` pill fits the row.
const foldPills = (fold: HTMLElement) => {
  const pills = Arr.fromIterable(fold.querySelectorAll<HTMLElement>('[data-pill]'))
  const more = fold.querySelector<HTMLElement>('[data-fold-more]')

  pills.forEach((pill) => {
    pill.hidden = false
  })

  if (more === null) {
    return
  }

  more.hidden = true

  for (let hidden = 0; hidden < pills.length && fold.scrollWidth > fold.clientWidth; hidden++) {
    more.hidden = false
    more.textContent = `+${hidden + 1}`
    const pill = pills[pills.length - 1 - hidden]

    if (pill !== undefined) {
      pill.hidden = true
    }
  }
}

const refold = Effect.sync(() => {
  document.querySelectorAll<HTMLElement>('[data-fold]').forEach(foldPills)
})

// Search box over a tag list: typing filters, Enter picks the first hit or creates.
const mountTagMenu = Effect.fn('mountTagMenu')(function* (menu: HTMLElement) {
  const search = menu.querySelector<HTMLInputElement>('[data-tag-search]')
  const createRow = menu.querySelector<HTMLElement>('[data-tag-create-row]')
  const createName = menu.querySelector<HTMLElement>('[data-tag-create-name]')
  const createForm = menu.querySelector<HTMLFormElement>('form[data-tag-create]')

  if (search === null) {
    return
  }

  const rows = () => Arr.fromIterable(menu.querySelectorAll<HTMLElement>('[data-tag-row]'))

  const visibleRows = () => rows().filter((row) => !row.hasAttribute('hidden'))

  const apply = Effect.sync(() => {
    const query = search.value.trim().toLowerCase()
    const wanted = normaliseTag(search.value)
    const exact = rows().some((row) => Option.contains(wanted, row.dataset['tag']))

    rows().forEach((row) => {
      row.hidden = !(row.dataset['tag'] ?? '').includes(query)
    })

    if (createRow !== null && createName !== null) {
      createRow.hidden = exact || Option.isNone(wanted)
      createName.textContent = Option.getOrElse(wanted, () => '')
    }
  })

  const reset = Effect.sync(() => {
    search.value = ''
  }).pipe(Effect.andThen(apply))

  const pick = Effect.sync(() => {
    const first = visibleRows()[0]

    if (first !== undefined) {
      first.click()
    } else if (createRow !== null && !createRow.hasAttribute('hidden') && createForm !== null) {
      createForm.requestSubmit()
    }
  })

  yield* Effect.forkScoped(
    Stream.fromEventListener(search, 'input').pipe(Stream.runForEach(() => apply)),
  )
  // Swallowed in the capture phase, before the browser submits the create form on its own.
  const enters = capture(search, 'keydown', (event) => {
    if (event instanceof KeyboardEvent && event.key === 'Enter') {
      swallow(event)

      return Option.some(undefined)
    }

    return Option.none()
  })

  yield* Effect.forkScoped(Stream.runForEach(enters, () => pick))
  yield* Effect.forkScoped(
    Stream.fromEventListener<ToggleEvent>(menu, 'toggle').pipe(
      Stream.filter((event) => event.newState === 'open'),
      Stream.runForEach(() =>
        Effect.andThen(
          reset,
          Effect.sync(() => {
            search.focus()
          }),
        ),
      ),
    ),
  )
  yield* Effect.forkScoped(
    Stream.fromEventListener(menu, 'click').pipe(
      Stream.filter(
        (event) =>
          event.target instanceof HTMLElement &&
          createRow !== null &&
          createRow.contains(event.target),
      ),
      Stream.runForEach(() => pick),
    ),
  )
  // The checklist is swapped after every toggle; the create form clears after a create.
  yield* Effect.forkScoped(
    Stream.fromEventListener(menu, 'htmx:afterSwap').pipe(Stream.runForEach(() => apply)),
  )

  if (createForm !== null) {
    yield* Effect.forkScoped(
      Stream.fromEventListener(createForm, 'htmx:afterRequest').pipe(
        Stream.runForEach(() => reset),
      ),
    )
  }
})

const mountCopy = (button: HTMLElement) =>
  Stream.fromEventListener(button, 'click').pipe(Stream.runForEach(() => copyShareUrl(button)))

const mountAll = Effect.gen(function* () {
  const roots = yield* Effect.sync(() =>
    Arr.fromIterable(document.querySelectorAll<HTMLElement>('[data-editor]')),
  )
  const uploads = yield* Effect.sync(() =>
    Arr.fromIterable(document.querySelectorAll<HTMLInputElement>('[data-upload]')),
  )
  const copies = yield* Effect.sync(() =>
    Arr.fromIterable(document.querySelectorAll<HTMLElement>('[data-copy]')),
  )
  const palettes = yield* Effect.sync(() =>
    Arr.fromIterable(document.querySelectorAll<HTMLDialogElement>('dialog[data-command]')),
  )
  const tagMenus = yield* Effect.sync(() =>
    Arr.fromIterable(document.querySelectorAll<HTMLElement>('[data-tag-menu]')),
  )

  yield* refold

  yield* Effect.sync(() => {
    document.querySelector<HTMLElement>('[data-share-panel][data-open]')?.showPopover()
  })

  yield* Effect.all(
    [
      Effect.forEach(roots, mountEntry, {
        concurrency: 'unbounded',
        discard: true,
      }),
      Effect.forEach(uploads, mountUpload, {
        concurrency: 'unbounded',
        discard: true,
      }),
      Effect.forEach(copies, mountCopy, {
        concurrency: 'unbounded',
        discard: true,
      }),
      Effect.forEach(palettes, mountCommand, {
        concurrency: 'unbounded',
        discard: true,
      }),
      Effect.forEach(tagMenus, mountTagMenu, {
        concurrency: 'unbounded',
        discard: true,
      }),
    ],
    { concurrency: 'unbounded', discard: true },
  )
})

const overlayOpen = () => document.querySelector(':popover-open, dialog[open]') !== null

const wantsShortcut = (event: KeyboardEvent) =>
  !inField(event.target) && !event.metaKey && !event.ctrlKey && !overlayOpen()

const shortcutKeys = Stream.callback<KeyboardEvent>((queue) => {
  const emit = (event: KeyboardEvent) => {
    if (wantsShortcut(event)) {
      Queue.offerUnsafe(queue, event)
    }
  }

  return Effect.acquireRelease(
    Effect.sync(() => {
      document.addEventListener('keydown', emit)
    }),
    () =>
      Effect.sync(() => {
        document.removeEventListener('keydown', emit)
      }),
  )
})

const shortcuts = Stream.runForEach(shortcutKeys, shortcut)

const main = Effect.gen(function* () {
  const editors = yield* FiberHandle.make()
  const remount = FiberHandle.run(editors, Effect.scoped(mountAll))

  yield* remount
  yield* Effect.forkScoped(shortcuts)
  yield* Effect.forkScoped(
    Stream.fromEventListener(window, 'resize').pipe(Stream.runForEach(() => refold)),
  )
  yield* Effect.forkScoped(
    Stream.fromEventListener(document.body, 'htmx:oobAfterSwap').pipe(
      Stream.runForEach(() => refold),
    ),
  )
  // Only a boosted navigation replaces the page; fragment swaps must not rebuild the editor.
  yield* Stream.fromEventListener<CustomEvent<{ readonly target: Element }>>(
    document.body,
    'htmx:afterSwap',
  ).pipe(
    Stream.filter((event) => event.detail.target === document.body),
    Stream.runForEach(() => remount),
  )
})

const runtime = ManagedRuntime.make(FetchHttpClient.layer)

runtime.runFork(Effect.scoped(main))
