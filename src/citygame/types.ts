/* The shared city: everything ten friends have in common. Each player's own
   career is an ordinary GameState (with cityMode set); this is the layer on
   top that they compete in — the listings, the bids on them, the newsfeed,
   who's been around, and the season clock.

   Pure data. The city's server (a Durable Object) stores it; citygame/tick
   moves it on. */

import type { GameState, Listing, LogKind, WeekSummary } from '../state/types'

export type CityStatus = 'lobby' | 'running' | 'finished'

export interface CityListing extends Listing {
  /** City week it went up. Unbid listings expire after a while. */
  listedWeek: number
  /** market: an ordinary seller · bank: a bank auction, cheap, sold as-is ·
   *  foreclosure: a player's house the bank took back. */
  source: 'market' | 'bank' | 'foreclosure'
}

/** A sealed offer. Nobody sees anyone else's amount. */
export interface Bid {
  userId: string
  amount: number
  downPct: number
  /** Order placed, for ties. */
  seq: number
}

export type FeedKind = 'deal' | 'outbid' | 'flop' | 'promo' | 'drama' | 'season' | 'join' | 'leader'

export interface FeedItem {
  id: number
  week: number
  kind: FeedKind
  text: string
  /** userIds the item is about, so the client can colour names. */
  who: string[]
}

export interface Standing {
  userId: string
  netWorth: number
  place: number
}

export interface SeasonStanding extends Standing {
  name: string
  color: string
  characterId: string
  rank: string
  /** Buildings held at the end (Phase 4; missing on older seasons). */
  doors?: number
  /** Deals closed as an agent over the season. */
  deals?: number
  /** Listings won at the tick. */
  won?: number
}

/** A roast (or the crown) handed out on awards night. */
export interface Award {
  id: AwardId
  userId: string
  name: string
  color: string
  /** e.g. "Outbid 6 times". */
  stat: string
}

export type AwardId = 'champion' | 'outbid' | 'landlord' | 'flop' | 'lowball' | 'warrior'

export interface SeasonResult {
  season: number
  standings: SeasonStanding[]
  /** The champion's haircut, which is also their title: "The Closer". */
  title?: string
  /** Awards night, champion first. */
  awards?: Award[]
}

/** What the city remembers about each player over one season, for awards
 *  night. Reset when a season opens. */
export interface SeasonLedger {
  /** Times someone else won a listing they bid on. */
  outbid: number
  /** Listings they won at the tick. */
  won: number
  /** Lone offers the seller turned down. */
  lowballs: number
  /** Houses the bank took back. */
  foreclosed: number
  /** Highest net worth at any tick this season. */
  peak: number
  bankrupt: boolean
}

export interface CityState {
  version: 1
  season: number
  /** The week being played now (1..52). */
  week: number
  status: CityStatus
  /** The city's own dice, separate from every player's. */
  rng: number
  listings: CityListing[]
  nextListingId: number
  /** listingId -> sealed bids. */
  bids: Record<string, Bid[]>
  bidSeq: number
  feed: FeedItem[]
  nextFeedId: number
  /** "winner>loser" -> how many times. */
  rivalries: Record<string, number>
  /** As of the last tick. */
  standings: Standing[]
  /** The season that just finished. It stays through the next season too:
   *  its champion wears the kit. */
  lastSeason: SeasonResult | null
  /** userId -> this season's record (Phase 4; absent on older cities). */
  ledger?: Record<string, SeasonLedger>
}

/** What the morning report shows: the week the tick just ran, the game's
 *  own Week Summary, and how this player's offers went. */
export interface MorningReport {
  week: number
  summary: WeekSummary | null
  offers: string[]
}

export interface CityPlayer {
  userId: string
  name: string
  color: string
  characterId: string
  game: GameState
  /** The city week this player last made a move in. */
  lastActiveWeek: number
  joinedWeek: number
  report: MorningReport | null
}

/** One player's line into the city, from the tick: a log line for them. */
export interface PlayerNote {
  kind: LogKind
  text: string
}
