/* What a player is allowed to see of the shared city. Built on the server,
   read by the browser: the board of listings (with how many sealed bids
   each has, and your own), everyone's buildings and standing, the feed and
   the grudges. Never another player's bid amounts, and never anyone's
   dice. */

import { championOf, type Champion } from './city'
import { quarterOf } from '../logic/cityMode'
import { netWorth } from '../logic/portfolio'
import type { PropertyTypeId, RankId, Slot } from '../state/types'
import type { CityListing, CityPlayer, CityState, CityStatus, FeedItem, SeasonResult } from './types'

export interface ListingView extends CityListing {
  bids: number
  myBid: { amount: number; downPct: number } | null
}

export interface BuildingView {
  id: string
  typeId: PropertyTypeId
  districtId: string
  fromListingId?: string
  nickname: string
  condition: number
}

export interface PlayerView {
  userId: string
  name: string
  color: string
  characterId: string
  you: boolean
  netWorth: number
  cash: number
  rank: RankId
  place: number
  gameOver: boolean
  /** City weeks since they last made a move. */
  missed: number
  buildings: BuildingView[]
  /** What they have on, one swag id per slot: the closet is a public brag. */
  equipped: Partial<Record<Slot, string>>
  /** How many swag items they own. */
  owned: number
}

export interface CityView {
  season: number
  week: number
  status: CityStatus
  quarter: number
  /** When the next tick runs (ms since epoch), or null when none is set. */
  nextTickAt: number | null
  tickHour: number
  tickZone: string
  /** The owner can run the tick by hand (dev and testing only). */
  manualTick: boolean
  listings: ListingView[]
  players: PlayerView[]
  feed: FeedItem[]
  rivalries: { winner: string; loser: string; n: number }[]
  lastSeason: SeasonResult | null
  /** Last season's winner, in the kit (null in a city's first season). */
  champion: Champion | null
}

export interface Schedule {
  nextTickAt: number | null
  tickHour: number
  tickZone: string
  manualTick: boolean
}

const FEED_SHOWN = 80

export function cityView(city: CityState, players: CityPlayer[], me: string, schedule: Schedule): CityView {
  const place = new Map(city.standings.map((s) => [s.userId, s.place]))
  const rows = players
    .map((p) => ({
      userId: p.userId,
      name: p.name,
      color: p.color,
      characterId: p.characterId,
      you: p.userId === me,
      netWorth: Math.round(netWorth(p.game)),
      cash: Math.round(p.game.cash),
      rank: p.game.rank,
      place: place.get(p.userId) ?? 0,
      gameOver: p.game.gameOver,
      missed: Math.max(0, city.week - p.lastActiveWeek),
      buildings: p.game.properties
        .filter((x) => !x.isVrbo)
        .map((x) => ({
          id: x.id,
          typeId: x.typeId,
          districtId: x.districtId,
          fromListingId: x.fromListingId,
          nickname: x.nickname,
          condition: Math.round(x.condition),
        })),
      equipped: { ...p.game.equipped },
      owned: p.game.ownedSwagIds.length,
    }))
    .sort((a, b) => b.netWorth - a.netWorth || a.name.localeCompare(b.name))
    .map((r, i) => ({ ...r, place: i + 1 }))
  return {
    season: city.season,
    week: city.week,
    status: city.status,
    quarter: quarterOf(city.week),
    ...schedule,
    listings: city.listings.map((l) => {
      const bids = city.bids[l.id] ?? []
      const mine = bids.find((b) => b.userId === me)
      return { ...l, bids: bids.length, myBid: mine ? { amount: mine.amount, downPct: mine.downPct } : null }
    }),
    players: rows,
    feed: city.feed.slice(-FEED_SHOWN).reverse(),
    rivalries: Object.entries(city.rivalries)
      .map(([k, n]) => {
        const [winner, loser] = k.split('>')
        return { winner, loser, n }
      })
      .sort((a, b) => b.n - a.n)
      .slice(0, 6),
    lastSeason: city.lastSeason,
    champion: championOf(city),
  }
}
