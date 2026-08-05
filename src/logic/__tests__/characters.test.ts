/* Phase 5A acceptance criteria (spec §9), one describe per character plus the
   cross-cutting rules. These pin the hook map: if one fails, the fix is at the
   hook, never here. */

import { beforeEach, describe, expect, it } from 'vitest'
import { CHARACTERS, PERK_FLAW } from '../../data/characters'
import { EVENTS } from '../../data/events'
import { CHANNELS } from '../../data/marketing'
import { P3 } from '../../data/p3'
import { P5 } from '../../data/p5'
import { RANKS } from '../../data/ranks'
import { SWAG } from '../../data/swag'
import { getChar, hasFlag } from '../characters'
import {
  bragFor,
  deriveStats,
  gatedOnMultipliedEarnings,
  nextRank,
  reqEarningsFor,
  swagOf,
} from '../economy'
import { closeChance, ghostChanceFor } from '../leads'
import { isChannelLocked, weeklyChannelSpend } from '../marketing'
import { evictCost, hasMarketInsight, saleChance } from '../portfolio'
import { setSeed } from '../rand'
import { initialState, newGame, reducer } from '../../state/reducer'
import { migrate } from '../../state/migrate'
import type { GameState, Lead } from '../../state/types'

const as = (id: string): GameState => newGame(id)

const leadOf = (archetypeId: string): Lead => ({
  id: 'L1',
  archetypeId,
  clientName: 'Test Client',
  stage: 'ready',
  salePrice: 300000,
  patience: 3,
  maxPatience: 3,
  retriedClose: false,
  createdWeek: 1,
  intro: '…',
  districtId: 'northEnd',
  referralBonus: false,
})

beforeEach(() => setSeed(null))

/* ------------------------------------------------------------ the data */

describe('the roster', () => {
  it('ships nine characters, each with exactly four brags', () => {
    expect(CHARACTERS).toHaveLength(9)
    CHARACTERS.forEach((c) => expect(c.brags).toHaveLength(4))
  })

  it('gives every character a perk/flaw string for the select screen', () => {
    CHARACTERS.forEach((c) => expect(PERK_FLAW[c.id]).toBeDefined())
  })

  it('falls back to "you" for an unknown id', () => {
    const s = { ...initialState(), characterId: 'nobody' }
    expect(getChar(s).id).toBe('you')
  })
})

/* --------------------------------------------------------- §9.1 "you" */

describe('you — the pre-character game, unchanged', () => {
  it('starts identical to the Phase 1–3 initial state', () => {
    const you = as('you')
    const base = initialState()
    expect(you.cash).toBe(base.cash)
    expect(you.rank).toBe(base.rank)
    expect(you.ap).toBe(base.ap)
    expect(you.reputation).toBe(0)
    expect(you.properties).toEqual([])
    expect(you.ownedSwagIds).toEqual([])
  })

  it('applies no stat, close, promotion, or cost modifiers', () => {
    const s = as('you')
    const c = getChar(s)
    expect(c.statMods).toEqual({ hustle: 0, swagger: 0, ego: 0 })
    expect(c.closeGlobalDelta).toBe(0)
    expect(c.promotionEarningsMult).toBe(1)
    expect(c.marketingCostMult).toBe(1)
    expect(c.repDecayMult).toBe(1)
    expect(c.flags).toEqual([])
    expect(deriveStats(s)).toEqual({ hustle: 1, swagger: 1, ego: 0 })
    RANKS.forEach((r) => expect(reqEarningsFor(s, r)).toBe(r.req.earnings))
  })
})

/* ------------------------------------------------------------- §9.3 */

