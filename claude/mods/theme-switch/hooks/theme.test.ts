import type { On } from 'claude-code'
import { expect, test, type Engine } from 'claude-code/testing'

const BIN = '/home/test/.local/bin/theme'

// A fake ~/.local/bin/theme: no argument prints the mode, a mode sets it.
const fakeTheme = (on: On, start: 'dark' | 'light') => {
  let mode = start
  const calls: string[][] = []

  on('env.get', () => ({ value: '/home/test' }))
  on('process.run', (_, e) => {
    calls.push([...e.argv])
    const [bin, arg] = e.argv
    const done = (exitCode: number, stdout: string, stderr = '') => ({
      value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
    })

    if (bin !== BIN) {
      return done(127, '', 'not found')
    }
    if (arg === 'toggle') {
      mode = mode === 'dark' ? 'light' : 'dark'
    } else if (arg === 'dark' || arg === 'light') {
      mode = arg
    }

    return done(0, arg === undefined ? `${mode}\n` : '')
  })

  return { calls }
}

const ORIGIN = { kind: 'composer' } as const
const PRESENTATION = { isFullscreen: false, columns: 80 }

const runTheme = ($: Engine, args: string) =>
  $.command.run({ command: 'theme', args, origin: ORIGIN, presentation: PRESENTATION })

test('/theme light flips the machine', async ($, on) => {
  const { calls } = fakeTheme(on, 'dark')

  const { text } = await runTheme($, 'light')

  expect(text).toBe('dark → light')
  expect(calls).toContainEqual([BIN, 'light'])
})

test('/theme toggle reports the new mode', async ($, on) => {
  fakeTheme(on, 'light')

  const { text } = await runTheme($, ' Toggle ')

  expect(text).toBe('light → dark')
})

test('/theme dark when already dark says so', async ($, on) => {
  fakeTheme(on, 'dark')

  const { text } = await runTheme($, 'dark')

  expect(text).toBe('already dark')
})

test('bare /theme falls through to the picker', async ($, on) => {
  const { calls } = fakeTheme(on, 'dark')
  on('command.run', () => ({ text: 'picker' }))

  const { text } = await runTheme($, '')

  expect(text).toBe('picker')
  expect(calls).toEqual([])
})
