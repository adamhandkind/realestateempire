/* How the tick's time reads: a countdown and a wall-clock time. */

export function countdown(ms: number): string {
  if (ms <= 0) return 'any minute now'
  const m = Math.round(ms / 60_000)
  if (m < 60) return m + ' min'
  const h = Math.floor(m / 60)
  return h + 'h ' + String(m % 60).padStart(2, '0') + 'm'
}

export function clockTime(t: number, zone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: zone, timeZoneName: 'short' }).format(new Date(t))
  } catch {
    return new Date(t).toLocaleTimeString()
  }
}