describe('nigel', () => {
  it('adds +0.10 on luxury closes and nothing on an ordinary one', () => {
    const s = as('nigel')
    const you = { ...as('you'), stats: s.stats }
    const lux = leadOf('luxLorenzo')
    /* Both start with base swagger differences, so compare the DELTA the
       archetype table contributes rather than absolute chances. */
    const nigelGap = closeChance(s, lux) - closeChance(s, leadOf('firstTimer'))
    const youGap = closeChance(you, lux) - closeChance(you, leadOf('firstTimer'))
    expect(nigelGap - youGap).toBeCloseTo(0.1, 5)
  })

  it('applies exactly one non-stacking −1 Swagger for one week on a failed close', () => {
    let s: GameState = { ...as('nigel'), rank: 'buyerAgent', ap: 5 }
    const before = deriveStats(s).swagger
    s = { ...s, leads: [leadOf('firstTimer')] }
    /* Hunt for the failure branch by varying the SEED, not by re-rolling the
       same input: the reducer is pure, so dispatching the identical state
       forty times now returns the identical answer forty times. */
    let out = s
    /* Widely spaced, because consecutive seeds are NOT usefully different:
       the LCG's first output for seeds 1..40 is ~0.2360 every time. */
    for (let i = 1; i < 40 && out.statModifiers.length === 0; i++) {
      out = reducer(
        { ...s, ap: 5, rngSeed: i * 1000003, leads: [leadOf('firstTimer')] },
        { type: 'ATTEMPT_CLOSE', leadId: 'L1' },
      )
    }
    expect(out.statModifiers).toHaveLength(1)
    expect(out.statModifiers[0]).toMatchObject({
      stat: 'swagger',
      delta: -1,
      label: 'Accent Slip',
      expiresWeek: out.week + P5.ACCENT_SLIP_WEEKS,
    })
    expect(deriveStats(out).swagger).toBe(before - 1)
    /* Second failure while one is live does not stack. */
    const again = reducer(
      { ...out, ap: 5, leads: [leadOf('firstTimer')] },
      { type: 'ATTEMPT_CLOSE', leadId: 'L1' },
    )
    expect(again.statModifiers.length).toBeLessThanOrEqual(1)
    expect(out.log.some((l) => l.text.includes('terribly sorry'))).toBe(true)
  })

  it('stops counting the week it expires, and is swept the week after', () => {
    const s: GameState = {
      ...as('nigel'),
      statModifiers: [
        { stat: 'swagger', delta: -1, expiresWeek: 2, label: 'Accent Slip' },
      ],
    }
    /* Live during week 1 only — the same convention activeModifiers use. */
    const clean: GameState = { ...s, statModifiers: [] }
    expect(deriveStats(s).swagger).toBe(deriveStats(clean).swagger - 1)
    const w2 = reducer(s, { type: 'END_WEEK' })
    expect(deriveStats(w2).swagger).toBe(deriveStats(clean).swagger)
    expect(reducer(w2, { type: 'END_WEEK' }).statModifiers).toHaveLength(0)
  })
})

/* ------------------------------------------------------------- §9.4 */

describe('doreen', () => {
  it('caps ego at 2 no matter what is equipped', () => {
    const s: GameState = {
      ...as('doreen'),
      ownedSwagIds: ['goldBlazer', 'goldNameplate'],
      equipped: { outfit: 'goldBlazer', office: 'goldNameplate' },
    }
    expect(deriveStats(s).ego).toBeLessThanOrEqual(2)
  })

  it('refuses to equip anything with ego >= 2, but may own it', () => {
    const boa = SWAG.find((i) => i.ego >= 2)!
    const s: GameState = { ...as('doreen'), ownedSwagIds: [boa.id] }
    const out = reducer(s, { type: 'EQUIP_SWAG', itemId: boa.id })
    expect(out.equipped[boa.slot]).toBeUndefined()
    expect(out.log[0].text).toContain('It remains in the bag')
    expect(out.ownedSwagIds).toContain(boa.id)
  })

  it('sees next week’s market from week one', () => {
    expect(hasMarketInsight(as('doreen'))).toBe(true)
    expect(hasMarketInsight(as('you'))).toBe(false)
  })

  it('ignores the cold-market flip penalty but not crashed prices', () => {
    const cold: GameState = { ...as('doreen'), marketState: 'cold' }
    const normal: GameState = { ...as('doreen'), marketState: 'normal' }
    expect(saleChance(cold)).toBeCloseTo(saleChance(normal), 5)
    /* And still enjoys a hot market. */
    const hot: GameState = { ...as('doreen'), marketState: 'hot' }
    expect(saleChance(hot)).toBeGreaterThan(saleChance(normal))
    /* Anyone else eats the penalty. */
    const you: GameState = { ...as('you'), marketState: 'cold' }
    expect(saleChance(you)).toBeLessThan(saleChance({ ...you, marketState: 'normal' }))
  })

  it('is ghosted by influencers at 75%', () => {
    const s = as('doreen')
    expect(ghostChanceFor(s, leadOf('influencerIzzy'))).toBe(
      P5.IZZY_ALLERGY_GHOST,
    )
    expect(ghostChanceFor(as('you'), leadOf('influencerIzzy'))).toBeLessThan(
      P5.IZZY_ALLERGY_GHOST,
    )
  })
})

/* ------------------------------------------------------------- §9.5 */

