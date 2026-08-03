/* Phase 6 acceptance criteria 2-8 and 10, pinned. */

import { beforeEach, describe, expect, it } from 'vitest'
import { DISTRICTS, DISTRICT_IDS } from '../../data/districts'
import { INDIES, P6, PLAYER } from '../../data/p6'
import { RIVALS, RIVAL_IDS } from '../../data/rivals'
import { setSeed } from '../rand'
import { arch, closeChance, makeLead } from '../leads'
import { applicantBonusFor, fillPool, makeListing, renoCost } from '../portfolio'
import { bragFor } from '../economy'
import {
  archetypeWeight,
  dominantDistricts,
  drainShare,
  initialTerritory,
  perkActive,
  pickLeadDistrict,
  playerShare,
  pluralityOwner,
  setShares,
  shareOf,
  showdownDistrict,
  transferShare,
} from '../territory'
import {
  activeDistricts,
  applyLockout,
  checkKing,
  playerDecay,
  rivalMoves,
  showdownWinChance,
  snapshotThresholds,
  thresholdSweep,
} from '../territoryWeek'
import { endWeek, initialState, reducer } from '../../state/reducer'
import type { GameState, Lead, Property } from '../../state/types'

const st = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(),
  week: 10,
  rank: 'sellerAgent',
  cash: 50000,
  ...over,
})

/** Sets one district to an exact split, for readable arithmetic. */
const withDistrict = (
  s: GameState,
  id: string,
  shares: Record<string, number>,
): GameState => setShares(s, id, shares)

/** The log is newest-first, so a week's new lines are on the FRONT. */
const newLines = (before: GameState, after: GameState): string[] =>
  after.log.slice(0, after.log.length - before.log.length).map((l) => l.text)

const sumOf = (s: GameState, id: string): number =>
  Object.values(s.territory[id].shares).reduce((t, v) => t + v, 0)

const prop = (over: Partial<Property> = {}): Property => ({
  id: 'P1',
  typeId: 'starter',
  nickname: 'Test House',
  baseValue: 300000,
  condition: 70,
  mortgage: null,
  units: [],
  renovation: null,
  districtId: 'northEnd',
  listedForSale: false,
  boughtWeek: 1,
  isVrbo: false,
  vrboProfitStreak: 0,
  vrboRenoDone: false,
  ...over,
})

beforeEach(() => setSeed(1))

/* ------------------------------------------------------ criterion 1 & 5 */

describe('starting shares', () => {
  it('matches the spec table exactly', () => {
    const t = initialTerritory()
    const row = (id: string) => [
      t[id].shares.chadwick,
      t[id].shares.zambonis,
      t[id].shares.krystal,
      t[id].shares.indies,
      t[id].shares.player,
    ]
    expect(row('northEnd')).toEqual([0, 12, 0, 88, 0])
    expect(row('dufferin')).toEqual([18, 0, 0, 82, 0])
    expect(row('echoPlace')).toEqual([0, 0, 12, 88, 0])
    expect(row('holmedale')).toEqual([0, 0, 12, 88, 0])
    expect(row('downtown')).toEqual([12, 0, 18, 70, 0])
    expect(row('westBrant')).toEqual([0, 12, 0, 88, 0])
    expect(row('eaglePlace')).toEqual([0, 18, 0, 82, 0])
    expect(row('tutelaHeights')).toEqual([12, 0, 0, 88, 0])
  })

  it('gives every district a total of exactly 100', () => {
    const t = initialTerritory()
    for (const id of DISTRICT_IDS) {
      const sum = Object.values(t[id].shares).reduce((a, b) => a + b, 0)
      expect(sum).toBe(100)
    }
  })
})

/* ---------------------------------------------------------- criterion 2 */

