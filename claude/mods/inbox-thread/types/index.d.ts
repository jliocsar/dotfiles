// /inbox-thread on|off for this session; unset follows the default
// (INBOX_THREAD env, then the off-by-default folders).
export type Mode = 'on' | 'off'

// The thread this session posts to, once its first message went out.
export type Thread = { name: string; subject: string }

declare module 'claude-code' {
  interface PluginState {
    'inbox-thread': {
      mode: Mode
      thread: Thread
    }
  }
}