describe('hunter', () => {
  it('starts and resets to 7 AP', () => {
    const s = as('hunter')
    expect(s.ap).toBe(7)
    expect(reducer({ ...s, ap: 0 }, { type: 'END_WEEK' }).ap).toBe(7)
  })

  it('is 10 points worse at every close', () => {
    const s = as('hunter')
    /* Same kit, same stats — the only difference left is the character. */
    const you: GameState = {
      ...as('you'),
      ownedSwagIds: s.ownedSwagIds,
      equipped: s.equipped,
    }
    ;['firstTimer', 'luxLorenzo', 'retireeRuth'].forEach((id) => {
      expect(closeChance(s, leadOf(id))).toBeCloseTo(
        closeChance(you, leadOf(id)) - 0.1,
        5,
      )
    })
  })

  it('owns and wears The Podcast, which is not in the shop', () => {
    const s = as('hunter')
    expect(s.ownedSwagIds).toContain('thePodcast')
    expect(s.equipped.accessory).toBe('thePodcast')
    expect(swagOf('thePodcast')!.shopHidden).toBe(true)
    /* Unbuyable even by direct dispatch. */
    const out = reducer(as('you'), { type: 'BUY_SWAG', itemId: 'thePodcast' })
    expect(out.ownedSwagIds).not.toContain('thePodcast')
  })

  it('is 10 points more cringe-prone', () => {
    expect(getChar(as('hunter')).cringeChanceDelta).toBeCloseTo(0.1, 5)
  })
})

/* ------------------------------------------------------------- §9.6 */

describe('chip', () => {
  it('starts with $40k, Rep 10 and the Gold Blazer despite the tier lock', () => {
    const s = as('chip')
    expect(s.cash).toBe(40000)
    expect(s.reputation).toBe(10)
    expect(s.equipped.outfit).toBe('goldBlazer')
    expect(s.rank).toBe('receptionist')
    expect(swagOf('goldBlazer')!.unlockRank).toBe('sellerAgent')
  })

  it('needs 1.5× earnings at every rank', () => {
    const s = as('chip')
    const expected: Record<string, number> = {
      junior: 3750,
      buyerAgent: 7500,
      sellerAgent: 37500,
      topProducer: 375000,
    }
    RANKS.filter((r) => r.id !== 'receptionist').forEach((r) => {
      expect(reqEarningsFor(s, r)).toBe(expected[r.id])
    })
  })

  it('is held back by the multiplier alone, and the committee says so', () => {
    /* Over Junior's base $2,500 bar and under Chip's multiplied $3,750 one,
       with the showings requirement already satisfied so the multiplier is
       demonstrably the only thing left in the way. */
    const s: GameState = {
      ...as('chip'),
      careerEarnings: 2600,
      counters: { showingsRun: 8, dealsClosed: 0, leadsLost: 0 },
    }
    expect(nextRank(s)).toBeNull()
    expect(gatedOnMultipliedEarnings(s)?.id).toBe('junior')
    const out = reducer(s, { type: 'END_WEEK' })
    expect(out.log.some((l) => l.text.includes("wants to see a little more"))).toBe(
      true,
    )
    /* Once per rank, not once per week. */
    const again = reducer(out, { type: 'END_WEEK' })
    const count = again.log.filter((l) =>
      l.text.includes("wants to see a little more"),
    ).length
    expect(count).toBe(1)
  })

  it('promotes normally once the multiplied bar is met', () => {
    const s: GameState = {
      ...as('chip'),
      careerEarnings: 3750,
      counters: { showingsRun: 8, dealsClosed: 0, leadsLost: 0 },
    }
    expect(nextRank(s)?.id).toBe('junior')
  })
})

/* ------------------------------------------------------------- §9.7 */

describe('dave', () => {
  it('shifts the close chance per archetype', () => {
    const s = as('dave')
    const gap = (id: string) =>
      closeChance(s, leadOf(id)) - closeChance(as('you'), leadOf(id))
    expect(gap('firstTimer')).toBeCloseTo(0.15, 5)
    expect(gap('retireeRuth')).toBeCloseTo(0.15, 5)
    expect(gap('luxLorenzo')).toBeCloseTo(-0.1, 5)
  })

  it('caps ego at 4', () => {
    const s: GameState = {
      ...as('dave'),
      ownedSwagIds: ['goldBlazer', 'goldNameplate'],
      equipped: { outfit: 'goldBlazer', office: 'goldNameplate' },
    }
    expect(deriveStats(s).ego).toBeLessThanOrEqual(4)
  })

  it('is never eligible for a bad review, and the line logs once', () => {
    const def = EVENTS.find((e) => e.id === 'badReview')!
    const s: GameState = {
      ...as('dave'),
      counters: { showingsRun: 0, dealsClosed: 5, leadsLost: 0 },
    }
    expect(def.condition(s)).toBe(false)
    expect(
      def.condition({
        ...as('you'),
        counters: { showingsRun: 0, dealsClosed: 5, leadsLost: 0 },
      }),
    ).toBe(true)

    const w1 = reducer(s, { type: 'END_WEEK' })
    const w2 = reducer(w1, { type: 'END_WEEK' })
    const hits = w2.log.filter((l) =>
      l.text.includes('deleted it halfway through'),
    )
    expect(hits).toHaveLength(1)
  })
})

/* ------------------------------------------------------------- §9.8 */