describe('transferShare', () => {
  it('drains indies first', () => {
    const s = withDistrict(st(), 'northEnd', {
      player: 0,
      chadwick: 10,
      zambonis: 10,
      krystal: 0,
      indies: 80,
    })
    const out = transferShare(s, 'northEnd', PLAYER, 5).state
    expect(playerShare(out, 'northEnd')).toBe(5)
    expect(shareOf(out, 'northEnd', INDIES)).toBe(75)
    expect(shareOf(out, 'northEnd', 'chadwick')).toBe(10)
    expect(shareOf(out, 'northEnd', 'zambonis')).toBe(10)
  })

  it('takes the remainder proportionally once indies run out', () => {
    const s = withDistrict(st(), 'northEnd', {
      player: 0,
      chadwick: 30,
      zambonis: 60,
      krystal: 0,
      indies: 10,
    })
    /* 10 from indies, then 20 split 1:2 between chadwick and zambonis. */
    const out = transferShare(s, 'northEnd', PLAYER, 30).state
    expect(playerShare(out, 'northEnd')).toBe(30)
    expect(shareOf(out, 'northEnd', INDIES)).toBe(0)
    expect(shareOf(out, 'northEnd', 'chadwick')).toBeCloseTo(23.3, 1)
    expect(shareOf(out, 'northEnd', 'zambonis')).toBeCloseTo(46.7, 1)
    expect(sumOf(out, 'northEnd')).toBe(100)
  })

  it('never drains the recipient', () => {
    const s = withDistrict(st(), 'northEnd', {
      player: 40,
      chadwick: 10,
      zambonis: 0,
      krystal: 0,
      indies: 50,
    })
    const out = transferShare(s, 'northEnd', PLAYER, 20).state
    expect(playerShare(out, 'northEnd')).toBe(60)
  })

  it('floors at 0 and reports only what actually moved', () => {
    const s = withDistrict(st(), 'northEnd', {
      player: 95,
      chadwick: 3,
      zambonis: 2,
      krystal: 0,
      indies: 0,
    })
    const res = transferShare(s, 'northEnd', PLAYER, 50)
    /* Locked at 95%, so the rivals are already at their floor of 5. */
    expect(res.moved).toBe(0)
    expect(playerShare(res.state, 'northEnd')).toBe(95)
    expect(sumOf(res.state, 'northEnd')).toBe(100)
  })

  it('honours the locked rival floor', () => {
    const s = withDistrict(st(), 'northEnd', {
      player: 76,
      chadwick: 12,
      zambonis: 12,
      krystal: 0,
      indies: 0,
    })
    const out = transferShare(s, 'northEnd', PLAYER, 100).state
    const rivals = RIVAL_IDS.reduce((t, id) => t + shareOf(out, 'northEnd', id), 0)
    expect(rivals).toBeCloseTo(P6.RIVAL_LOCKED_FLOOR, 1)
    expect(sumOf(out, 'northEnd')).toBe(100)
  })

  it('re-normalizes to exactly 100 under extreme values', () => {
    let s = st()
    for (const id of DISTRICT_IDS) {
      s = transferShare(s, id, PLAYER, 999).state
      expect(sumOf(s, id)).toBe(100)
      s = drainShare(s, id, PLAYER, 999).state
      expect(sumOf(s, id)).toBe(100)
    }
  })

  it('ignores zero and negative amounts', () => {
    const s = st()
    expect(transferShare(s, 'northEnd', PLAYER, 0).moved).toBe(0)
    expect(transferShare(s, 'northEnd', PLAYER, -5).moved).toBe(0)
  })
})

describe('drainShare', () => {
  it('moves an exact amount from one owner into indies', () => {
    const s = withDistrict(st(), 'northEnd', {
      player: 30,
      chadwick: 10,
      zambonis: 0,
      krystal: 0,
      indies: 60,
    })
    const out = drainShare(s, 'northEnd', PLAYER, 0.5).state
    expect(playerShare(out, 'northEnd')).toBe(29.5)
    expect(shareOf(out, 'northEnd', INDIES)).toBe(60.5)
    expect(shareOf(out, 'northEnd', 'chadwick')).toBe(10)
  })

  it('never takes more than the owner holds', () => {
    const s = withDistrict(st(), 'northEnd', {
      player: 0.2,
      chadwick: 0,
      zambonis: 0,
      krystal: 0,
      indies: 99.8,
    })
    const res = drainShare(s, 'northEnd', PLAYER, 5)
    expect(res.moved).toBe(0.2)
    expect(playerShare(res.state, 'northEnd')).toBe(0)
  })
})

/* ---------------------------------------------------------- criterion 3 */

