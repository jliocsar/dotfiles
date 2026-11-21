import type { EngineInterface, ProcessRunResult, Register } from 'claude-code'

// `/theme light|dark|toggle` runs ~/.local/bin/theme, the machine-wide switch
// (niri crossfade, ghostty, nvim, quickshell, GTK, vicinae, the iPad...).
// Bare `/theme`, or anything else after it, stays Claude's own picker.
//
// The session's colors aren't set here: a mod's `$.config.set` only takes the
// built-in themes, never `custom:*`. The script instead rewrites the custom
// theme file settings.json points at (~/.claude/themes/<family>.json), which
// every running session re-reads on its own, this one included.

const MODES = ['light', 'dark', 'toggle'] as const
type Mode = (typeof MODES)[number]

const isMode = (arg: string): arg is Mode => (MODES as readonly string[]).includes(arg)

// The switch restarts swaybg and reloads ghostty: a few hundred ms, normally.
const TIMEOUT_MS = 15_000

const runTheme = async ($: EngineInterface, args: readonly string[]): Promise<ProcessRunResult> => {
  const home = await $.env.get('HOME')
  const bin = home === undefined ? 'theme' : `${home}/.local/bin/theme`

  return $.process.run([bin, ...args], { timeoutMs: TIMEOUT_MS })
}

// `theme` with no argument prints the current mode.
const currentMode = async ($: EngineInterface) => (await runTheme($, [])).stdout.trim()

const failure = (mode: Mode, result: ProcessRunResult) => {
  const reason = result.stderr.trim() || `exit ${result.exitCode}`

  return `theme ${mode} failed: ${reason}`
}

export const register: Register = on => {
  on('command.describe', { command: 'theme' }, async ($, e, next) =>
    next({
      ...e,
      description: 'Flip the whole machine light/dark, or pick a Claude theme',
      argumentHint: '[light|dark|toggle]',
    }),
  )

  on('command.run', { command: 'theme' }, async ($, e, next) => {
    const arg = e.args.trim().toLowerCase()
    if (!isMode(arg)) {
      return next(e)
    }

    const before = await currentMode($)
    const result = await runTheme($, [arg])
    if (result.exitCode !== 0) {
      return { text: failure(arg, result) }
    }

    const after = await currentMode($)

    return { text: before === after ? `already ${after}` : `${before} → ${after}` }
  }).catch(($, e, next) =>
    next.called ? next(e) : { text: `theme ${e.args.trim()}: the theme script didn't run` },
  )
}
