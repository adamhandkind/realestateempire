/* When the overnight tick runs: a fixed hour of the day in the city's time
   zone. Stepping hour by hour and asking Intl what the local hour is keeps
   it right across daylight-saving changes without a date library. */

export const DEFAULT_TICK_HOUR = 3
export const DEFAULT_TICK_ZONE = 'America/Toronto'

export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

function localHour(t: number, zone: string): number {
  const h = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' }).format(new Date(t))
  return Number(h) % 24
}

/** The first moment after `now` that is `hour`:00 in `zone`. */
export function nextTickAt(now: number, hour: number, zone: string): number {
  const HOUR = 3_600_000
  /* Whole UTC hours line up with whole local hours in every zone this game
     will meet (the half-hour zones would need a finer step). */
  let t = Math.floor(now / HOUR) * HOUR + HOUR
  for (let i = 0; i < 50; i++, t += HOUR) {
    const local = new Date(t)
    if (localHour(t, zone) === hour && local.getUTCMinutes() === 0) return t
  }
  return Math.floor(now / HOUR) * HOUR + 24 * HOUR
}
