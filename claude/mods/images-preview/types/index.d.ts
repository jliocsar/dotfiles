// Each transcript row's images, by the row's tool_use_id.
export type Shown = Record<string, string[]>
// Whether a row's image is expanded, by `<row>:<path>`.
export type Expanded = Record<string, boolean>

declare module 'claude-code' {
  interface PluginState {
    'images-preview': {
      shown: Shown
      expanded: Expanded
    }
  }
}
