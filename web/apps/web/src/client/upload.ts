import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Ref from 'effect/Ref'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'
import * as HttpBody from 'effect/unstable/http/HttpBody'
import * as HttpClient from 'effect/unstable/http/HttpClient'
import * as HttpClientResponse from 'effect/unstable/http/HttpClientResponse'
import * as HttpApiClient from 'effect/unstable/httpapi/HttpApiClient'

import { Api } from '../api.ts'
import type { PresignTarget, RegisterFile } from '../api.ts'

interface UploadElements {
  readonly dialog: HTMLDialogElement
  readonly input: HTMLInputElement
  readonly label: HTMLElement
}

interface ToastConfig {
  readonly category: 'warning' | 'error'
  readonly title: string
  readonly description: string
}

interface Toaster extends HTMLElement {
  readonly toast: (config: ToastConfig) => HTMLElement
}

// What the page after the reload tells the user about; the list itself shows the successes.
const UploadReport = Schema.Struct({
  skipped: Schema.Array(Schema.String),
  failed: Schema.Array(Schema.String),
})

type UploadReport = typeof UploadReport.Type

const ReportJson = Schema.fromJsonString(UploadReport)

const REPORT_KEY = 'upload-report'

const PUT_CONCURRENCY = 4

const FALLBACK_MIME = 'application/octet-stream'

const IDLE_LABEL = 'Drop files here, or click to browse'

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

const mimeOf = (file: File) => (file.type === '' ? FALLBACK_MIME : file.type)

const putObject = (url: string, file: File) =>
  HttpClient.put(url, {
    body: HttpBody.raw(file, { contentType: mimeOf(file) }),
  }).pipe(Effect.flatMap(HttpClientResponse.filterStatusOk))

const uploadElements = (dialog: HTMLDialogElement): Option.Option<UploadElements> =>
  Option.all({
    input: Option.fromNullOr(dialog.querySelector<HTMLInputElement>('input[type="file"]')),
    label: Option.fromNullOr(dialog.querySelector<HTMLElement>('[data-upload-label]')),
  }).pipe(Option.map((found) => ({ dialog, ...found })))

// First of each name wins; the server treats the name as the identity.
const uniqueByName = (files: FileList | null | undefined): readonly File[] =>
  Arr.dedupeWith(Arr.fromIterable(files ?? []), (left, right) => left.name === right.name)

const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') === true

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

const putTarget = (target: typeof PresignTarget.Type, byName: ReadonlyMap<string, File>) =>
  Option.match(Option.fromUndefinedOr(byName.get(target.title)), {
    onNone: () => Effect.fail(target.title),
    onSome: (file) =>
      putObject(target.url, file).pipe(
        Effect.as<typeof RegisterFile.Type>({
          key: target.key,
          title: target.title,
          mime: mimeOf(file),
          bytes: file.size,
        }),
        Effect.tapCause((cause) => Effect.logWarning('put failed', cause)),
        Effect.mapError(() => target.title),
      ),
  })

// Names that already exist never cost a byte: presign refuses them before any PUT.
const upload = Effect.fn('upload')(function* (files: readonly File[]) {
  const { presign, register } = yield* uploadEndpoints
  const byName = new Map(files.map((file) => [file.name, file] as const))
  const granted = yield* presign({ payload: { titles: files.map((file) => file.name) } })
  const [failed, stored] = yield* Effect.partition(
    granted.targets,
    (target) => putTarget(target, byName),
    { concurrency: PUT_CONCURRENCY },
  )
  const registered =
    stored.length === 0 ? { skipped: [] } : yield* register({ payload: { files: stored } })

  return {
    skipped: [...granted.skipped, ...registered.skipped],
    failed,
  } satisfies UploadReport
})

const stashReport = (report: UploadReport) =>
  Effect.flatMap(Effect.orDie(Schema.encodeEffect(ReportJson)(report)), (json) =>
    Effect.sync(() => {
      sessionStorage.setItem(REPORT_KEY, json)
      window.location.reload()
    }),
  )