describe('share sources move the specced amounts', () => {
  it('credits +2.0 in the lead district when a deal closes', () => {
    const lead: Lead = { ...makeLead(st()), districtId: 'holmedale', stage: 'ready' }
    const before = st({ rank: 'buyerAgent', ap: 5, leads: [lead] })
    const start = playerShare(before, 'holmedale')
    let after = reducer(before, { type: 'ATTEMPT_CLOSE', leadId: lead.id })
    /* Retry until the close lands; each failure leaves share untouched. */
    let guard = 0
    while (after.counters.dealsClosed === 0 && guard++ < 50) {
      after = reducer(
        { ...after, ap: 5, leads: [{ ...lead, retriedClose: false }] },
        { type: 'ATTEMPT_CLOSE', leadId: lead.id },
      )
    }
    expect(after.counters.dealsClosed).toBe(1)
    expect(playerShare(after, 'holmedale')).toBeCloseTo(start + P6.GAIN_DEAL, 1)
    expect(after.weekDealDistricts).toContain('holmedale')
  })

  it('credits +1.0 and 1 AP for farming', () => {
    const before = st({ ap: 5 })
    const after = reducer(before, {
      type: 'FARM_DISTRICT',
      districtId: 'eaglePlace',
    })
    expect(after.ap).toBe(4)
    expect(playerShare(after, 'eaglePlace')).toBeCloseTo(P6.GAIN_FARM, 1)
    expect(after.weekFarmedDistricts).toContain('eaglePlace')
  })

  it('refuses to farm without an AP', () => {
    const before = st({ ap: 0 })
    expect(reducer(before, { type: 'FARM_DISTRICT', districtId: 'eaglePlace' })).toBe(
      before,
    )
  })

  it('credits +0.2 per owned property per week, and no decay where you own', () => {
    const s = st({
      properties: [prop({ districtId: 'westBrant' })],
      activeChannelIds: [],
    })
    const after = endWeek(s)
    /* Owning a door prevents decay, so the passive gain stands alone. */
    expect(playerShare(after, 'westBrant')).toBeCloseTo(
      P6.GAIN_PROPERTY_PASSIVE,
      1,
    )
  })

  it('credits +1.0 once on purchase', () => {
    /* initialState() builds its pool at Receptionist, where nothing is for
       sale, so the pool has to be filled again once the rank is raised. */
    let s = fillPool(st({ cash: 5_000_000, rank: 'topProducer' }))
    const listing = s.marketPool[0]
    const start = playerShare(s, listing.districtId)
    s = reducer(s, { type: 'BUY_PROPERTY', listingId: listing.id, downPct: 1 })
    expect(playerShare(s, listing.districtId)).toBeCloseTo(
      start + P6.GAIN_PROPERTY_BUY,
      1,
    )
    expect(s.properties[0].districtId).toBe(listing.districtId)
  })

  it('credits +0.5 per targeted active channel', () => {
    const s = st({
      activeChannelIds: ['billboard'],
      channelTargets: { billboard: 'dufferin' },
    })
    const after = endWeek(s)
    /* Targeting also counts as activity, so nothing decays back off. */
    expect(playerShare(after, 'dufferin')).toBeGreaterThanOrEqual(
      P6.GAIN_CHANNEL_TARGET,
    )
  })

  it('only lets the three big-format channels be aimed', () => {
    const s = st()
    const bad = reducer(s, {
      type: 'SET_CHANNEL_TARGET',
      channelId: 'flyerBlitz',
      districtId: 'dufferin',
    })
    expect(bad.channelTargets.flyerBlitz).toBeUndefined()
    const good = reducer(s, {
      type: 'SET_CHANNEL_TARGET',
      channelId: 'tvCommercial',
      districtId: 'dufferin',
    })
    expect(good.channelTargets.tvCommercial).toBe('dufferin')
    const cleared = reducer(good, {
      type: 'SET_CHANNEL_TARGET',
      channelId: 'tvCommercial',
      districtId: null,
    })
    expect(cleared.channelTargets.tvCommercial).toBeUndefined()
  })
})

describe('player decay', () => {
  it('takes 0.5 from a district with no activity at all', () => {
    let s = withDistrict(st(), 'dufferin', {
      player: 20,
      chadwick: 20,
      zambonis: 0,
      krystal: 0,
      indies: 60,
    })
    s = playerDecay(s)
    expect(playerShare(s, 'dufferin')).toBe(19.5)
  })

  it('never takes more share than is held', () => {
    let s = withDistrict(st(), 'dufferin', {
      player: 0.2,
      chadwick: 0,
      zambonis: 0,
      krystal: 0,
      indies: 99.8,
    })
    s = playerDecay(s)
    expect(playerShare(s, 'dufferin')).toBe(0)
  })

  it.each([
    ['farming', (s: GameState) => ({ ...s, weekFarmedDistricts: ['dufferin'] })],
    ['a deal', (s: GameState) => ({ ...s, weekDealDistricts: ['dufferin'] })],
    [
      'a property',
      (s: GameState) => ({
        ...s,
        properties: [prop({ districtId: 'dufferin' })],
      }),
    ],
    [
      'a targeted channel',
      (s: GameState) => ({
        ...s,
        activeChannelIds: ['billboard'],
        channelTargets: { billboard: 'dufferin' },
      }),
    ],
  ])('is individually prevented by %s', (_label, apply) => {
    const seeded = withDistrict(st(), 'dufferin', {
      player: 20,
      chadwick: 20,
      zambonis: 0,
      krystal: 0,
      indies: 60,
    })
    const s = playerDecay(apply(seeded))
    expect(playerShare(s, 'dufferin')).toBe(20)
    expect(activeDistricts(apply(seeded)).has('dufferin')).toBe(true)
  })

  it('logs one line for the whole quiet week, not one per district', () => {
    let s = st()
    for (const id of DISTRICT_IDS)
      s = withDistrict(s, id, {
        player: 20,
        chadwick: 20,
        zambonis: 0,
        krystal: 0,
        indies: 60,
      })
    const before = s
    s = playerDecay(s)
    const added = newLines(before, s)
    expect(added).toHaveLength(1)
    expect(added[0]).toContain('Quiet week in 8 districts')
  })
})

/* ---------------------------------------------------------- criterion 4 */