describe('svetlana', () => {
  it('starts at Junior, broke, with both buildings exactly as specced', () => {
    const s = as('svetlana')
    expect(s.cash).toBe(0)
    expect(s.rank).toBe('junior')
    expect(s.reputation).toBe(5)
    expect(s.properties).toHaveLength(2)

    const [a, b] = s.properties
    expect(a.typeId).toBe('starter')
    expect(a.nickname).toContain('Maplecrest')
    expect(a.baseValue).toBe(210000)
    expect(a.condition).toBe(55)
    expect(a.mortgage).toEqual({ balance: 168000 })
    expect(a.units).toHaveLength(1)
    expect(a.units[0].tenant?.archetypeId).toBe('lateLenny')

    expect(b.typeId).toBe('duplex')
    expect(b.nickname).toContain('Old Mill')
    expect(b.baseValue).toBe(380000)
    expect(b.condition).toBe(60)
    expect(b.mortgage).toEqual({ balance: 304000 })
    expect(b.units).toHaveLength(2)
    expect(b.units[0].tenant?.archetypeId).toBe('partyPaulie')
    expect(b.units[1].tenant).toBeNull()
  })

  it('consumes both base mortgage slots from week one', () => {
    const s = as('svetlana')
    expect(s.properties.filter((p) => p.mortgage).length).toBe(
      P3.BASE_MORTGAGE_SLOTS,
    )
  })

  it('evicts for $0 and 1 AP, with her own line', () => {
    const s = as('svetlana')
    expect(evictCost(s)).toBe(0)
    const p = s.properties[0]
    const out = reducer(s, {
      type: 'EVICT',
      propertyId: p.id,
      unitId: p.units[0].id,
    })
    expect(out.cash).toBe(0)
    expect(out.ap).toBe(s.ap - 1)
    expect(out.log[0].text).toContain('There is never a modal')
  })
})

/* ------------------------------------------------------------- §9.9 */

describe('blaine', () => {
  it('bills marketing at 75%, rounded', () => {
    const ids = CHANNELS.map((c) => c.id)
    const blaine: GameState = { ...as('blaine'), activeChannelIds: ids }
    const you: GameState = { ...as('you'), activeChannelIds: ids }
    const expected = CHANNELS.reduce(
      (t, c) => t + Math.round(c.weeklyCost * 0.75),
      0,
    )
    expect(weeklyChannelSpend(blaine)).toBe(expected)
    expect(weeklyChannelSpend(you)).toBe(
      CHANNELS.reduce((t, c) => t + c.weeklyCost, 0),
    )
  })

  it('decays reputation twice as fast and fades once per dry spell', () => {
    const s: GameState = { ...as('blaine'), reputation: 20 }
    const out = reducer(s, { type: 'END_WEEK' })
    expect(20 - out.reputation).toBe(2)
    expect(out.log.some((l) => l.text.includes("called him 'Brian.'"))).toBe(true)
    const next = reducer(out, { type: 'END_WEEK' })
    expect(
      next.log.filter((l) => l.text.includes("called him 'Brian.'")),
    ).toHaveLength(1)
  })

  it('unlocks TikTok at Junior, for him only', () => {
    const tiktok = CHANNELS.find((c) => c.id === 'tiktok')!
    expect(isChannelLocked({ ...as('blaine'), rank: 'junior' }, tiktok)).toBe(
      false,
    )
    expect(isChannelLocked({ ...as('you'), rank: 'junior' }, tiktok)).toBe(true)
  })
})

/* ------------------------------------------------------------ §9.10 */

describe('terri', () => {
  it('floors at swagger 1 despite −2', () => {
    const s = as('terri')
    expect(deriveStats(s).swagger).toBe(P5.STAT_MOD_FLOOR)
  })

  it('is the only one shown raw numbers', () => {
    expect(hasFlag(as('terri'), 'showRawNumbers')).toBe(true)
    expect(hasFlag(as('you'), 'showRawNumbers')).toBe(false)
  })
})

/* ------------------------------------------------------------ §9.12 */

describe('saves and brags', () => {
  it('migrates a pre-roster save to "you" with no modifiers', () => {
    const out = migrate({ version: 3, week: 4, cash: 900, rank: 'junior' })!
    expect(out.version).toBe(8)
    expect(out.characterId).toBe('you')
    expect(out.statModifiers).toEqual([])
  })

  it('keeps a known characterId through a round trip', () => {
    const out = migrate({ ...as('doreen'), version: 4 })!
    expect(out.characterId).toBe('doreen')
  })

  it('puts character brags in the rotation at every rank', () => {
    setSeed(7)
    const s = as('hunter')
    const seen = new Set<string>()
    for (let i = 0; i < 400; i++) seen.add(bragFor(s))
    const mine = getChar(s).brags.filter((b) => seen.has(b))
    expect(mine.length).toBe(4)
  })
})
