import type { On } from 'claude-code'
import { expect, mock, test, type Engine } from 'claude-code/testing'

import { cleanTitle } from './post'

const HOME = '/home/test'
const INBOX = 'mcp__plannotator__plannotator_inbox'
const SESSION = 'abcdef12-3456-7890'
const FILES = new Set([`${HOME}/shot.png`, `${HOME}/mock.html`, `${HOME}/.claude/plans/plan.md`])

const TITLE = 'Mock page for checkout'
const LEGACY = 'claude · app · abcdef12'

type World = {
  env?: Record<string, string>
  inbox?: boolean
  // The open threads' names read_thread lists.
  open?: string[]
  // The small model's reply; null: the call fails.
  title?: string | null
  store?: Record<string, unknown>
}

const listing = (names: readonly string[]) =>
  [`${names.length} threads in app.`, ...names.map((n, i) => `- msg_${i} · "subject ${i}" · name "${n}" · quiet · 1 message`)].join('\n')

// The engine beneath the mod: env, files, the session, plannotator's tool,
// the small model.
const world = (on: On, { env = {}, inbox = true, open = [], title = TITLE, store = {} }: World = {}) => {
  const sent: Record<string, unknown>[] = []
  const asked: string[] = []
  const clock = mock.clock(on)
  mock.env(on, { HOME, ...env })
  mock.store(on, store)
  on('model.complete', (_, e) => {
    asked.push(String(e.prompt))
    return {
      value:
        title === null
          ? ({ isAnswered: false, reason: 'empty-reply' } as never)
          : ({ isAnswered: true, text: title, usage: { input_tokens: 1, output_tokens: 1 } } as never),
    }
  })

  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('session.id', () => ({ value: SESSION }))
  on('tool.list', () => ({
    value: inbox ? [{ name: INBOX, description: 'inbox', mcp: true }] : [{ name: 'Bash', description: 'sh', mcp: false }],
  }))
  on('fs.stat', (_, e) => {
    if (!FILES.has(e.path)) throw new Error('ENOENT')
    return { value: { kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false } }
  })
  on('tool.call', (_, e) => {
    const call = e as unknown as Record<string, unknown>
    if (String(e.tool) === INBOX && call.action === 'read_thread') return { result: listing(open) }
    if (String(e.tool) === INBOX) sent.push({ ...call })
    return { result: 'ok' }
  })

  return { sent, asked, clock }
}

const start = ($: Engine, cwd = `${HOME}/Projects/app`) =>
  $.session.start({ cwd, surface: 'terminal', isInteractive: true })

let n = 0

// One main-loop turn: the prompt, the tool calls it made, its answer.
const turn = async (
  $: Engine,
  text: string,
  answer: string,
  calls: Record<string, unknown>[] = [],
  agentId?: string,
) => {
  const turnId = `t${++n}`
  if (!agentId) await $.prompt.submit({ text, origin: { kind: 'composer' }, wait: false })
  await $.turn.start({ text, turnId, ...(agentId ? { agentId } : {}) })
  for (const call of calls) await $.tool.call(call as never)
  await $.turn.complete({
    answer,
    durationMs: 1,
    isAborted: false,
    turnId,
    reason: 'answer',
    ...(agentId ? { agentId } : {}),
  })
}

const ANSWER = `Built the page at ${HOME}/mock.html and the plan is in ~/.claude/plans/plan.md, see /nope/gone.png too.`

test('a typed turn posts its answer, files and prompt to the session thread', async ($, on) => {
  const { sent, clock } = world(on)
  await start($)

  await turn($, 'make me a mock page', ANSWER, [{ tool: 'Write', file_path: `${HOME}/shot.png`, content: '' }])
  await clock.advance(1)

  expect(sent).toHaveLength(1)
  const msg = sent[0]!
  expect(msg.action).toBe('send_message')
  expect(msg.thread).toBe(TITLE)
  expect(msg.subject).toBe(TITLE)
  expect(msg.body).toContain('> make me a mock page')
  expect(msg.body).toContain(ANSWER)
  expect(msg.body).toContain(`![shot.png](${HOME}/shot.png)`)
  expect(msg.attachments).toEqual([`${HOME}/mock.html`, `${HOME}/.claude/plans/plan.md`])
})

test('the second turn goes to the same thread with the first subject', async ($, on) => {
  const { sent, clock } = world(on)
  await start($)

  await turn($, 'first ask', 'a long enough first answer here')
  await turn($, 'second ask', 'a long enough second answer here')
  await clock.advance(1)

  expect(sent.map(m => m.thread)).toEqual([TITLE, TITLE])
  expect(sent.map(m => m.subject)).toEqual([TITLE, TITLE])
})

test('wake prompts, subagents and trivial answers post nothing', async ($, on) => {
  const { sent, clock } = world(on)
  await start($)

  await turn($, '(captain-waiter) wake: check the crew', 'nothing new from the crew, all quiet')
  await turn($, 'look around', 'a subagent report that is long enough', [], 'agent-1')
  await turn($, 'thanks', 'np')
  await clock.advance(1)

  expect(sent).toHaveLength(0)
})

