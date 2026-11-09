/* The market quarters from the design doc: four 13-week seasons per 52-week
   year. The city's look follows them. */

export type Season = 'spring' | 'summer' | 'fall' | 'winter'

export const SEASONS: Season[] = ['spring', 'summer', 'fall', 'winter']

export const SEASON_LABEL: Record<Season, string> = {
  spring: 'Spring — heating up',
  summer: 'Summer — peak season',
  fall: 'Fall — cooling off',
  winter: 'Winter — bargain hunting',
}

/** Week 1–13 spring, 14–26 summer, 27–39 fall, 40–52 winter, then it loops. */
export function seasonOf(week: number): Season {
  const w = Number.isFinite(week) ? Math.floor(week) : 1
  const inYear = (((w - 1) % 52) + 52) % 52
  return SEASONS[Math.floor(inYear / 13)]
}