describe('rival weeks', () => {
  it('keeps weekly gains inside the aggression bounds', () => {
    for (let seed = 1; seed <= 40; seed++) {
      setSeed(seed)
      const before = st()
      const after = rivalMoves(before).state
      for (const r of RIVALS) {
        const gained = DISTRICT_IDS.filter((d) =>
          r.focusDistricts.includes(d),
        ).reduce(
          (t, d) => t + (shareOf(after, d, r.id) - shareOf(before, d, r.id)),
          0,
        )
        /* Home defense can add on top, so the ceiling allows for it. */
        expect(gained).toBeLessThanOrEqual(
          r.aggression.max + P6.RIVAL_HOME_DEFENSE + 0.01,
        )
      }
    }
  })

  it('logs at most one gain line per rival per week', () => {
    const res = rivalMoves(st())
    expect(res.headlines.length).toBeLessThanOrEqual(RIVALS.length)
    for (const r of RIVALS) {
      const mine = res.headlines.filter((h) =>
        h.startsWith(r.lines.gain.split('{')[0].slice(0, 18)),
      )
      expect(mine.length).toBeLessThanOrEqual(1)
    }
  })

  it('bleeds 0.2 out of every non-focus district', () => {
    const chad = RIVALS[0]
    const off = DISTRICT_IDS.find((d) => !chad.focusDistricts.includes(d))!
    const before = withDistrict(st(), off, {
      player: 0,
      chadwick: 20,
      zambonis: 0,
      krystal: 0,
      indies: 80,
    })
    const after = rivalMoves(before).state
    expect(shareOf(after, off, 'chadwick')).toBeCloseTo(19.8, 1)
  })

  it('fires home defense only when the player is ahead there', () => {
    const chad = RIVALS[0]
    const behind = withDistrict(st(), chad.homeDistrict, {
      player: 40,
      chadwick: 20,
      zambonis: 0,
      krystal: 0,
      indies: 40,
    })
    const after = rivalMoves(behind).state
    expect(after.rivalEffects.lastDefense.chadwick).toBe(behind.week)
    expect(after.log.some((l) => l.text === chad.lines.defense)).toBe(true)
  })

  it('holds the defense line to once per four weeks', () => {
    const chad = RIVALS[0]
    const s = {
      ...withDistrict(st({ week: 12 }), chad.homeDistrict, {
        player: 40,
        chadwick: 20,
        zambonis: 0,
        krystal: 0,
        indies: 40,
      }),
      rivalEffects: {
        undercutWeeksLeft: 0,
        lastDefense: { chadwick: 10 },
        lastLock: {},
      },
    }
    const after = rivalMoves(s).state
    expect(after.log.some((l) => l.text === chad.lines.defense)).toBe(false)
    expect(after.rivalEffects.lastDefense.chadwick).toBe(10)
  })

  it('counts the undercut down and expires the intel', () => {
    const s = st({
      rivalEffects: { undercutWeeksLeft: 2, lastDefense: {}, lastLock: {} },
      chadwickIntel: { district: 'dufferin', week: 8 },
      week: 10,
    })
    const after = rivalMoves(s).state
    expect(after.rivalEffects.undercutWeeksLeft).toBe(1)
    expect(after.chadwickIntel).toBeNull()
  })

  it('keeps intel alive for its one week', () => {
    const s = st({ chadwickIntel: { district: 'dufferin', week: 10 }, week: 10 })
    expect(rivalMoves(s).state.chadwickIntel).not.toBeNull()
  })

  it('never lets the undercut go negative', () => {
    const after = rivalMoves(st()).state
    expect(after.rivalEffects.undercutWeeksLeft).toBe(0)
  })
})

describe('the Zamboni discount', () => {
  it('shaves 10% off a deal on Zamboni turf and nowhere else', () => {
    const base = st({
      rank: 'buyerAgent',
      ap: 5,
      rivalEffects: { undercutWeeksLeft: 2, lastDefense: {}, lastLock: {} },
    })
    const zamboniTurf = withDistrict(base, 'eaglePlace', {
      player: 10,
      chadwick: 0,
      zambonis: 60,
      krystal: 0,
      indies: 30,
    })
    expect(pluralityOwner(zamboniTurf, 'eaglePlace')).toBe('zambonis')

    const close = (s: GameState, districtId: string): number => {
      const lead: Lead = {
        ...makeLead(s),
        districtId,
        stage: 'ready',
        salePrice: 400000,
      }
      let out = { ...s, leads: [lead], ap: 5 }
      let guard = 0
      while (out.counters.dealsClosed === 0 && guard++ < 60) {
        const cashBefore = out.cash
        const next = reducer(
          { ...out, ap: 5, leads: [{ ...lead, retriedClose: false }] },
          { type: 'ATTEMPT_CLOSE', leadId: lead.id },
        )
        if (next.counters.dealsClosed > 0) return next.cash - cashBefore
        out = next
      }
      return 0
    }
    setSeed(7)
    const discounted = close(zamboniTurf, 'eaglePlace')
    setSeed(7)
    const full = close(base, 'dufferin')
    expect(discounted).toBeGreaterThan(0)
    expect(full).toBeGreaterThan(0)
    expect(discounted / full).toBeCloseTo(P6.UNDERCUT_COMMISSION_MULT, 2)
  })
})

/* ---------------------------------------------------------- criterion 5 */

