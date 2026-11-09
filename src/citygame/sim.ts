/* A whole season with bots in the seats: the balance test and the city tests
   both use it. Each simulated day every bot checks in (or doesn't), then the
   tick runs. */

import { CHARACTERS } from '../data/characters'
import { AGENT_COLORS } from '../data/agentColors'
import { botDice, playCheckIn, type BotStyle } from './bot'
import { applyPlayerActions, joinCity, newCity, placeBid, startSeason, tick, withCityListings } from './city'
import type { Action } from '../state/types'
import type { CityPlayer, CityState, SeasonResult } from './types'

export interface SimSeat {
  style: BotStyle
  characterId?: string
  /** Chance of checking in on a given day. */
  showUp?: number
}

export interface SimResult {
  city: CityState
  players: CityPlayer[]
  result: SeasonResult | null
  /** userId -> the week each rank was first reached. */
  ranks: Record<string, Record<string, number>>
}

export function simulateSeason(seats: SimSeat[], seed = 1, weeks = 52): SimResult {
  let city = newCity(seed)
  let players: CityPlayer[] = []
  seats.forEach((seat, i) => {
    const r = joinCity(
      city,
      {
        userId: 'u' + String(i).padStart(2, '0'),
        name: 'Bot ' + (i + 1),
        color: AGENT_COLORS[i % AGENT_COLORS.length].id,
        characterId: seat.characterId ?? CHARACTERS[i % CHARACTERS.length].id,
      },
      seed * 100 + i,
    )
    city = r.city
    players.push(r.player)
  })
  ;({ city, players } = startSeason(city, players))
  const dice = seats.map((_, i) => botDice(seed * 1000 + i))
  const ranks: Record<string, Record<string, number>> = {}
  let result: SeasonResult | null = null
  for (let day = 0; day < weeks && !result; day++) {
    players = players.map((p, i) => {
      const seat = seats[i]
      const d = dice[i]
      if (d.next() > (seat.showUp ?? 1)) return p
      const actions: Action[] = []
      let game = withCityListings(p.game, city)
      playCheckIn(
        {
          apply: (a) => {
            actions.push(a)
            game = withCityListings(applyPlayerActions(city, { ...p, game }, [a]).game, city)
          },
          get: () => game,
          listings: () => city.listings,
          buy: (intent) => {
            const r = placeBid(city, { ...p, game }, { listingId: intent.listing.id, amount: intent.amount, downPct: intent.downPct })
            if (r.ok) city = r.city
          },
        },
        d,
        seat.style,
      )
      return { ...p, game: { ...game, marketPool: [] }, lastActiveWeek: city.week }
    })
    const t = tick(city, players)
    city = t.city
    players = t.players
    result = t.seasonOver
    for (const p of players) {
      const r = (ranks[p.userId] ??= {})
      if (!(p.game.rank in r)) r[p.game.rank] = city.week
    }
  }
  return { city, players, result, ranks }
}
