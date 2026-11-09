// Each transcript row's images, by the row's tool_use_id.
export type Shown = Record<string, string[]>
// Whether a row's image is expanded, by `<row>:<path>`.
export type Expanded = Record<string, boolean>
// Images a show_image call nested in a codemode run asked for, waiting for that
// run's row: the next codemode row drawn for the first time takes them.
export type Pending = string[]
// The codemode rows drawn so far, by tool_use_id.
export type Seen = Record<string, true>

declare module 'claude-code' {
  interface PluginState {
    'images-preview': {
      shown: Shown
      expanded: Expanded
      pending: Pending
      seen: Seen
    }
  }
}
