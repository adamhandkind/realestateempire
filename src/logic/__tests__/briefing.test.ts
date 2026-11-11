import { describe, expect, it } from 'vitest'
import { REFI } from '../../data/p3'
import { initialState, reducer } from '../../state/reducer'
import type { GameState, Property, UnitState, WeekSummary } from '../../state/types'
import { buildBriefing, runwayOf, urgentCount, weeklyBills } from '../briefing'
import { displayedValue, refiQuote } from '../portfolio'

const unit = (over: Partial<UnitState> = {}): UnitState => ({
  id: 'P1-u0',
  tenant: null,
  rentR: 1.0,
  openIssue: null,
  evictionWeeksLeft: null,
  ...over,
})

const tenant = { archetypeId: 'perfectPatricia', name: 'Patricia', tenancyWeeks: 3, plannedStayWeeks: 40, owed: 0 }

const owned = (over: Partial<Property> = {}): Property => ({
  id: 'P1',
  typeId: 'starter',
  nickname: 'Starter Home on Dundurn',
  districtId: 'northEnd',
  baseValue: 300000,
  condition: 80,
  mortgage: null,
  units: [unit()],
  renovation: null,
  listedForSale: false,
  boughtWeek: 1,
  isVrbo: false,
  vrboProfitStreak: 0,
  vrboRenoDone: false,
  ...over,
})

const base = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(),
  week: 5,
  rank: 'sellerAgent',
  cash: 50000,
  marketPool: [],
  leads: [],
  ...over,
})

const summary = (over: Partial<WeekSummary> = {}): WeekSummary => ({
  week: 4,
  moneyIn: [['Rent', 2000]],
  moneyOut: [['Mortgage interest', 300]],
  events: [],
  marketing: { spend: 0, leads: 0, repChange: 0 },
  portfolio: [{ nickname: 'Starter Home on Dundurn', rentIn: 2000, moneyOut: 300, net: 1700, events: ['Renovation complete'] }],
  territory: { rows: [{ name: 'North End', delta: 2.5, holder: 'You' }], rivalMoves: ['Chadwick bought a billboard.'] },
  net: 1700,
  promo: null,
  brag: '',
  content: null,
  ...over,
})

describe('refiQuote', () => {
  it('lends LTV of today’s value, less the balance and the fee', () => {
    const s = base({ properties: [owned({ mortgage: { balance: 100000 } })] })
    const q = refiQuote(s, s.properties[0])
    const value = displayedValue(s, s.properties[0])
    expect(q.newBalance).toBe(Math.floor((value * REFI.LTV) / REFI.ROUND) * REFI.ROUND)
    expect(q.fee).toBe(Math.max(REFI.FEE_MIN, Math.round(q.newBalance * REFI.FEE_PCT)))
    expect(q.cashOut).toBe(q.newBalance - 100000 - q.fee)
    expect(q.blocked).toBeNull()
  })

  it('refuses mid-renovation, while listed, and with no equity', () => {
    const reno = base({ properties: [owned({ renovation: { projectId: 'cosmetic', weeksLeft: 1 } })] })
    expect(refiQuote(reno, reno.properties[0]).blocked).toMatch(/drywall/)
    const listed = base({ properties: [owned({ listedForSale: true })] })
    expect(refiQuote(listed, listed.properties[0]).blocked).toMatch(/sell/)
    const maxed = base({ properties: [owned({ mortgage: { balance: 210000 } })] })
    expect(refiQuote(maxed, maxed.properties[0]).blocked).toMatch(/equity/)
  })

  it('needs a free mortgage slot to put a loan on a paid-off house', () => {
    const props = [
      owned({ id: 'A', mortgage: { balance: 1 } }),
      owned({ id: 'B', mortgage: { balance: 1 } }),
      owned({ id: 'C' }),
    ]
    const s = base({ properties: props })
    expect(refiQuote(s, props[2]).blocked).toMatch(/slot/)
  })
})

describe('REFINANCE', () => {
  it('pays the cash out and resets the balance', () => {
    const s = base({ properties: [owned({ mortgage: { balance: 100000 } })] })
    const q = refiQuote(s, s.properties[0])
    const next = reducer(s, { type: 'REFINANCE', propertyId: 'P1' })
    expect(next.cash).toBe(s.cash + q.cashOut)
    expect(next.properties[0].mortgage).toEqual({ balance: q.newBalance })
    expect(next.log[0].text).toMatch(/refinanced/)
  })

  it('changes nothing but the log when blocked', () => {
    const s = base({ properties: [owned({ listedForSale: true, mortgage: { balance: 100000 } })] })
    const next = reducer(s, { type: 'REFINANCE', propertyId: 'P1' })
    expect(next.cash).toBe(s.cash)
    expect(next.properties[0].mortgage).toEqual({ balance: 100000 })
  })
})

