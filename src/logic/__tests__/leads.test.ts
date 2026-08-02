import { describe, expect, it } from 'vitest'
import { ARCHETYPES } from '../../data/archetypes'
import { initialState } from '../../state/reducer'
import { arch, closeChance, legalArchetypes, makeLead } from '../leads'
import { setSeed } from '../rand'
import type { GameState, Lead } from '../../state/types'

function stateAt(rank: GameState['rank'], reputation: number): GameState {
  return { ...initialState(), rank, reputation }
}
const ids = (s: GameState) => legalArchetypes(s).map((a) => a.id)

describe('new archetypes', () => {
  it('defines all four with their rep gates', () => {
    expect(arch('techTyler').unlockRep).toBe(30)
    expect(arch('hgtvCouple').unlockRep).toBe(30)
    expect(arch('oldMoneyOtis').unlockRep).toBe(50)
    expect(arch('celebrityCleo').unlockRep).toBe(75)
  })

  it('gives Otis a negative ego affinity and Cleo a strong positive one', () => {
    expect(arch('oldMoneyOtis').egoAffinity).toBe(-3)
    expect(arch('celebrityCleo').egoAffinity).toBe(4)
  })

  it('brings the roster to fourteen', () => {
    expect(ARCHETYPES).toHaveLength(14)
  })

  it('gives every archetype non-empty flavor pools', () => {
    ARCHETYPES.forEach((a) => {
      expect(a.intros.length).toBeGreaterThan(0)
      expect(a.ghosts.length).toBeGreaterThan(0)
      expect(a.successes.length).toBeGreaterThan(0)
      expect(a.surnames.length).toBeGreaterThan(0)
    })
  })

  it('has no duplicate archetype ids', () => {
    expect(new Set(ARCHETYPES.map((a) => a.id)).size).toBe(ARCHETYPES.length)
  })
})

describe('legalArchetypes', () => {
  it('hides rep-gated archetypes below their threshold', () => {
    expect(ids(stateAt('sellerAgent', 0))).not.toContain('techTyler')
    expect(ids(stateAt('sellerAgent', 29))).not.toContain('hgtvCouple')
    expect(ids(stateAt('sellerAgent', 49))).not.toContain('oldMoneyOtis')
    expect(ids(stateAt('sellerAgent', 74))).not.toContain('celebrityCleo')
  })

  it('reveals each archetype exactly at its threshold', () => {
    expect(ids(stateAt('sellerAgent', 30))).toContain('techTyler')
    expect(ids(stateAt('sellerAgent', 30))).toContain('hgtvCouple')
    expect(ids(stateAt('sellerAgent', 50))).toContain('oldMoneyOtis')
    expect(ids(stateAt('sellerAgent', 75))).toContain('celebrityCleo')
  })

  it('still gates seller-band clients behind the seller ranks', () => {
    expect(ids(stateAt('buyerAgent', 100))).not.toContain('oldMoneyOtis')
    expect(ids(stateAt('buyerAgent', 100))).toContain('techTyler')
    expect(ids(stateAt('topProducer', 100))).toContain('celebrityCleo')
  })

  it('keeps every ungated Phase 1 archetype available from the start', () => {
    expect(ids(stateAt('receptionist', 0))).toContain('firstTimer')
    expect(ids(stateAt('receptionist', 0))).toContain('ghostGary')
  })
})

describe('makeLead', () => {
  it('tags a lead with the channel that produced it', () => {
    setSeed(11)
    const l = makeLead(stateAt('sellerAgent', 0), arch('firstTimer'), 'billboard')
    expect(l.channelId).toBe('billboard')
    expect(l.archetypeId).toBe('firstTimer')
  })

  it('leaves channelId undefined for cold-call leads', () => {
    setSeed(12)
    expect(makeLead(stateAt('buyerAgent', 0)).channelId).toBeUndefined()
  })

  it('only ever produces a legal archetype', () => {
    setSeed(13)
    const s = stateAt('buyerAgent', 0)
    const legal = ids(s)
    for (let i = 0; i < 100; i++) expect(legal).toContain(makeLead(s).archetypeId)
  })
})

describe('closeChance and ego affinity', () => {
  const otisLead = (): Lead => ({
    id: 'L1',
    archetypeId: 'oldMoneyOtis',
    clientName: 'Otis Whitcombe',
    stage: 'ready',
    salePrice: 800000,
    patience: 5,
    maxPatience: 5,
    retriedClose: false,
    createdWeek: 1,
    intro: 'x',
    referralBonus: false,
  })

  it('punishes a high-ego loadout and rewards a quiet one', () => {
    const quiet: GameState = {
      ...stateAt('sellerAgent', 60),
      permBonuses: { hustle: 0, swagger: 6, ego: 0 },
    }
    const loud: GameState = {
      ...stateAt('sellerAgent', 60),
      permBonuses: { hustle: 0, swagger: 6, ego: 12 },
    }
    const q = closeChance(quiet, otisLead())
    const l = closeChance(loud, otisLead())
    // Stripping the swag roughly doubles his close chance — that gap is the
    // whole reason outfit presets exist.
    expect(q).toBeCloseTo(0.75, 2)
    expect(l).toBeCloseTo(0.39, 2)
    expect(q - l).toBeGreaterThan(0.3)
  })

  it('rewards a high-ego loadout for Celebrity Cleo', () => {
    const cleoLead = (): Lead => ({
      id: 'L2',
      archetypeId: 'celebrityCleo',
      clientName: 'Cleo Marchetti',
      stage: 'ready',
      salePrice: 1000000,
      patience: 3,
      maxPatience: 3,
      retriedClose: false,
      createdWeek: 1,
      intro: 'x',
      referralBonus: false,
    })
    const quiet: GameState = {
      ...stateAt('sellerAgent', 75),
      permBonuses: { hustle: 0, swagger: 6, ego: 0 },
    }
    const loud: GameState = {
      ...stateAt('sellerAgent', 75),
      permBonuses: { hustle: 0, swagger: 6, ego: 12 },
    }
    expect(closeChance(loud, cleoLead())).toBeGreaterThan(
      closeChance(quiet, cleoLead()),
    )
  })
})
