import type { On } from 'claude-code'
import { expect, mock, test, type Engine } from 'claude-code/testing'

const HOME = '/home/test'
const INBOX = 'mcp__plannotator__plannotator_inbox'
const SESSION = 'abcdef12-3456-7890'
const FILES = new Set([`${HOME}/shot.png`, `${HOME}/mock.html`, `${HOME}/.claude/plans/plan.md`])

type World = { env?: Record<string, string>; inbox?: boolean }

// The engine beneath the mod: env, files, the session, plannotator's tool.
const world = (on: On, { env = {}, inbox = true }: World = {}) => {
  const sent: Record<string, unknown>[] = []
  const clock = mock.clock(on)
  mock.env(on, { HOME, ...env })

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
    if (String(e.tool) === INBOX) sent.push({ ...e })
    return { result: 'ok' }
  })

  return { sent, clock }
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
  expect(msg.thread).toBe('claude · app · abcdef12')
  expect(msg.subject).toBe('app: make me a mock page')
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

  expect(sent.map(m => m.thread)).toEqual(['claude · app · abcdef12', 'claude · app · abcdef12'])
  expect(sent.map(m => m.subject)).toEqual(['app: first ask', 'app: first ask'])
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

test('the captain is off by default and /inbox-thread on turns it on', async ($, on) => {
  const { sent, clock } = world(on)
  await start($, `${HOME}/Projects/poormans-captain`)
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

test('the system prompt names the thread, and not when off', async ($, on) => {
  world(on)
  on('prompt.compose', () => ({ sections: [] }))
  await start($)
  const compose = () =>
    $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [INBOX], outputStyle: null, traits: [] })

  const on1 = await compose()
  expect(on1.sections.map(x => x.id)).toEqual(['inbox-thread'])
  expect(on1.sections[0]!.text).toContain('thread: "claude · app · abcdef12"')

  await $.command.run({
    command: 'inbox-thread',
    args: 'off',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect((await compose()).sections).toEqual([])
})
