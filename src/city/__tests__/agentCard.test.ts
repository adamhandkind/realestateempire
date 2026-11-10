/* The agent card: what clicking someone on the map shows. */

import { describe, expect, it } from 'vitest'
import { joinCity, newCity, startSeason } from '../../citygame/city'
import type { CityPlayer } from '../../citygame/types'
import { cityView } from '../../citygame/view'
import { SLOTS, SWAG } from '../../data/swag'
import { cityCard, soloCard } from '../agentCard'

const schedule = { nextTickAt: null, tickHour: 3, tickZone: 'America/Toronto', manualTick: false }

function twoPlayers() {
  let city = newCity(7)
  const players: CityPlayer[] = []
  for (let i = 0; i < 2; i++) {
    const r = joinCity(city, { userId: 'u' + i, name: 'Agent ' + i, color: 'coral', characterId: 'you' }, 200 + i)
    city = r.city
    players.push(r.player)
  }
  return startSeason(city, players)
}

const suit = SWAG.find((i) => i.id === 'discountSuit')!
const sunnies = SWAG.find((i) => i.id === 'gasSunnies')!

describe('the agent card', () => {
  it('shows what another player has on and how much they own, never their cash', () => {
    const s = twoPlayers()
    const dressed = s.players.map((p) =>
      p.userId === 'u1'
        ? { ...p, game: { ...p.game, ownedSwagIds: [suit.id, sunnies.id, 'extra'], equipped: { outfit: suit.id, accessory: sunnies.id } } }
        : p,
    )
    const view = cityView(s.city, dressed, 'u0', schedule)
    const them = view.players.find((p) => p.userId === 'u1')!
    expect(them.equipped).toEqual({ outfit: suit.id, accessory: sunnies.id })
    expect(them.owned).toBe(3)

    const card = cityCard(view, 'u1', '#f00')!
    expect(card).toMatchObject({ name: 'Agent 1', you: false, owned: 3, totalSwag: SWAG.length, players: 2 })
    expect(card.worn.map((w) => w.slot)).toEqual(SLOTS.map((s) => s.id))
    expect(card.worn.find((w) => w.slot === 'outfit')).toMatchObject({ name: suit.name, flavor: suit.flavor })
    expect(card.worn.find((w) => w.slot === 'vehicle')?.name).toBeNull()
    expect(card).not.toHaveProperty('cash')
  })

  it('calls you "You" and is null for someone not in the city', () => {
    const s = twoPlayers()
    const view = cityView(s.city, s.players, 'u0', schedule)
    expect(cityCard(view, 'u0', '#fff')?.you).toBe(true)
    expect(cityCard(view, 'u0', '#fff')?.name).toBe('You')
    expect(cityCard(view, 'nobody', '#fff')).toBeNull()
  })

  it('shows head to head from the city rivalries, from your side', () => {
    const s = twoPlayers()
    const city = { ...s.city, rivalries: { 'u0>u1': 2, 'u1>u0': 5 } }
    const view = cityView(city, s.players, 'u0', schedule)
    expect(cityCard(view, 'u1', '#f00')?.rivalry).toEqual({ youWon: 2, theyWon: 5 })
    expect(cityCard(view, 'u0', '#f00')?.rivalry).toBeNull()
  })

  it('crowns last season’s champion with their title', () => {
    const s = twoPlayers()
    const view = cityView(s.city, s.players, 'u0', schedule)
    const champ = { userId: 'u1', name: 'Agent 1', color: 'coral', characterId: 'you', title: 'The Closer', season: 1 }
    expect(cityCard(view, 'u1', '#f00', champ)?.title).toBe('The Closer')
    expect(cityCard(view, 'u0', '#f00', champ)?.title).toBeNull()
  })

  it('works in single player from your own game', () => {
    const s = twoPlayers()
    const game = { ...s.players[0].game, ownedSwagIds: [suit.id], equipped: { outfit: suit.id } }
    const card = soloCard(game, 'you', '#c9a227')
    expect(card).toMatchObject({ you: true, place: null, owned: 1 })
    expect(card.worn.find((w) => w.slot === 'outfit')?.name).toBe(suit.name)
  })
})