describe('buildBriefing', () => {
  it('reports rent, projects, and the neighbourhood from the summary', () => {
    const s = base({ properties: [owned({ units: [unit({ tenant })] })], summary: summary() })
    const b = buildBriefing(s)
    expect(b.reportWeek).toBe(4)
    expect(b.net).toBe(1700)
    const rent = b.happened.find((h) => h.kind === 'rent')
    expect(rent?.amount).toBe(2000)
    expect(b.happened.some((h) => h.kind === 'project' && /Renovation complete/.test(h.text))).toBe(true)
    expect(b.happened.some((h) => h.kind === 'neighbourhood' && /North End: your share up 2.5%/.test(h.text))).toBe(true)
    expect(b.happened.some((h) => h.text === 'Chadwick bought a billboard.')).toBe(true)
  })

  it('shows the city’s auction results', () => {
    const s = base({ summary: summary() })
    const b = buildBriefing(s, { summary: s.summary, offers: ['You won 12 Elm St at $310,000.', 'Outbid on 4 Oak Ave.'] })
    const offers = b.happened.filter((h) => h.kind === 'offers')
    expect(offers.map((o) => o.tone)).toEqual(['good', 'bad'])
  })

  it('falls back to last week’s log when the summary is gone', () => {
    const s = base({ summary: null, log: [{ week: 4, kind: 'money', text: 'Rent came in.' }, { week: 3, kind: 'money', text: 'Old news.' }] })
    const b = buildBriefing(s)
    expect(b.net).toBeNull()
    expect(b.happened.some((h) => h.text === 'Rent came in.')).toBe(true)
    expect(b.happened.some((h) => h.text === 'Old news.')).toBe(false)
  })

  it('shows renovation progress', () => {
    const s = base({ properties: [owned({ renovation: { projectId: 'full', weeksLeft: 2 } })] })
    const h = buildBriefing(s).happened.find((x) => x.kind === 'project')
    expect(h?.text).toMatch(/Full Renovation at Starter Home on Dundurn: \d+% done, 2 weeks to go/)
  })

  it('flags vacancies, open issues, loans and finishing renovations', () => {
    const s = base({
      properties: [
        owned({ mortgage: { balance: 100000 } }),
        owned({
          id: 'P2',
          nickname: 'Duplex',
          units: [unit({ tenant, openIssue: { eventId: 'burstPipe', weeksOpen: 2, fixCost: 600 } })],
        }),
        owned({ id: 'P3', nickname: 'Reno', renovation: { projectId: 'cosmetic', weeksLeft: 1 } }),
      ],
    })
    const ids = buildBriefing(s).attention.map((a) => a.id)
    expect(ids).toContain('vacant:P1')
    expect(ids).toContain('issue:P2:P1-u0')
    expect(ids).toContain('loan')
    expect(ids).toContain('renodone:P3')
    expect(ids).not.toContain('vacant:P3')
    const issue = buildBriefing(s).attention.find((a) => a.id.startsWith('issue'))
    expect(issue?.level).toBe('urgent')
    expect(issue?.action).toEqual({ type: 'HANDLE_ISSUE', propertyId: 'P2', unitId: 'P1-u0' })
  })

  it('sorts urgent first and warns when the bills can’t be covered', () => {
    const s = base({ cash: -900, properties: [owned({ mortgage: { balance: 200000 } })] })
    const b = buildBriefing(s)
    expect(b.attention[0].id).toBe('broke')
    expect(urgentCount(b)).toBeGreaterThan(0)
  })

  it('warns about clients who will walk', () => {
    const s = reducer(base(), { type: 'WORK_PHONES' })
    const leads = s.leads.map((l) => ({ ...l, patience: 1 }))
    const b = buildBriefing({ ...s, leads })
    if (leads.length) expect(b.attention.find((a) => a.id === 'leads')?.level).toBe('urgent')
  })

  it('offers bid, renovate, refinance, list, leads and hold', () => {
    const s = base({ properties: [owned({ mortgage: { balance: 100000 } })] })
    const moves = buildBriefing(s).moves
    expect(moves.map((m) => m.id)).toEqual(['bid', 'renovate', 'refinance', 'list', 'leads', 'hold'])
    const refi = moves.find((m) => m.id === 'refinance')!
    expect(refi.available).toBe(true)
    expect(refi.action).toEqual({ type: 'REFINANCE', propertyId: 'P1' })
    expect(moves.find((m) => m.id === 'hold')!.available).toBe(true)
  })

  it('greys out moves that can’t happen', () => {
    const s = base({ properties: [], cash: 100 })
    const moves = buildBriefing(s).moves
    expect(moves.find((m) => m.id === 'renovate')!.available).toBe(false)
    expect(moves.find((m) => m.id === 'refinance')!.available).toBe(false)
    expect(moves.find((m) => m.id === 'list')!.available).toBe(false)
    expect(moves.find((m) => m.id === 'bid')!.available).toBe(false)
  })

  it('a runway that pays for itself is null', () => {
    const rich = base({
      rank: 'receptionist',
      properties: [owned({ units: [unit({ tenant })] })],
      equipped: {},
      activeChannelIds: [],
    })
    expect(weeklyBills(rich)).toBe(0)
    expect(runwayOf(rich).weeks).toBeNull()
  })
})
