/** Display formatting. Kept in one place so units and rounding stay consistent. */

const DUBLIN = 'Europe/Dublin'

/**
 * Formats an ISO timestamp in Dublin local time using the runtime's own IANA
 * database, so Irish summer time (UTC+1) and winter time (UTC+0) are handled
 * without hardcoding an offset.
 */
export function formatDublin(iso: string): string {
  return new Intl.DateTimeFormat('en-IE', {
    timeZone: DUBLIN,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

export function formatKickoff(iso: string): string {
  return new Intl.DateTimeFormat('en-IE', {
    timeZone: DUBLIN,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function formatDateOnly(iso: string): string {
  return new Intl.DateTimeFormat('en-IE', {
    timeZone: DUBLIN,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

/** Relative age of a timestamp, e.g. "4 min ago". Null input is honest, not zero. */
export function relativeAge(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never'

  const deltaSeconds = Math.round((now - new Date(iso).getTime()) / 1000)
  if (deltaSeconds < 60) return 'just now'
  if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)} min ago`
  if (deltaSeconds < 86400) return `${Math.floor(deltaSeconds / 3600)} h ago`
  return `${Math.floor(deltaSeconds / 86400)} d ago`
}

/** One decimal, per the numeric presentation standard. */
export function decimal1(value: number | null): string {
  return value === null ? '—' : value.toFixed(1)
}

export function decimal2(value: number | null): string {
  return value === null ? '—' : value.toFixed(2)
}

export function percent0(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`
}

/** Score display. Null is rendered as an em dash, never as a zero. */
export function scoreOrDash(value: number | null): string {
  return value === null ? '–' : String(value)
}

export function countdownTo(iso: string, now = Date.now()): string | null {
  const delta = new Date(iso).getTime() - now
  if (delta <= 0) return null

  const days = Math.floor(delta / 86400000)
  const hours = Math.floor((delta % 86400000) / 3600000)
  const minutes = Math.floor((delta % 3600000) / 60000)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}
