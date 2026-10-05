import { atom, read, update } from 'claude-code'
import type {
  Elements,
  EngineInterface,
  RenderInputOf,
  RenderElement,
  RenderNode,
  RenderViewport,
  Register,
} from 'claude-code'

import { CACHE, fit, hash, isImagePath, parseIdentify } from './image'
import type { Probe } from './image'
import type { Expanded, Shown } from '../types'

const shown = atom({ plugin: 'images-preview', key: 'shown' } as const, {} as Shown)
const expanded = atom({ plugin: 'images-preview', key: 'expanded' } as const, {} as Expanded)

const TOOL = 'mcp__images-preview__show_image'
const CODEMODE = 'mcp__codemode__run'
const THUMB_COLUMNS = 40
const THUMB_ROWS = 16

const probes = new Map<string, Promise<Probe | null>>()

export const register: Register = on => {
  // The codemode run whose nested calls are running now: a show_image call
  // made inside it draws under that run's row, the only one the transcript has.
  let codemodeRun: string | undefined

  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'show_image',
      description:
        'Show image files to the user inline in the terminal transcript (PNG, JPG, GIF, WebP, ' +
        'BMP, TIFF, AVIF). Use it whenever an image is worth looking at: a screenshot taken, ' +
        'a chart or diagram rendered, an image the user asks to see. It only displays; ' +
        'it does not return the pixels to you.',
      inputSchema: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            description: 'Image file paths, absolute or relative to the working directory',
          },
        },
        required: ['paths'],
      },
    })

    return next(e)
  })

  on('tool.call', { tool: CODEMODE }, async ($, e, next) => {
    codemodeRun = e.tool_use_id
    try {
      return await next(e)
    } finally {
      if (codemodeRun === e.tool_use_id) {
        codemodeRun = undefined
      }
    }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const requested = (e as { paths?: unknown }).paths
    const paths = Array.isArray(requested) ? requested.filter(p => typeof p === 'string') : []
    if (paths.length === 0) {
      return { deny: '`paths` must be a non-empty array of image file paths' }
    }

    const found: string[] = []
    const missing: string[] = []
    for (const path of paths) {
      const stat = await $.fs.stat(path, { resolve: true }).catch(() => null)
      const real = stat?.kind === 'file' ? stat.realPath : undefined
      if (isImagePath(real)) {
        found.push(real)
      } else {
        missing.push(path)
      }
    }

    const row = codemodeRun ?? e.tool_use_id
    if (found.length > 0) {
      await update($, shown, all => ({ ...all, [row]: [...(all[row] ?? []), ...found] }))
      // DIAGNOSTIC: a blit onto the drawn Image says why it shows its alt.
      const first = found[0] as string
      $.clock.after(1500, async () => {
        const image = await probe($, first)
        if (!image) {
          $.ui.toast('images-preview: no probe result')
          return
        }
        const blitted = await $.ui.blit({
          requestId: row,
          key: 'pic-0',
          source: { file: image.file, format: 'png' },
        })
        $.ui.toast(`images-preview blit: ${blitted.deny ?? 'taken (pixels should show)'}`)
      })
    }

    return {
      result: [
        found.length > 0 && `Shown inline to the user: ${found.join(', ')}`,
        missing.length > 0 && `Not an image file or not found: ${missing.join(', ')}`,
      ]
        .filter(Boolean)
        .join('\n'),
    }
  })

  on('ui.render', { component: 'ToolResult', props: { tool: TOOL } }, async ($, e, next) =>
    e.surface === 'terminal' ? drawRow($, e, await next(e)) : next(e),
  )

  on('ui.render', { component: 'ToolResult', props: { tool: CODEMODE } }, async ($, e, next) =>
    e.surface === 'terminal' ? drawRow($, e, await next(e)) : next(e),
  )
}

async function drawRow(
  $: EngineInterface,
  e: RenderInputOf<'ToolResult', 'terminal'>,
  core: RenderElement,
) {
  const files = (await read($, shown))[e.props.tool_use_id]
  if (!files || files.length === 0) {
    return core
  }

  return previews($, $.ui.resolve(e), e.props.tool_use_id, e.viewport, core, files)
}

async function previews(
  $: EngineInterface,
  ui: Elements['terminal'],
  site: string,
  viewport: RenderViewport | undefined,
  core: RenderElement,
  files: readonly string[],
) {
  const { Box, Button, Image } = ui
  const open = await read($, expanded)
  const width = Math.max(10, (viewport?.columns ?? 100) - 6)
  const height = Math.max(5, (viewport?.rows ?? 40) - 6)
  const drawn: RenderNode[] = []

  for (const [i, path] of files.entries()) {
    const image = await probe($, path)
    if (!image) {
      continue
    }
    const id = `${site}:${path}`
    const size = open[id]
      ? fit(image, width, height)
      : fit(image, Math.min(THUMB_COLUMNS, width), THUMB_ROWS)

    // A Button holds a label alone, so the toggle sits under the picture.
    drawn.push(
      <Box key={`image-${i}`} flexDirection="column">
        <Image
          key={`pic-${i}`}
          source={{ file: image.file, format: 'png' }}
          columns={size.columns}
          rows={size.rows}
          alt={path}
        />
        <Button
          key={`toggle-${i}`}
          plain
          dimColor
          label={open[id] ? '⤡ shrink' : '⤢ expand'}
          onPress={() => update($, expanded, all => ({ ...all, [id]: !all[id] }))}
        />
      </Box>,
    )
  }

  return (
    <Box flexDirection="column">
      {core}
      {drawn}
    </Box>
  )
}

// The picture at `path` as a PNG the terminal can read, and its pixel size;
// other formats are converted once per path and mtime into CACHE.
async function probe($: EngineInterface, path: string): Promise<Probe | null> {
  const stat = await $.fs.stat(path).catch(() => null)
  if (!stat || stat.kind !== 'file') {
    return null
  }

  const key = `${path}:${stat.mtimeMs}`
  let found = probes.get(key)
  if (!found) {
    found = load($, path, key).catch(() => null)
    probes.set(key, found)
  }

  return found
}

async function load($: EngineInterface, path: string, key: string): Promise<Probe | null> {
  const identified = await $.process.run(['identify', '-format', '%w %h %m\n', `${path}[0]`])
  const image = identified.exitCode === 0 ? parseIdentify(identified.stdout) : null
  if (!image) {
    return null
  }
  if (image.format === 'PNG') {
    return { file: path, width: image.width, height: image.height }
  }

  const file = `${CACHE}/${await hash(key)}.png`
  await $.process.run(['mkdir', '-p', CACHE])
  const converted = await $.process.run(['convert', `${path}[0]`, file])

  return converted.exitCode === 0 ? { file, width: image.width, height: image.height } : null
}
