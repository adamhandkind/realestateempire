/* Day and night over the city. The game is a once-a-day check-in, so the
   sky follows the viewer's own clock: morning coffee gets a sunrise, a late
   check-in gets street lamps and lit windows. Days are longer in summer.
   Pure numbers; CityScene turns them into lights. */

import type { Season } from './season'

export type TimeMode = 'auto' | 'day' | 'night'

/** Sunrise and sunset, in hours, per season (roughly southern Ontario). */
const SUN: Record<Season, [rise: number, set: number]> = {
  spring: [6.5, 19.75],
  summer: [5.75, 21],
  fall: [7.25, 18.75],
  winter: [7.75, 17],
}

export interface Daylight {
  /** 0 at night, 1 in full day. */
  day: number
  /** 1 around sunrise and sunset: the golden-hour tint. */
  golden: number
  /** Where the sun (or moon) is: 0..1 across the sky, for its direction. */
  arc: number
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

export function daylightAt(hour: number, season: Season): Daylight {
  const h = ((hour % 24) + 24) % 24
  const [rise, set] = SUN[season]
  const day = smooth(rise - 0.6, rise + 0.6, h) * (1 - smooth(set - 0.6, set + 0.6, h))
  const golden = Math.max(0, 1 - Math.abs(h - rise) / 1.4) + Math.max(0, 1 - Math.abs(h - set) / 1.4)
  const arc = day > 0 ? (h - rise) / (set - rise) : ((h - set + 24) % 24) / (24 - (set - rise))
  return { day, golden: Math.min(1, golden), arc: Math.max(0, Math.min(1, arc)) }
}

/** What to draw for a mode: auto reads the clock, the others pin it. */
export function daylightFor(mode: TimeMode, now: Date, season: Season): Daylight {
  if (mode === 'day') return daylightAt(13, season)
  if (mode === 'night') return daylightAt(23, season)
  return daylightAt(now.getHours() + now.getMinutes() / 60, season)
}
