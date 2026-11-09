import type { EngineInterface, Register } from 'claude-code'

const GO = 'go'

// set by /handoff-compact, consumed by the next main-loop turn.complete.
// module var on purpose: a reload mid-flow just drops the pending compact.
let pending: { topic: string } | undefined

const handoffPrompt = (topic: string) =>
  `I'll compact this conversation. Write a handoff so next we can continue on ${topic || 'what we were doing'}`

const compactThenGo = ($: EngineInterface, instructions?: string) =>
  $.clock.after(0, () => {
    void (async () => {
      try {
        const res = await $.session.compact(instructions ? { instructions } : undefined)
        if ('skip' in res && res.skip) {
          $.ui.toast(`compact skipped: ${String(res.skip)}`)
          return
        }
        await $.prompt.submit({ text: GO, asUser: true })
      } catch (err) {
        $.ui.toast(`compact-go failed: ${String(err)}`)
      }
    })()
  })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'compact-go',
      description: 'Compact the conversation, then send "go"',
      argumentHint: '[compact instructions]',
    })
    await $.command.register({
      name: 'handoff-compact',
      description: 'Write a handoff, compact, then send "go"',
      argumentHint: '<what to continue on>',
    })
    return next(e)
  })

  on('command.run', { command: 'compact-go' }, async ($, e) => {
    compactThenGo($, e.args.trim() || undefined)
    return { text: 'compacting, then go.' }
  })

  on('command.run', { command: 'handoff-compact' }, async ($, e) => {
    const topic = e.args.trim()
    pending = { topic }
    $.ui.status('handoff → compact → go')
    $.clock.after(0, () => {
      void (async () => {
        // prefer the real /handoff skill if it's installed, else a plain prompt
        const hasHandoff = (await $.command.list()).some(c => c.name === 'handoff')
        try {
          if (hasHandoff) {
            await $.command.run({ command: 'handoff', args: handoffPrompt(topic) })
            return
          }
        } catch {
          // fall through to the plain prompt
        }
        await $.prompt.submit({ text: handoffPrompt(topic), asUser: true })
      })()
    })
    return { text: `writing handoff${topic ? ` for: ${topic}` : ''}, then compact + go.` }
  })

  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    if (e.agentId !== undefined || !pending) return out

    const { topic } = pending
    pending = undefined
    $.ui.status(undefined)

    if (e.reason !== 'answer') {
      $.ui.toast(`handoff turn ended (${e.reason}), not compacting`)
      return out
    }

    compactThenGo($, topic ? `keep the handoff for: ${topic}` : 'keep the handoff verbatim')
    return out
  })
}
