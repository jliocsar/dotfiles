import type { EngineInterface, PromptOrigin, Register } from 'claude-code'

import type { Mode, Thread } from '../types'
import { MIN_ANSWER, buildPost, candidates, isWake, sectionText, subjectFor, threadNameFor } from './post'

// One Plannotator Inbox thread per Claude session: each main-loop answer goes
// there, with the images, plans and HTML the turn made or named. julio's
// replies come back by plannotator's own wake; nothing here reads the inbox.
//
// Off: INBOX_THREAD=0 (everywhere), `/inbox-thread off` (this session), a
// `-p` run, a session with no plannotator_inbox tool, or a folder in
// OFF_BY_DEFAULT (INBOX_THREAD=1 or `/inbox-thread on` turns it on there).

const MODE = { plugin: 'inbox-thread', key: 'mode' } as const
const THREAD = { plugin: 'inbox-thread', key: 'thread' } as const

const INBOX_TOOL = 'plannotator_inbox'
const KEY_PREFIX = 'inbox-thread:'

// Under $HOME. The lookout loops on its own: it would flood the inbox. The
// captain stays on: its waiter wakes are plugin prompts, skipped below, so
// only julio's own chats post (julio, 22 Nov). poormans-capitain is a
// symlink to the same repo.
const OFF_BY_DEFAULT = ['/Projects/poormans-captain/lookout', '/Projects/poormans-capitain/lookout']

// Sources whose turns aren't worth a post. A plugin's prompt stays when it
// was sent as the person's own words, or by plannotator (julio's reply).
const skipOrigin = (origin: PromptOrigin | undefined) =>
  origin?.kind === 'scheduled-trigger' ||
  (origin?.kind === 'plugin' && !origin.asUser && origin.name !== 'plannotator')

// A person typed it: the post quotes it.
const quoteOrigin = (origin: PromptOrigin | undefined) =>
  origin === undefined || origin.kind === 'composer' || origin.kind === 'bridge'

type Turn = {
  id: string
  prompt: string
  origin: PromptOrigin | undefined
  skip: boolean
  touched: string[]
  sentByModel: boolean
}

const strings = (value: unknown): string[] =>
  typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter(v => typeof v === 'string') : []

// Module state: one session per module load. A reload starts it over, which
// at worst drops one in-flight turn's post.
let interactive = false
let cwd = ''
// The next idle prompt's origin and wake flag, taken by the turn it starts.
let pending: { origin: PromptOrigin; wake: boolean } | undefined
let turn: Turn | undefined
let firstPrompt = ''
// `mcp__<server>__plannotator_inbox` once found; plannotator registers it in
// its own session.start, so it is looked up when first needed.
let inboxTool: McpTool | undefined

async function defaultMode($: EngineInterface): Promise<Mode> {
  const env = (await $.env.get('INBOX_THREAD'))?.trim()
  if (env === '0' || env === 'off') return 'off'
  if (env === '1' || env === 'on') return 'on'
  const home = await $.env.get('HOME')
  const off = OFF_BY_DEFAULT.some(
    dir => home !== undefined && (cwd === home + dir || cwd.startsWith(`${home}${dir}/`)),
  )

  return off ? 'off' : 'on'
}

async function modeOf($: EngineInterface): Promise<{ mode: Mode; why: string }> {
  const { value } = await $.state.get(MODE)
  if (value) return { mode: value, why: '/inbox-thread' }

  return { mode: await defaultMode($), why: 'default' }
}

type McpTool = `mcp__${string}__${string}`

const isInboxTool = (name: string): name is McpTool => name.startsWith('mcp__') && name.endsWith(`__${INBOX_TOOL}`)

async function findInboxTool($: EngineInterface): Promise<McpTool | undefined> {
  if (!inboxTool) {
    inboxTool = (await $.tool.list()).map(t => t.name).find(isInboxTool)
  }

  return inboxTool
}

async function existing($: EngineInterface, paths: readonly string[]): Promise<string[]> {
  const found: string[] = []
  for (const path of paths) {
    const stat = await $.fs.stat(path).catch(() => null)
    if (stat?.kind === 'file') found.push(path)
  }

  return found
}

