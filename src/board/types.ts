/* Land Grab: the board game. A hex map of Brantford, 2–4 friends (or bots)
   building streets, houses, duplexes and towers, trading what the dice pay
   out, and racing through four eras to 12 Empire Points.

   Pure data. The server keeps a BoardState per city (worker/boardRoom.ts);
   every browser gets a BoardView with the other players' hands hidden. */

export type Res = 'leads' | 'lumber' | 'brick' | 'permits' | 'cash'
export type Hand = Record<Res, number>
export type Terrain = Res | 'river'

export interface Tile {
  terrain: Terrain
  /** The dice total that pays this tile out. Null on the river. */
  number: number | null
}

export type BuildingKind = 'house' | 'duplex' | 'tower'

export interface Building {
  seat: number
  kind: BuildingKind
}

export type DealCard = 'openHouse' | 'zoning' | 'hotMarket' | 'biddingWar' | 'plaque'

export interface Seat {
  /** The player's userId, or 'bot:<n>' for a bot. */
  id: string
  name: string
  color: string
  bot: boolean
  /** A human who handed their seat to the bot for now. */
  autopilot: boolean
  hand: Hand
  /** Deal cards they can play. */
  deals: DealCard[]
  /** Bought this turn: playable from next turn. */
  newDeals: DealCard[]
  /** Open Houses played, for Top Producer. */
  openHouses: number
  /** Running tallies for the end-of-game awards. Missing on tables saved
   *  before they existed. */
  stats?: SeatStats
}

export interface SeatStats {
  /** Times someone took a card from you. */
  robbed: number
  /** Cards you took off other people. */
  stole: number
  /** Cards lost to audits. */
  audited: number
  /** Trades with the bank. */
  bank: number
  /** Trades with other players (either side). */
  trades: number
  /** 7s you rolled. */
  sevens: number
  /** Resource cards the dice paid you. */
  collected: number
  /** Turns the clock ran out on you. */
  timeouts: number
}

/** A trade the player whose turn it is has put on the table. */
export interface Offer {
  give: Hand
  want: Hand
}

export type Phase =
  /** Opening placement: a house, then a street touching it. */
  | 'setupHouse'
  | 'setupStreet'
  /** Start of a normal turn: roll (or play a deal first). */
  | 'roll'
  /** A 7 or an Open House: move the Market Crash. */
  | 'crash'
  /** Pick who to take a card from. */
  | 'steal'
  /** Trade and build, then end the turn. */
  | 'main'
  /** A Zoning Variance: free streets to place. */
  | 'freeStreets'

export type Status = 'lobby' | 'playing' | 'over'

export interface LogLine {
  n: number
  text: string
  /** Who it's about, for colouring. */
  seat?: number
}

export interface BoardState {
  version: 1
  /** The table's dice. Never sent to a browser. */
  rng: number
  status: Status
  /** userId of whoever opened the table. */
  host: string
  seats: Seat[]
  tiles: Tile[]
  /** vertex index → building. */
  buildings: Record<number, Building>
  /** edge index → seat. */
  streets: Record<number, number>
  /** Tile the Market Crash sits on: it pays nothing. */
  crash: number
  /** Seat whose turn it is. */
  turn: number
  round: number
  phase: Phase
  /** Opening placement: which of the 2n placements this is, and the house
   *  just placed (its street must touch it). */
  setup: { step: number; lastHouse: number | null }
  dice: [number, number] | null
  /** 0 Agent · 1 Landlord · 2 Developer · 3 Mogul. Only ever goes up. */
  era: number
  deck: DealCard[]
  /** A deal card has been played this turn. */
  playedDeal: boolean
  freeStreets: number
  /** Seats the Market Crash can take a card from, while phase is 'steal'. */
  victims: number[]
  offer: Offer | null
  /** Seat holding Main Street (longest street), or null. */
  mainStreet: number | null
  /** Seat holding Top Producer (most Open Houses), or null. */
  topProducer: number | null
  log: LogLine[]
  nextLog: number
  winner: number | null
}

export type Move =
  | { t: 'house'; vertex: number }
  | { t: 'street'; edge: number }
  | { t: 'upgrade'; vertex: number }
  | { t: 'roll' }
  | { t: 'crash'; tile: number }
  | { t: 'steal'; seat: number }
  | { t: 'buyDeal' }
  | { t: 'playDeal'; card: Exclude<DealCard, 'plaque'>; res?: Res; res2?: Res }
  | { t: 'bank'; give: Res; get: Res }
  | { t: 'offer'; give: Hand; want: Hand }
  | { t: 'cancelOffer' }
  | { t: 'accept' }
  | { t: 'endFreeStreets' }
  | { t: 'end' }

export interface SeatView {
  id: string
  name: string
  color: string
  bot: boolean
  autopilot: boolean
  /** Cards in hand. */
  cards: number
  /** Deal cards held (bought ones included). */
  dealCount: number
  openHouses: number
  /** Points everyone can see (plaques are secret). */
  points: number
  streetLength: number
  /** Only on your own seat. */
  hand?: Hand
  deals?: DealCard[]
  newDeals?: DealCard[]
  /** Your own points, plaques included. */
  totalPoints?: number
  /** The award tallies (public: everyone saw it happen). */
  stats: SeatStats
}

export interface BoardView {
  status: Status
  host: string
  seats: SeatView[]
  /** Your seat, or -1 if you're watching. */
  you: number
  tiles: Tile[]
  buildings: Record<number, Building>
  streets: Record<number, number>
  crash: number
  turn: number
  round: number
  phase: Phase
  setup: { step: number; lastHouse: number | null }
  dice: [number, number] | null
  era: number
  deckCount: number
  playedDeal: boolean
  freeStreets: number
  victims: number[]
  offer: Offer | null
  mainStreet: number | null
  topProducer: number | null
  log: LogLine[]
  winner: number | null
  /** Bumps on every change; the browser sends it back with a move. */
  rev: number
}
