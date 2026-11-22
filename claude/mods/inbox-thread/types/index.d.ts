// /inbox-thread on|off for this session; unset follows the default
// (INBOX_THREAD env, then the off-by-default folders).
export type Mode = 'on' | 'off'

// The thread this session posts to: its name (a short title the small model
// gave it, or `claude · <dir> · <id8>` from before titles and when that call
// fails), the subject its first message opens it with, and the session id it
// belongs to (a /clear or /resume moves on to another).
export type Thread = { name: string; subject: string; session?: string }

declare module 'claude-code' {
  interface PluginState {
    'inbox-thread': {
      mode: Mode
      thread: Thread
    }
  }
}
