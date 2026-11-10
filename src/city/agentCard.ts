/* What the card shows when you click an agent on the map: who they are,
   where they stand, and what they're wearing. Pure: built from your own game
   in single player, or from the shared city's view of a player. Owning swag
   is a public brag, so equipped items and the closet count are on it; cash
   and bids never are. */

import type { Champion } from '../citygame/city'
import type { CityView, PlayerView } from '../citygame/view'
import { RANKS } from '../data/ranks'
import { SLOTS, SWAG } from '../data/swag'
import { characterOf } from '../logic/characters'
import { netWorth } from '../logic/portfolio'
import type { GameState, Slot } from '../state/types'

export interface WornItem {
  slot: Slot
  slotLabel: string
  /** Null when the slot is empty. */
  name: string | null
  flavor: string | null
}

export interface AgentCardData {
  id: string
  name: string
  you: boolean
  color: string
  characterName: string
  rank: string
  netWorth: number
  /** Place in the city (shared city only). */
  place: number | null
  players: number | null
  doors: number
  /** The champion's title ("The Closer"), when they're last season's winner. */
  title: string | null
  worn: WornItem[]
  owned: number
  totalSwag: number
  /** City weeks since their last move (shared city only). */
  missed: number
  /** Head to head with you, from the rivalries the city tracks. */
  rivalry: { youWon: number; theyWon: number } | null
  gameOver: boolean
}

const rankName = (id: string) => RANKS.find((r) => r.id === id)?.name ?? id

export function wornItems(equipped: Partial<Record<Slot, string>>): WornItem[] {
  return SLOTS.map((s) => {
    const item = SWAG.find((i) => i.id === equipped[s.id])
    return { slot: s.id, slotLabel: s.label, name: item?.name ?? null, flavor: item?.flavor ?? null }
  })
}

/** Your own card in single player (there's nobody else on the map). */
export function soloCard(state: GameState, id: string, color: string): AgentCardData {
  return {
    id,
    name: 'You',
    you: true,
    color,
    characterName: characterOf(state.characterId)?.name ?? '',
    rank: rankName(state.rank),
    netWorth: Math.round(netWorth(state)),
    place: null,
    players: null,
    doors: state.properties.filter((p) => !p.isVrbo).length,
    title: null,
    worn: wornItems(state.equipped),
    owned: state.ownedSwagIds.length,
    totalSwag: SWAG.length,
    missed: 0,
    rivalry: null,
    gameOver: state.gameOver,
  }
}

/** Any player's card in a shared city. Null if they're not in the city. */
export function cityCard(view: CityView, userId: string, color: string, champion: Champion | null = view.champion): AgentCardData | null {
  const p: PlayerView | undefined = view.players.find((x) => x.userId === userId)
  if (!p) return null
  const me = view.players.find((x) => x.you)
  let rivalry: AgentCardData['rivalry'] = null
  if (me && !p.you) {
    const youWon = view.rivalries.find((r) => r.winner === me.userId && r.loser === p.userId)?.n ?? 0
    const theyWon = view.rivalries.find((r) => r.winner === p.userId && r.loser === me.userId)?.n ?? 0
    if (youWon || theyWon) rivalry = { youWon, theyWon }
  }
  return {
    id: p.userId,
    name: p.you ? 'You' : p.name,
    you: p.you,
    color,
    characterName: characterOf(p.characterId)?.name ?? '',
    rank: rankName(p.rank),
    netWorth: p.netWorth,
    place: p.place,
    players: view.players.length,
    doors: p.buildings.length,
    title: champion && champion.userId === p.userId ? champion.title : null,
    /* Older servers didn't send the closet; show empty slots, not a crash. */
    worn: wornItems(p.equipped ?? {}),
    owned: p.owned ?? 0,
    totalSwag: SWAG.length,
    missed: p.missed,
    rivalry,
    gameOver: p.gameOver,
  }
}
