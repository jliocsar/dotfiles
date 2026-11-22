import type { EngineInterface, PromptOrigin, Register } from 'claude-code'

import type { Mode, Thread } from '../types'
import {
  MIN_ANSWER,
  TITLE_MODEL,
  TITLE_SYSTEM,
  buildPost,
  candidates,
  cleanTitle,
  isThin,
  isWake,
  normName,
  parseThreadNames,
  sectionPendingText,
  sectionText,
  subjectFor,
  threadNameFor,
  titlePrompt,
  uniqueName,
} from './post'

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
// $.store keys: `thread:<session id>`, so a resume in a new process finds
// its thread ($.state only outlives a hot reload). The oldest go past MAX_STORED.
const STORE_PREFIX = 'thread:'
const MAX_STORED = 300
const LIST_LIMIT = 100
const TITLE_TIMEOUT_MS = 15_000

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
// The session's thread being named (a model call and a thread listing), shared
// by the first turn's early start and its post.
let naming: Promise<Thread> | undefined
let namingStarted = false

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

const isThread = (value: unknown): value is Thread =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Thread).name === 'string' &&
  typeof (value as Thread).subject === 'string'

// This session's thread, once named: $.state, else $.store (a resume in a new
// process). A thread held for another session id (before a /clear) isn't it.
async function heldThread($: EngineInterface): Promise<Thread | undefined> {
  const sessionId = await $.session.id()
  const held = (await $.state.get(THREAD)).value
  if (held && (held.session === undefined || held.session === sessionId)) return held
  const stored = await $.store.get(`${STORE_PREFIX}${sessionId}`)
  if (!isThread(stored)) return undefined
  await $.state.set(THREAD, stored)

  return stored
}

async function saveThread($: EngineInterface, thread: Thread & { session: string }): Promise<void> {
  await $.state.set(THREAD, thread)
  await $.store.set(`${STORE_PREFIX}${thread.session}`, thread)
  const keys = (await $.store.keys()).filter(k => k.startsWith(STORE_PREFIX))
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_STORED))) await $.store.delete(old)
}

// The names of the project's open threads, from any session.
async function openThreadNames($: EngineInterface, tool: McpTool): Promise<string[]> {
  const res = await $.tool.call({ tool, action: 'read_thread', asked_by: 'anyone', limit: LIST_LIMIT })
  if ('deny' in res && res.deny) return []
  const text = typeof res.text === 'string' ? res.text : typeof res.result === 'string' ? res.result : ''

  return parseThreadNames(text)
}

// A 3-6 word title from the small fast model; undefined when it fails.
async function titleFor($: EngineInterface, prompt: string, answer?: string): Promise<string | undefined> {
  const reply = await $.model
    .complete({
      model: TITLE_MODEL,
      system: TITLE_SYSTEM,
      prompt: titlePrompt(prompt, answer),
      maxTokens: 40,
      effort: 'low',
      timeoutMs: TITLE_TIMEOUT_MS,
    })
    .catch(() => null)

  return reply?.isAnswered ? cleanTitle(reply.text) : undefined
}

// The session's thread: an open one under the old `claude · dir · id8` name
// (a session from before titles) keeps it; else a title no open thread has,
// else the old name.
async function nameThread($: EngineInterface, tool: McpTool, prompt: string, answer?: string): Promise<Thread> {
  const session = await $.session.id()
  const legacy = threadNameFor(cwd, session)
  const open = await openThreadNames($, tool).catch(() => [])
  const title = open.some(n => normName(n) === normName(legacy))
    ? undefined
    : await titleFor($, prompt, isThin(prompt) ? answer : undefined)
  const thread = title
    ? { name: uniqueName(title, open), subject: title, session }
    : { name: legacy, subject: subjectFor(cwd, prompt), session }
  await saveThread($, thread)

  return thread
}

async function ensureThread($: EngineInterface, prompt: string, answer?: string): Promise<Thread | undefined> {
  const held = await heldThread($)
  if (held) return held
  const tool = await findInboxTool($)
  if (!tool) return undefined
  naming ??= nameThread($, tool, prompt, answer).finally(() => {
    naming = undefined
  })

  return naming
}

async function post($: EngineInterface, done: Turn, answer: string): Promise<void> {
  const tool = await findInboxTool($)
  if (!tool) return

  const files = await existing($, candidates(answer, done.touched, await $.env.get('HOME')))
  if (answer.trim().length < MIN_ANSWER && files.length === 0) return

  const thread = await ensureThread($, firstPrompt || done.prompt, answer)
  if (!thread) return
  const sessionId = await $.session.id()
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
  }
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

  // A /clear or /resume goes on under another session id: another thread.
  on('session.end', async ($, e, next) => {
    firstPrompt = ''
    namingStarted = false
    turn = undefined
    pending = undefined

    return next(e)
  })

  on('command.run', { command: 'inbox-thread' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') {
      await $.state.set(MODE, arg)

      return { text: `inbox-thread ${arg} for this session` }
    }
    const { mode, why } = await modeOf($)
    const thread = await heldThread($)
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

    // Name the thread while the first turn runs, so the system prompt can name
    // it from the turn's next request. A thin prompt waits for the answer.
    if (!namingStarted && interactive && !turn.skip && firstPrompt && !isThin(firstPrompt)) {
      namingStarted = true
      const prompt = firstPrompt
      $.clock.after(0, async () => {
        if ((await modeOf($)).mode === 'off') return
        await ensureThread($, prompt).catch(() => undefined)
      })
    }

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
  // there. Changes once, when the thread gets its name, and with /inbox-thread.
  on('prompt.compose', async ($, e, next) => {
    const out = await next(e)
    const tool = e.tools.find(isInboxTool)
    if (!interactive || !tool || (await modeOf($)).mode === 'off') return out
    const thread = await heldThread($)
    const text = thread ? sectionText(thread.name) : sectionPendingText()

    return { sections: [...out.sections, { id: 'inbox-thread', scope: 'session', text }] }
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
