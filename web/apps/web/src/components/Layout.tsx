import { raw } from '@dotfiles/jsx'
import type { Node } from '@dotfiles/jsx'

import { Icon } from './Icon.tsx'

const THEME_BOOT = `(() => {
  try {
    const stored = localStorage.getItem('themeMode')
    if (stored ? stored === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark')
    }
  } catch (_) {}
  // Installed, the strip behind the status bar is painted from theme-color,
  // so it follows --background instead of drifting from the page under it.
  const paint = () => {
    document.querySelector('meta[name="theme-color"]').content = getComputedStyle(
      document.documentElement,
    ).getPropertyValue('--background').trim()
  }
  document.addEventListener('basecoat:themechange', paint)
  addEventListener('DOMContentLoaded', paint)
})()`

// Server-side "today" and default titles use this zone; first visit reloads once to apply it.
const ZONE_BOOT = `(() => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const current = document.cookie.match(/(?:^|; )tz=([^;]*)/)?.[1]
  if (current !== zone) {
    document.cookie = 'tz=' + zone + '; path=/; max-age=31536000; samesite=lax; secure'
    if (current === undefined) location.reload()
  }
})()`

const HTMX_CONFIG = '{"historyCacheSize":0}'

export const ThemeToggle = () => (
  <button
    type="button"
    class="btn"
    data-variant="ghost"
    data-size="icon"
    aria-label="Toggle dark mode"
    onclick="window.basecoat.theme.toggle()"
  >
    <span class="hidden dark:block">
      <Icon name="sun" class="size-4" />
    </span>
    <span class="block dark:hidden">
      <Icon name="moon" class="size-4" />
    </span>
  </button>
)

const CommandPalette = () => (
  <dialog class="command-dialog" data-command aria-label="Command menu">
    <div class="command" data-command-initialized>
      <div class="command-slab">
        <header>
          <Icon name="search" />
          <input
            type="text"
            placeholder="Search or jump to…"
            autocomplete="off"
            spellcheck="false"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
          />
        </header>
        <div class="command-scopes" data-scopes />
      </div>
      <div role="menu" aria-orientation="vertical" data-menu />
      <footer>
        <span>
          <kbd>↑↓</kbd>move
        </span>
        <span>
          <kbd>↵</kbd>open
        </span>
        <span>
          <kbd>esc</kbd>close
        </span>
      </footer>
    </div>
  </dialog>
)

export const Layout = (props: {
  readonly title: string
  readonly guest?: boolean
  readonly children?: Node
}) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="htmx-config" content={HTMX_CONFIG} />
      <meta name="theme-color" content="#0f0f0f" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <title>{props.title}</title>
      <link rel="icon" type="image/png" href="/assets/icons/favicon.png" />
      <link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png" />
      <link rel="manifest" href="/assets/manifest.webmanifest" />
      <script>{raw(THEME_BOOT)}</script>
      <script>{raw(ZONE_BOOT)}</script>
      <link rel="stylesheet" href="/assets/app.css" />
      <script src="/vendor/htmx/htmx.min.js" defer />
      <script src="/vendor/basecoat/basecoat.min.js" defer />
      <script src="/vendor/basecoat/tabs.min.js" defer />
      <script src="/assets/editor.js" type="module" />
    </head>
    <body class="text-[13px] antialiased" hx-boost="true">
      {props.children}
      {props.guest === true ? null : <CommandPalette />}
    </body>
  </html>
)
