const EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|tiff?|avif)$/i
// A terminal cell's height over its width, and its width in pixels: Ghostty's
// defaults, near enough; the API does not report the cell's pixel size.
const CELL_RATIO = 2.1
const CELL_WIDTH = 9

export const CACHE = '/tmp/claude-images-preview'

export type Probe = { file: string; width: number; height: number }
export type Size = { columns: number; rows: number }
export type Identified = { width: number; height: number; format: string }

export const isImagePath = (path: unknown): path is string =>
  typeof path === 'string' && path.startsWith('/') && EXTENSIONS.test(path)

// `identify -format '%w %h %m\n'` output: the first frame's line.
export function parseIdentify(stdout: string): Identified | null {
  const [width, height, format = ''] = (stdout.split('\n')[0] ?? '').trim().split(' ')
  const size = { width: Number(width), height: Number(height) }

  return size.width > 0 && size.height > 0 ? { ...size, format } : null
}

export async function hash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))

  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// The box of cells that shows the picture whole within the limits, never
// wider than its pixels would take at CELL_WIDTH.
export function fit(image: Probe, maxColumns: number, maxRows: number): Size {
  const aspect = image.height / image.width
  let columns = Math.min(maxColumns, Math.ceil(image.width / CELL_WIDTH))
  let rows = Math.round((columns * aspect) / CELL_RATIO)
  if (rows > maxRows) {
    rows = maxRows
    columns = Math.round((rows * CELL_RATIO) / aspect)
  }

  return { columns: clamp(columns), rows: clamp(rows) }
}

const clamp = (n: number) => Math.max(1, Math.min(255, n))