test('a turn where the model already wrote to the inbox posts nothing more', async ($, on) => {
  const { sent, clock } = world(on)
  await start($)

  await turn($, 'tell julio', 'sent it to the inbox for you to read', [
    { tool: INBOX, action: 'send_message', body: 'hi' },
  ])
  await clock.advance(1)

  expect(sent).toHaveLength(1)
  expect(sent[0]!.body).toBe('hi')
})

test('INBOX_THREAD=0 keeps it quiet', async ($, on) => {
  const off = world(on, { env: { INBOX_THREAD: '0' } })
  await start($)
  await turn($, 'do a thing', 'did the thing, all good now')
  await off.clock.advance(1)
  expect(off.sent).toHaveLength(0)
})

test('no plannotator_inbox tool: nothing posts', async ($, on) => {
  const { sent, clock } = world(on, { inbox: false })
  await start($)
  await turn($, 'do a thing', 'did the thing, all good now')
  await clock.advance(1)
  expect(sent).toHaveLength(0)
})

test('the lookout is off by default and /inbox-thread on turns it on', async ($, on) => {
  const { sent, clock } = world(on)
  await start($, `${HOME}/Projects/poormans-captain/lookout`)
  const cmd = (args: string) =>
    $.command.run({
      command: 'inbox-thread',
      args,
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 80 },
    })

  expect((await cmd('')).text).toContain('inbox-thread: off (default)')
  await turn($, 'status?', 'the crew is busy with three tasks')
  await clock.advance(1)
  expect(sent).toHaveLength(0)

  expect((await cmd('on')).text).toBe('inbox-thread on for this session')
  await turn($, 'status?', 'the crew is busy with three tasks')
  await clock.advance(1)
  expect(sent).toHaveLength(1)
})

const COMPOSE = { model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [INBOX], outputStyle: null, traits: [] } as const

const offCmd = ($: Engine) =>
  $.command.run({
    command: 'inbox-thread',
    args: 'off',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })

test('the system prompt says the name is pending, then names the stored thread, and nothing when off', async ($, on) => {
  const { clock } = world(on)
  on('prompt.compose', () => ({ sections: [] }))
  await start($)

  const before = await $.prompt.compose(COMPOSE)
  expect(before.sections.map(x => x.id)).toEqual(['inbox-thread'])
  expect(before.sections[0]!.text).toContain('being named now')

  // The first turn names the thread early, before its answer.
  await $.prompt.submit({ text: 'build the checkout mock page', origin: { kind: 'composer' }, wait: false })
  await $.turn.start({ text: 'build the checkout mock page', turnId: 'early' })
  await clock.advance(1)

  const named = await $.prompt.compose(COMPOSE)
  expect(named.sections[0]!.text).toContain(`thread: "${TITLE}"`)

  await offCmd($)
  expect((await $.prompt.compose(COMPOSE)).sections).toEqual([])
})

test('a title another open thread has gets a suffix', async ($, on) => {
  const { sent, clock } = world(on, { open: ['theme switch', 'mock PAGE for  checkout', `${TITLE} (2)`] })
  await start($)

  await turn($, 'make me a mock page', 'a long enough answer for the post')
  await clock.advance(1)

  expect(sent.map(m => m.thread)).toEqual([`${TITLE} (3)`])
})

test('a failed model call falls back to the old name', async ($, on) => {
  const { sent, clock } = world(on, { title: null })
  await start($)

  await turn($, 'make me a mock page', 'a long enough answer for the post')
  await clock.advance(1)

  expect(sent.map(m => [m.thread, m.subject])).toEqual([[LEGACY, 'app: make me a mock page']])
})

test('a session whose old-style thread is open keeps it, with no model call', async ($, on) => {
  const { sent, asked, clock } = world(on, { open: [LEGACY] })
  await start($)

  await turn($, 'make me a mock page', 'a long enough answer for the post')
  await clock.advance(1)

  expect(sent.map(m => m.thread)).toEqual([LEGACY])
  expect(asked).toEqual([])
})

test('a resume finds its thread in the store, with no model call', async ($, on) => {
  const held = { name: 'Fix the flaky login test', subject: 'Fix the flaky login test', session: SESSION }
  const { sent, asked, clock } = world(on, { store: { [`thread:${SESSION}`]: held } })
  await start($)

  await turn($, 'and now the signup one', 'a long enough answer for the post')
  await clock.advance(1)

  expect(sent.map(m => m.thread)).toEqual([held.name])
  expect(asked).toEqual([])
})

test('a thin first prompt is named with its answer too', async ($, on) => {
  const { sent, asked, clock } = world(on)
  await start($)

  await turn($, 'go', 'built the checkout mock page with three steps')
  await clock.advance(1)

  expect(asked).toHaveLength(1)
  expect(asked[0]).toContain('<reply>\nbuilt the checkout mock page')
  expect(sent.map(m => m.thread)).toEqual([TITLE])
})

test('titles come back as one plain line', async () => {
  expect(cleanTitle('Title: "Fix the flaky login test."\nmore')).toBe('Fix the flaky login test')
  expect(cleanTitle('**Checkout mock page**')).toBe('Checkout mock page')
  expect(cleanTitle('  \n...')).toBeUndefined()
})
