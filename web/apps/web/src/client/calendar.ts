// Home's calendar, stale-while-revalidate: paint today's last fetched calendar right away,
// then fetch fresh HTML over it and cache that for the next visit.

declare const htmx: {
  ajax(verb: 'GET', path: string, context: { target: Element; swap: 'innerHTML' }): Promise<void>
}

interface CachedCalendar {
  readonly day: string
  readonly html: string
}

const CACHE_KEY = 'calendar:today'

const today = new Date().toDateString()

const readCache = (): CachedCalendar | null => JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')

const calendar = document.querySelector('[data-calendar-today]')

if (calendar !== null) {
  const cached = readCache()

  if (cached?.day === today) {
    calendar.innerHTML = cached.html
  }

  calendar.addEventListener('htmx:afterSwap', () => {
    const cached: CachedCalendar = { day: today, html: calendar.innerHTML }

    localStorage.setItem(CACHE_KEY, JSON.stringify(cached))
  })

  void htmx.ajax('GET', '/calendar/today', { target: calendar, swap: 'innerHTML' })
}

// Event titles shouldn't outlive the session.
document
  .querySelector('[data-sign-out]')
  ?.addEventListener('submit', () => localStorage.removeItem(CACHE_KEY))