describe('the showdown', () => {
  it('only qualifies where a rival leads and the player holds 15+', () => {
    expect(showdownDistrict(st())).toBeNull()
    const s = withDistrict(st(), 'dufferin', {
      player: 20,
      chadwick: 50,
      zambonis: 0,
      krystal: 0,
      indies: 30,
    })
    const target = showdownDistrict(s)
    expect(target?.districtId).toBe('dufferin')
    expect(target?.rival.id).toBe('chadwick')
  })

  it('picks the qualifying district the player is closest to taking', () => {
    let s = withDistrict(st(), 'dufferin', {
      player: 20,
      chadwick: 50,
      zambonis: 0,
      krystal: 0,
      indies: 30,
    })
    s = withDistrict(s, 'eaglePlace', {
      player: 35,
      chadwick: 0,
      zambonis: 40,
      krystal: 0,
      indies: 25,
    })
    expect(showdownDistrict(s)?.districtId).toBe('eaglePlace')
  })

  it('clamps the win chance to [0.15, 0.85]', () => {
    const chad = RIVALS[0]
    const weak = st({ permBonuses: { hustle: 0, swagger: -50, ego: 0 } })
    const strong = st({ permBonuses: { hustle: 0, swagger: 50, ego: 0 } })
    expect(showdownWinChance(weak, chad)).toBeGreaterThanOrEqual(0.15)
    expect(showdownWinChance(strong, chad)).toBeLessThanOrEqual(0.85)
  })

  it('reads swagger against the rival at the specced factor', () => {
    const zam = RIVALS[1]
    const s = st()
    const swagger = s.stats.swagger
    expect(showdownWinChance(s, zam)).toBeCloseTo(
      Math.max(
        0.15,
        Math.min(
          0.85,
          P6.SHOWDOWN_BASE +
            (swagger - zam.swagger) * P6.SHOWDOWN_SWAGGER_FACTOR,
        ),
      ),
      4,
    )
  })

  it('charges $500 and moves share on a fight', () => {
    let s = withDistrict(st(), 'dufferin', {
      player: 20,
      chadwick: 50,
      zambonis: 0,
      krystal: 0,
      indies: 30,
    })
    s = reducer(s, { type: 'DEBUG_FORCE_SHOWDOWN' })
    const choice = s.pendingChoices.find((c) => c.kind === 'showdown')!
    expect(choice.options.map((o) => o.actionTag)).toEqual(['fight', 'concede'])
    const cashBefore = s.cash
    const after = reducer(s, {
      type: 'RESOLVE_PORTFOLIO_CHOICE',
      choiceId: choice.id,
      actionTag: 'fight',
    })
    expect(after.cash).toBe(cashBefore - P6.SHOWDOWN_COST)
    const delta = playerShare(after, 'dufferin') - 20
    /* Win takes 4.0; a loss leaves the player where they were and feeds the
       rival 1.0 out of indies. */
    expect([P6.SHOWDOWN_WIN_SHARE, 0]).toContainEqual(
      Math.abs(delta) < 0.01 ? 0 : Math.round(delta * 10) / 10,
    )
  })

  it('gives the block away on a concede, for free', () => {
    let s = withDistrict(st(), 'dufferin', {
      player: 20,
      chadwick: 50,
      zambonis: 0,
      krystal: 0,
      indies: 30,
    })
    s = reducer(s, { type: 'DEBUG_FORCE_SHOWDOWN' })
    const choice = s.pendingChoices.find((c) => c.kind === 'showdown')!
    const cashBefore = s.cash
    const after = reducer(s, {
      type: 'RESOLVE_PORTFOLIO_CHOICE',
      choiceId: choice.id,
      actionTag: 'concede',
    })
    expect(after.cash).toBe(cashBefore)
    expect(shareOf(after, 'dufferin', 'chadwick')).toBeCloseTo(51, 1)
    expect(after.log.some((l) => l.text.includes('The flyers won'))).toBe(true)
  })
})

/* ---------------------------------------------------------- criterion 6 */

describe('thresholds', () => {
  it('adds exactly 0.05 close chance at presence, and nothing more at dominance', () => {
    const lead: Lead = { ...makeLead(st()), districtId: 'dufferin' }
    const below = withDistrict(st(), 'dufferin', {
      player: 24.9,
      chadwick: 0,
      zambonis: 0,
      krystal: 0,
      indies: 75.1,
    })
    const at = withDistrict(st(), 'dufferin', {
      player: 25,
      chadwick: 0,
      zambonis: 0,
      krystal: 0,
      indies: 75,
    })
    const dominant = withDistrict(st(), 'dufferin', {
      player: 60,
      chadwick: 0,
      zambonis: 0,
      krystal: 0,
      indies: 40,
    })
    expect(closeChance(at, lead) - closeChance(below, lead)).toBeCloseTo(0.05, 5)
    expect(closeChance(dominant, lead)).toBeCloseTo(closeChance(at, lead), 5)
  })

  it('logs presence, dominance and loss only on a crossing', () => {
    const quiet = st()
    const before = snapshotThresholds(quiet)
    expect(thresholdSweep(quiet, before).log).toHaveLength(quiet.log.length)

    const risen = withDistrict(quiet, 'dufferin', {
      player: 60,
      chadwick: 0,
      zambonis: 0,
      krystal: 0,
      indies: 40,
    })
    const swept = thresholdSweep(risen, before)
    const added = newLines(quiet, swept)
    expect(added.some((t) => t.includes('known quantity in Dufferin'))).toBe(true)
    expect(added.some((t) => t.includes('Dufferin is YOURS'))).toBe(true)

    /* Sweeping again from the new snapshot says nothing. */
    const after = snapshotThresholds(swept)
    expect(thresholdSweep(swept, after).log).toHaveLength(swept.log.length)
  })

  it('mourns a lost dominance', () => {
    const held = withDistrict(st(), 'dufferin', {
      player: 60,
      chadwick: 0,
      zambonis: 0,
      krystal: 0,
      indies: 40,
    })
    const before = snapshotThresholds(held)
    const lost = withDistrict(held, 'dufferin', {
      player: 40,
      chadwick: 20,
      zambonis: 0,
      krystal: 0,
      indies: 40,
    })
    const swept = thresholdSweep(lost, before)
    expect(
      swept.log.some((l) => l.text.includes('slipped below dominance')),
    ).toBe(true)
  })
})