export const mountUpload = Effect.fn('mountUpload')(function* (dialog: HTMLDialogElement) {
  const elements = uploadElements(dialog)

  if (Option.isNone(elements)) {
    return
  }

  const { input, label } = elements.value
  const busy = yield* Ref.make(false)
  // dragenter/dragleave fire for every child crossed; only the balance says "left the window".
  const dragDepth = yield* Ref.make(0)

  const setLabel = (text: string) =>
    Effect.sync(() => {
      label.textContent = text
    })

  const start = (files: readonly File[]) =>
    Effect.gen(function* () {
      const already = yield* Ref.getAndSet(busy, true)

      if (already || files.length === 0) {
        return
      }

      yield* setLabel(`Uploading ${plural(files.length, 'file')}…`)
      yield* upload(files).pipe(
        Effect.flatMap(stashReport),
        Effect.catchCause((cause) =>
          Effect.all([
            Effect.logWarning('upload failed', cause),
            setLabel('Upload failed'),
            Ref.set(busy, false),
          ]),
        ),
      )
    })

  const setOver = (over: boolean) =>
    Effect.sync(() => {
      if (over) {
        dialog.dataset['over'] = ''
      } else {
        delete dialog.dataset['over']
      }
    })

  const entered = Effect.gen(function* () {
    const depth = yield* Ref.updateAndGet(dragDepth, (current) => current + 1)

    yield* setOver(true)

    if (depth === 1 && !dialog.open) {
      dialog.showModal()
    }
  })

  const left = Effect.gen(function* () {
    const depth = yield* Ref.updateAndGet(dragDepth, (current) => Math.max(0, current - 1))

    if (depth === 0) {
      yield* setOver(false)

      if (dialog.open && !(yield* Ref.get(busy))) {
        dialog.close()
      }
    }
  })

  const dropped = Effect.andThen(Ref.set(dragDepth, 0), setOver(false))

  yield* Effect.forkScoped(
    Stream.fromEventListener(input, 'change').pipe(
      Stream.runForEach(() => start(uniqueByName(input.files))),
    ),
  )
  yield* Effect.forkScoped(
    Stream.fromEventListener<DragEvent>(document, 'dragenter').pipe(
      Stream.filter(carriesFiles),
      Stream.runForEach(() => entered),
    ),
  )
  yield* Effect.forkScoped(
    Stream.fromEventListener<DragEvent>(document, 'dragleave').pipe(
      Stream.filter(carriesFiles),
      Stream.runForEach(() => left),
    ),
  )
  // Unhandled, the browser would navigate to the dropped file.
  yield* Effect.forkScoped(
    Stream.fromEventListener<DragEvent>(document, 'dragover').pipe(
      Stream.runForEach((event) =>
        Effect.sync(() => {
          event.preventDefault()
        }),
      ),
    ),
  )
  // The open dialog is modal, so every drop on the page lands here (backdrop included).
  yield* Effect.forkScoped(
    Stream.fromEventListener<DragEvent>(document, 'drop').pipe(
      Stream.runForEach((event) =>
        Effect.gen(function* () {
          event.preventDefault()
          yield* dropped

          if (dialog.open) {
            yield* start(uniqueByName(event.dataTransfer?.files))
          }
        }),
      ),
    ),
  )
  yield* Stream.fromEventListener(dialog, 'close').pipe(
    Stream.runForEach(() =>
      Effect.sync(() => {
        input.value = ''
      }).pipe(Effect.andThen(setLabel(IDLE_LABEL))),
    ),
  )
})

const isToaster = (element: HTMLElement): element is Toaster =>
  Predicate.hasProperty(element, 'toast') && Predicate.isFunction(element.toast)

// Basecoat attaches `toast()` after DOMContentLoaded, which is after this module runs.
const toaster = Effect.callback<Option.Option<Toaster>>((resume) => {
  const element = document.getElementById('toaster')

  if (element === null) {
    resume(Effect.succeed(Option.none()))
  } else if (isToaster(element)) {
    resume(Effect.succeed(Option.some(element)))
  } else {
    element.addEventListener(
      'basecoat:initialized',
      () => {
        resume(Effect.succeed(Option.fromNullOr(isToaster(element) ? element : null)))
      },
      { once: true },
    )
  }
})

const takeReport = Effect.sync(() => {
  const raw = sessionStorage.getItem(REPORT_KEY)

  sessionStorage.removeItem(REPORT_KEY)

  return Option.fromNullOr(raw).pipe(Option.flatMap(Schema.decodeUnknownOption(ReportJson)))
})

// Shown on the page that follows an upload: the reload that refreshes the list would eat a toast.
export const reportUploads = Effect.gen(function* () {
  const report = yield* takeReport

  if (Option.isNone(report)) {
    return
  }

  const target = yield* toaster

  if (Option.isNone(target)) {
    return
  }

  const { skipped, failed } = report.value

  if (skipped.length > 0) {
    target.value.toast({
      category: 'warning',
      title: `Skipped ${plural(skipped.length, 'file')}, already exists`,
      description: skipped.join(', '),
    })
  }

  if (failed.length > 0) {
    target.value.toast({
      category: 'error',
      title: `Upload failed for ${plural(failed.length, 'file')}`,
      description: failed.join(', '),
    })
  }
})