async function post($: EngineInterface, done: Turn, answer: string): Promise<void> {
  const tool = await findInboxTool($)
  if (!tool) return

  const files = await existing($, candidates(answer, done.touched, await $.env.get('HOME')))
  if (answer.trim().length < MIN_ANSWER && files.length === 0) return

  const sessionId = await $.session.id()
  const held = (await $.state.get(THREAD)).value
  const name = threadNameFor(cwd, sessionId)
  const thread: Thread =
    held?.name === name ? held : { name, subject: subjectFor(cwd, firstPrompt || done.prompt) }
  const { body, attachments } = buildPost(answer, quoteOrigin(done.origin) ? done.prompt : undefined, files)

  const res = await $.tool.call({
    tool,
    action: 'send_message',
    thread: thread.name,
    subject: thread.subject,
    body,
    ...(attachments.length > 0 ? { attachments } : {}),
    idempotency_key: `${KEY_PREFIX}${sessionId}:${done.id}`,
  })
  if ('deny' in res && res.deny) {
    $.ui.toast(`inbox-thread: not posted (${res.deny.slice(0, 120)})`)
    return
  }
  if (res.isError) {
    $.ui.toast(`inbox-thread: post failed (${(res.text ?? '').slice(0, 120)})`)
    return
  }
  if (held?.name !== name) await $.state.set(THREAD, thread)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    interactive = e.isInteractive
    cwd = e.cwd
    await $.command.register({
      name: 'inbox-thread',
      description: "Turn posting this session's answers to the Plannotator Inbox on or off",
      argumentHint: '[on|off|status]',
    })

    return next(e)
  })

  on('command.run', { command: 'inbox-thread' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') {
      await $.state.set(MODE, arg)

      return { text: `inbox-thread ${arg} for this session` }
    }
    const { mode, why } = await modeOf($)
    const thread = (await $.state.get(THREAD)).value
    const tool = await findInboxTool($)

    return {
      text: [
        `inbox-thread: ${mode} (${why})`,
        tool ? '' : 'no plannotator_inbox tool in this session: nothing gets posted',
        thread ? `thread: ${thread.name}` : 'no thread yet',
      ]
        .filter(Boolean)
        .join('\n'),
    }
  })

  on('prompt.submit', async ($, e, next) => {
    const out = await next(e)
    // Only an idle prompt starts a turn of its own; one typed over a running
    // turn folds into it.
    if (e.turnId === undefined && !('drop' in out && out.drop)) {
      pending = { origin: e.origin, wake: isWake(e.text) }
    }

    return out
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const from = pending
    pending = undefined
    turn = {
      id: e.turnId,
      prompt: e.text,
      origin: from?.origin,
      skip: (from?.wake ?? false) || isWake(e.text) || skipOrigin(from?.origin),
      touched: [],
      sentByModel: false,
    }
    if (!firstPrompt && quoteOrigin(from?.origin) && e.text.trim()) firstPrompt = e.text

    return next(e)
  })

  // The turn's files, and whether the model already wrote to the inbox itself.
  on('tool.call', async ($, e, next) => {
    if (turn && e.agentId === undefined) {
      const args = e as unknown as Record<string, unknown>
      const name = String(e.tool)
      if (name.endsWith(INBOX_TOOL)) {
        const key = typeof args.idempotency_key === 'string' ? args.idempotency_key : ''
        if (args.action === 'send_message' && !key.startsWith(KEY_PREFIX)) turn.sentByModel = true
      } else {
        turn.touched.push(...strings(args.file_path), ...strings(args.paths))
      }
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // Tells the model which thread is this session's, so its own sends land
  // there. Steady per session (it is cached): changes only with /inbox-thread.
  on('prompt.compose', async ($, e, next) => {
    const out = await next(e)
    const tool = e.tools.find(isInboxTool)
    if (!interactive || !tool || (await modeOf($)).mode === 'off') return out
    const name = threadNameFor(cwd, await $.session.id())

    return { sections: [...out.sections, { id: 'inbox-thread', scope: 'session', text: sectionText(name) }] }
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    if (e.agentId !== undefined || !turn || turn.id !== e.turnId) return out
    const done = turn
    turn = undefined

    if (!interactive || done.skip || done.sentByModel || e.reason !== 'answer') return out
    if ((await modeOf($)).mode === 'off') return out

    // Off the turn's path: the next prompt never waits on the inbox.
    $.clock.after(0, async () => {
      try {
        await post($, done, e.answer)
      } catch (err) {
        $.ui.toast(`inbox-thread: post failed (${String(err).slice(0, 120)})`)
      }
    })

    return out
  })
}