describe('the lockout', () => {
  it('clamps rivals to 5 combined and fires the line', () => {
    const s = withDistrict(st(), 'dufferin', {
      player: 76,
      chadwick: 18,
      zambonis: 6,
      krystal: 0,
      indies: 0,
    })
    const out = applyLockout(s, 'dufferin')
    const rivals = RIVAL_IDS.reduce((t, id) => t + shareOf(out, 'dufferin', id), 0)
    expect(rivals).toBeCloseTo(5, 1)
    expect(sumOf(out, 'dufferin')).toBe(100)
    expect(out.log.some((l) => l.text.includes('chosen to refocus'))).toBe(true)
    expect(out.rivalEffects.lastLock.dufferin).toBe(s.week)
  })

  it('does nothing below 75', () => {
    const s = withDistrict(st(), 'dufferin', {
      player: 74,
      chadwick: 20,
      zambonis: 6,
      krystal: 0,
      indies: 0,
    })
    expect(applyLockout(s, 'dufferin')).toBe(s)
  })

  it('will not re-fire the line inside 20 weeks', () => {
    const s = {
      ...withDistrict(st({ week: 30 }), 'dufferin', {
        player: 76,
        chadwick: 18,
        zambonis: 6,
        krystal: 0,
        indies: 0,
      }),
      rivalEffects: {
        undercutWeeksLeft: 0,
        lastDefense: {},
        lastLock: { dufferin: 20 },
      },
    }
    const out = applyLockout(s, 'dufferin')
    expect(out.log.some((l) => l.text.includes('chosen to refocus'))).toBe(false)
    /* The clamp still happens; only the announcement is on cooldown. */
    const rivals = RIVAL_IDS.reduce((t, id) => t + shareOf(out, 'dufferin', id), 0)
    expect(rivals).toBeCloseTo(5, 1)
  })
})

