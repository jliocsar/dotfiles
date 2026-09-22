// Home's calendar, stale-while-revalidate: paint today's last fetched calendar right away,
// then fetch fresh HTML over it and cache that for the next visit.

declare const htmx: {
  ajax(verb: 'GET', path: string, context: { target: Element; swap: 'innerHTML' }): Promise<void>
}

const CACHED_DAY_KEY = 'calendar:day'

const CACHED_HTML_KEY = 'calendar:html'

const calendar = document.querySelector<HTMLElement>('[data-calendar-today]')

if (calendar !== null) {
  // The server's "today" in the user's zone, so yesterday's meetings never show.
  const today = calendar.dataset.day ?? ''
  const cachedHtml = localStorage.getItem(CACHED_HTML_KEY)

  if (cachedHtml !== null && localStorage.getItem(CACHED_DAY_KEY) === today) {
    calendar.innerHTML = cachedHtml
  }

  calendar.addEventListener('htmx:afterSwap', () => {
    localStorage.setItem(CACHED_DAY_KEY, today)
    localStorage.setItem(CACHED_HTML_KEY, calendar.innerHTML)
  })

  void htmx.ajax('GET', '/calendar/today', { target: calendar, swap: 'innerHTML' })
}

// Event titles shouldn't outlive the session.
document.querySelector('[data-sign-out]')?.addEventListener('submit', () => {
  localStorage.removeItem(CACHED_DAY_KEY)
  localStorage.removeItem(CACHED_HTML_KEY)
})
