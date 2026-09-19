import { Icon } from './Icon.tsx'

// The whole dialog (backdrop included) accepts drops; `data-over` on it lights the box up.
const DROPZONE = [
  'flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed',
  'text-muted-foreground transition-colors hover:bg-muted group-data-over:border-foreground group-data-over:bg-muted',
  'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
].join(' ')

export const UploadDialog = () => (
  <dialog id="upload" class="dialog group" aria-labelledby="upload-title" data-upload>
    <div class="sm:max-w-sm">
      <header>
        <h2 id="upload-title">Upload artifacts</h2>
      </header>
      <section>
        <label class={DROPZONE}>
          <input type="file" multiple class="sr-only" />
          <Icon name="upload" class="size-5" />
          <span data-upload-label>Drop files here, or click to browse</span>
        </label>
      </section>
      <button
        type="button"
        class="btn"
        data-variant="ghost"
        data-size="icon-sm"
        aria-label="Close"
        command="close"
        commandfor="upload"
      >
        <Icon name="x" />
      </button>
    </div>
  </dialog>
)