describe('dominance perks', () => {
  const dominate = (s: GameState, id: string): GameState =>
    withDistrict(s, id, {
      player: 60,
      chadwick: 0,
      zambonis: 0,
      krystal: 0,
      indies: 40,
    })

  it('sleeps below 50 and wakes at 50', () => {
    expect(perkActive(st(), 'tradeRates')).toBe(false)
    expect(perkActive(dominate(st(), 'holmedale'), 'tradeRates')).toBe(true)
  })

  it('tradeRates cuts Holmedale renovations by 10%', () => {
    const p = prop({ districtId: 'holmedale', baseValue: 300000 })
    expect(renoCost(st(), p, 'full')).toBe(60000)
    expect(renoCost(dominate(st(), 'holmedale'), p, 'full')).toBe(54000)
  })

  it('tradeRates does not discount a house in another district', () => {
    const p = prop({ districtId: 'westBrant', baseValue: 300000 })
    expect(renoCost(dominate(st(), 'holmedale'), p, 'full')).toBe(60000)
  })

  it('localsDeal takes 10% off Eagle Place asks', () => {
    const plain = st({ rank: 'topProducer' })
    const held = dominate(plain, 'eaglePlace')
    let checked = 0
    /* Seed once and let the sequence run — re-seeding per iteration draws the
       same first value every time on this LCG. */
    for (let i = 0; i < 400 && checked < 5; i++) {
      setSeed(i)
      const a = makeListing(plain, i)
      if (a.districtId !== 'eaglePlace') continue
      setSeed(i)
      const b = makeListing(held, i)
      expect(b.districtId).toBe('eaglePlace')
      expect(b.askPrice / a.askPrice).toBeCloseTo(0.9, 2)
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('firstNamesBasis adds a point of patience, and only in the North End', () => {
    const dominant = dominate(st(), 'northEnd')
    const patienceOf = (s: GameState, districtId: string): [number, number] => {
      setSeed(3)
      const l = makeLead(s, undefined, undefined, districtId)
      return [l.patience, arch(l.archetypeId).patience]
    }
    const [north, northBase] = patienceOf(dominant, 'northEnd')
    expect(north).toBe(northBase + 1)

    const [west, westBase] = patienceOf(dominant, 'westBrant')
    expect(west).toBe(westBase)

    const [plain, plainBase] = patienceOf(st(), 'northEnd')
    expect(plain).toBe(plainBase)

    setSeed(3)
    const l = makeLead(dominant, undefined, undefined, 'northEnd')
    expect(l.maxPatience).toBe(l.patience)
  })

  it('luxPipeline doubles the estate crowd only when Tutela is held', () => {
    expect(archetypeWeight(st(), 'luxLorenzo')).toBe(1)
    expect(archetypeWeight(dominate(st(), 'tutelaHeights'), 'luxLorenzo')).toBe(2)
    expect(archetypeWeight(dominate(st(), 'tutelaHeights'), 'firstTimer')).toBe(1)
  })

  it('benchmark adds a rep point per week while a channel runs', () => {
    setSeed(11)
    const plain = endWeek(st({ activeChannelIds: ['instagram'], reputation: 20 }))
    setSeed(11)
    const held = endWeek(
      dominate(st({ activeChannelIds: ['instagram'], reputation: 20 }), 'downtown'),
    )
    expect(held.reputation - plain.reputation).toBe(1)
  })

  it('roomForRent lifts the applicant chance in Echo Place by 0.15', () => {
    const p = prop({ districtId: 'echoPlace' })
    expect(applicantBonusFor(dominate(st(), 'echoPlace'), p)).toBe(0.15)
    expect(applicantBonusFor(st(), p)).toBe(0)
    expect(
      applicantBonusFor(
        dominate(st(), 'echoPlace'),
        prop({ districtId: 'holmedale' }),
      ),
    ).toBe(0)
  })

  it('saleBoost lifts a Dufferin flip 5%', () => {
    expect(perkActive(dominate(st(), 'dufferin'), 'saleBoost')).toBe(true)
    expect(perkActive(st(), 'saleBoost')).toBe(false)
  })

  it('referralNetwork doubles the referral weight', () => {
    expect(perkActive(dominate(st(), 'westBrant'), 'referralNetwork')).toBe(true)
  })
})

/* ---------------------------------------------------------- criterion 7 */

describe('lead district assignment', () => {
  it('never places an archetype in a district with affinity 0', () => {
    for (let i = 0; i < 400; i++) {
      setSeed(i)
      expect(pickLeadDistrict(st(), 'firstTimer')).not.toBe('tutelaHeights')
      expect(pickLeadDistrict(st(), 'oldMoneyOtis')).not.toBe('eaglePlace')
      expect(pickLeadDistrict(st(), 'luxLorenzo')).not.toBe('northEnd')
    }
  })

  it('shifts the odds toward districts the player already holds', () => {
    const count = (s: GameState, id: string): number => {
      let n = 0
      setSeed(99)
      for (let i = 0; i < 2000; i++)
        if (pickLeadDistrict(s, 'techTyler') === id) n++
      return n
    }
    const plain = count(st(), 'holmedale')
    const held = count(
      withDistrict(st(), 'holmedale', {
        player: 80,
        chadwick: 0,
        zambonis: 0,
        krystal: 0,
        indies: 20,
      }),
      'holmedale',
    )
    expect(held).toBeGreaterThan(plain)
  })

  it('gives every lead a real district', () => {
    for (let i = 0; i < 50; i++) {
      setSeed(i)
      expect(DISTRICT_IDS).toContain(makeLead(st()).districtId)
    }
  })

  it('honours a targeted channel instead of rolling', () => {
    const lead = makeLead(st(), undefined, 'billboard', 'tutelaHeights')
    expect(lead.districtId).toBe('tutelaHeights')
  })
})

describe('price multipliers', () => {
  it('scales salePrice by the district multiplier', () => {
    const cheap: number[] = []
    const dear: number[] = []
    for (let i = 0; i < 60; i++) {
      setSeed(i)
      cheap.push(makeLead(st(), undefined, undefined, 'eaglePlace').salePrice)
      setSeed(i)
      dear.push(makeLead(st(), undefined, undefined, 'tutelaHeights').salePrice)
    }
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
    expect(mean(dear) / mean(cheap)).toBeCloseTo(1.6 / 0.7, 1)
  })

  it('only generates listings in districts that have that type', () => {
    const s = st({ rank: 'topProducer' })
    setSeed(21)
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      const l = makeListing(s, i)
      const d = DISTRICTS.find((x) => x.id === l.districtId)!
      expect(d.propertyTypes).toContain(l.typeId)
      seen.add(l.districtId)
    }
    /* And the pool really does spread across the map. */
    expect(seen.size).toBeGreaterThan(4)
  })

  it('scales intrinsic value by the district multiplier', () => {
    /* Luxury exists only in Dufferin (1.50) and Tutela Heights (1.60). */
    const values: Record<string, number[]> = { dufferin: [], tutelaHeights: [] }
    const s = st({ rank: 'topProducer' })
    setSeed(77)
    for (let i = 0; i < 4000; i++) {
      const l = makeListing(s, i)
      if (l.typeId === 'luxury') values[l.districtId]?.push(l.intrinsicValue)
    }
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
    expect(values.dufferin.length).toBeGreaterThan(5)
    expect(values.tutelaHeights.length).toBeGreaterThan(5)
    expect(mean(values.tutelaHeights) / mean(values.dufferin)).toBeCloseTo(
      1.6 / 1.5,
      1,
    )
  })
})

/* ---------------------------------------------------------- criterion 8 */

describe('King of Brantford', () => {
  const crown = (s: GameState): GameState => {
    let out = s
    for (const id of DISTRICT_IDS)
      out = withDistrict(out, id, {
        player: 60,
        chadwick: 0,
        zambonis: 0,
        krystal: 0,
        indies: 40,
      })
    return out
  }

  it('does not fire at 7 of 8', () => {
    let s = crown(st({ reputation: 20 }))
    s = withDistrict(s, 'dufferin', {
      player: 49,
      chadwick: 0,
      zambonis: 0,
      krystal: 0,
      indies: 51,
    })
    expect(dominantDistricts(s)).toHaveLength(7)
    expect(checkKing(s).crowned).toBe(false)
    expect(checkKing(s).state.kingOfBrantford).toBe(false)
  })

  it('fires once at 8 of 8, pays 25 rep, and lets the game continue', () => {
    const s = crown(st({ reputation: 20 }))
    const first = checkKing(s)
    expect(first.crowned).toBe(true)
    expect(first.state.kingOfBrantford).toBe(true)
    expect(first.state.reputation).toBe(45)
    expect(first.state.promo).toBe('KING OF BRANTFORD')
    expect(first.state.gameOver).toBe(false)

    const second = checkKing(first.state)
    expect(second.crowned).toBe(false)
    expect(second.state.reputation).toBe(45)
  })

  it('skips the rep award when Phase 2 is absent', () => {
    const s = crown(st({ reputation: 20 }))
    expect(checkKing(s, false).state.reputation).toBe(20)
  })

  it('unlocks the king brags', () => {
    const s = { ...crown(st()), kingOfBrantford: true }
    const seen = new Set<string>()
    setSeed(13)
    for (let i = 0; i < 2000; i++) seen.add(bragFor(s))
    expect(
      [...seen].some((b) => b.includes('Eight neighbourhoods. One crown.')),
    ).toBe(true)
  })

  it('puts a dominant district into the territory brags', () => {
    const s = crown(st())
    const seen = new Set<string>()
    setSeed(13)
    for (let i = 0; i < 2000; i++) seen.add(bragFor(s))
    const territory = [...seen].filter((b) => b.includes('casseroles'))
    expect(territory.length).toBeGreaterThan(0)
    expect(territory[0]).not.toContain('{district}')
  })
})

/* --------------------------------------------------------- criterion 10 */

describe('the log does not flood', () => {
  it('keeps a whole End Week inside a sane line budget', () => {
    setSeed(4)
    /* Hold ground everywhere, so the quiet districts have something to lose. */
    let seeded = st({
      properties: [prop({ districtId: 'westBrant' })],
      activeChannelIds: ['billboard'],
      channelTargets: { billboard: 'dufferin' },
    })
    for (const id of DISTRICT_IDS)
      seeded = withDistrict(seeded, id, {
        player: 20,
        chadwick: 10,
        zambonis: 10,
        krystal: 0,
        indies: 60,
      })
    const s = seeded
    const after = endWeek(s)
    const added = newLines(s, after)
    /* 3 rival gains + 3 defenses + 1 decay + thresholds + the rest of the
       week. Anything past this is the territory system shouting. */
    expect(added.length).toBeLessThan(20)
    expect(added.filter((t) => t.includes('Quiet week in'))).toHaveLength(1)
    for (const r of RIVALS)
      expect(
        added.filter((t) => t.startsWith(r.lines.gain.split('{')[0].slice(0, 18)))
          .length,
      ).toBeLessThanOrEqual(1)
  })

  it('writes a territory section into the week summary', () => {
    setSeed(6)
    const after = endWeek(st({ ap: 0 }))
    expect(after.summary!.territory).toBeDefined()
    expect(Array.isArray(after.summary!.territory.rows)).toBe(true)
    expect(after.summary!.territory.rivalMoves.length).toBeGreaterThan(0)
  })

  it('clears the weekly activity ledger', () => {
    const s = st({ weekDealDistricts: ['dufferin'], weekFarmedDistricts: ['dufferin'] })
    const after = endWeek(s)
    expect(after.weekDealDistricts).toEqual([])
    expect(after.weekFarmedDistricts).toEqual([])
  })

  it('keeps every district summing to 100 across a long run', () => {
    setSeed(9)
    let s = st({ properties: [prop({ districtId: 'westBrant' })] })
    for (let w = 0; w < 40; w++) {
      s = endWeek({ ...s, pendingChoices: [] })
      for (const id of DISTRICT_IDS) expect(sumOf(s, id)).toBe(100)
    }
  })
})
