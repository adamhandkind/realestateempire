/* The server reloads a player's game from storage before every batch of
   moves; the browser keeps its copy in memory. Online play is only sound if
   those two paths always agree. This plays long, varied careers — phone
   calls, posts, ceremonies, purchases, tenant choices — and after EVERY
   move checks that "apply it to the game in memory" and "save, reload, then
   apply it" give the same game. */

import { describe, expect, it } from 'vitest'
import { CAPTIONS } from '../../data/captions'
import { CHANNELS } from '../../data/marketing'
import { P7, SPEECH_OPTIONS } from '../../data/p7'
import { POSTS } from '../../data/posts'
import { RENO_PROJECTS } from '../../data/properties'
import { SWAG } from '../../data/swag'
import { DISTRICTS } from '../../data/districts'
import { fillPool } from '../../logic/portfolio'
import { applyAction, canonicalJson, createGame, fromWire, isClientAction, stateDigest, toWire } from '..'
import type { Action, GameState } from '..'

/** The bot's own dice, so a failure replays exactly. */
function dice(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const pick = <T,>(xs: readonly T[]): T | undefined => (xs.length ? xs[Math.floor(next() * xs.length)] : undefined)
  return { next, pick }
}

const TACTICS = ['empathize', 'push', 'namedrop', 'flex', 'read'] as const

/** A plausible next move: deals with whatever is on screen first (a call,
 *  the post composer, a ceremony, a decision), otherwise does some work. */
function nextMove(s: GameState, d: ReturnType<typeof dice>): Action {
  const { next, pick } = d
  if (s.call) {
    if (s.call.phase === 'awaitingTactic') return { type: 'PLAY_TACTIC', tacticId: pick(TACTICS)! }
    if (s.call.phase === 'resolved') return { type: 'CLOSE_CALL_MODAL' }
    return { type: 'ADVANCE_CALL' }
  }
  if (s.postComposerPending)
    return next() < 0.6
      ? { type: 'CREATE_POST', postId: pick(POSTS)!.id, captionId: pick(CAPTIONS)!.id }
      : { type: 'SKIP_POST' }
  if (s.ceremony) {
    const r = next()
    if (r < 0.5) return { type: 'ADVANCE_CEREMONY' }
    if (r < 0.75) return { type: 'GIVE_SPEECH', key: pick(SPEECH_OPTIONS)!.key }
    return { type: 'CLOSE_CEREMONY' }
  }
  if (s.pendingChoice) return { type: 'RESOLVE_CHOICE_EVENT', key: pick(s.pendingChoice.options)!.key }
  if (s.pendingChoices.length) {
    const c = pick(s.pendingChoices)!
    return { type: 'RESOLVE_PORTFOLIO_CHOICE', choiceId: c.id, actionTag: pick(c.options)?.actionTag ?? 'ok' }
  }
  /* Work leads properly some of the time: show until ready, then close.
     That's what opens phone calls. */
  const ready = s.leads.filter((l) => l.stage === 'ready' && !l.sold)
  if (ready.length && s.ap > 0 && next() < 0.6) return { type: 'ATTEMPT_CLOSE', leadId: pick(ready)!.id }
  const warming = s.leads.filter((l) => l.stage !== 'ready' && !l.sold)
  if (warming.length && s.ap > 0 && next() < 0.5) return { type: 'RUN_SHOWING', leadId: pick(warming)!.id }
  const lead = pick(s.leads)
  const prop = pick(s.properties)
  const unit = prop && pick(prop.units)
  const listing = pick(s.marketPool)
  const options: (Action | null)[] = [
    { type: 'WORK_PHONES' },
    { type: 'ASSIST_SHOWING' },
    { type: 'SIDE_HUSTLE' },
    lead ? { type: 'RUN_SHOWING', leadId: lead.id } : null,
    lead ? { type: 'ATTEMPT_CLOSE', leadId: lead.id } : null,
    lead ? { type: 'ATTEMPT_CLOSE', leadId: lead.id } : null,
    listing ? { type: 'BUY_PROPERTY', listingId: listing.id, downPct: pick([0.2, 0.5, 1])! } : null,
    prop && unit ? { type: 'SET_RENT', propertyId: prop.id, unitId: unit.id, r: pick([0.9, 1, 1.1, 1.3])! } : null,
    prop ? { type: 'START_RENOVATION', propertyId: prop.id, projectId: pick(RENO_PROJECTS)!.id } : null,
    prop && next() < 0.2 ? { type: 'LIST_FOR_SALE', propertyId: prop.id } : null,
    prop && unit ? { type: 'HANDLE_ISSUE', propertyId: prop.id, unitId: unit.id } : null,
    { type: 'BUY_SWAG', itemId: pick(SWAG)!.id },
    s.ownedSwagIds.length ? { type: 'EQUIP_SWAG', itemId: pick(s.ownedSwagIds)! } : null,
    { type: 'TOGGLE_CHANNEL', channelId: pick(CHANNELS)!.id },
    { type: 'FARM_DISTRICT', districtId: pick(DISTRICTS)!.id },
    { type: 'BUY_TABLE', tierId: pick(P7.TABLE_TIERS)!.id },
    { type: 'END_WEEK' },
    { type: 'END_WEEK' },
    { type: 'END_WEEK' },
  ]
  return pick(options.filter((o): o is Action => o !== null))!
}

const content = (s: GameState) => {
  const { summary: _s, promo: _p, ...rest } = s
  return canonicalJson(rest)
}

function differingKeys(a: GameState, b: GameState): string[] {
  const A = JSON.parse(toWire(a)) as Record<string, unknown>
  const B = JSON.parse(toWire(b)) as Record<string, unknown>
  return [...new Set([...Object.keys(A), ...Object.keys(B)])].filter(
    (k) => canonicalJson(A[k]) !== canonicalJson(B[k]),
  )
}

function soak(start: GameState, seed: number, steps: number) {
  const d = dice(seed)
  const seen = { call: 0, composer: 0, ceremony: 0, choices: 0, tenants: 0 }
  let s = start
  for (let i = 0; i < steps && !s.gameOver; i++) {
    const a = nextMove(s, d)
    if (!isClientAction(a.type)) throw new Error('bot sent ' + a.type)
    if (s.call) seen.call++
    if (s.postComposerPending) seen.composer++
    if (s.ceremony) seen.ceremony++
    if (s.pendingChoices.length || s.pendingChoice) seen.choices++
    if (s.properties.some((p) => p.units.some((u) => u.tenant))) seen.tenants++
    const inMemory = applyAction(s, a)
    const reloaded = applyAction(fromWire(toWire(s))!, a)
    if (content(inMemory) !== content(reloaded))
      throw new Error(
        `step ${i} (week ${s.week}) ${JSON.stringify(a)} diverged on: ${differingKeys(inMemory, reloaded).join(', ')}`,
      )
    s = inMemory
  }
  return { end: s, seen }
}

describe('a game crossing the wire mid-anything', () => {
  it('a fresh career, move by move', () => {
    for (const seed of [11, 12, 13]) soak(createGame('you', seed), seed, 900)
  }, 30_000)

  it('a landlord career with phone calls, posts and ceremonies, move by move', () => {
    const total = { call: 0, composer: 0, ceremony: 0, choices: 0, tenants: 0 }
    for (const seed of [21, 22, 23, 24]) {
      const start = fillPool({ ...createGame('svetlana', seed), rank: 'topProducer', cash: 3_000_000 })
      const { seen } = soak(start, seed, 1500)
      for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += seen[k]
    }
    /* Prove the soak actually reached the states that used to break. */
    expect(total.call).toBeGreaterThan(0)
    expect(total.composer).toBeGreaterThan(0)
    expect(total.ceremony).toBeGreaterThan(0)
    expect(total.choices).toBeGreaterThan(0)
    expect(total.tenants).toBeGreaterThan(0)
  }, 60_000)

  it('the fingerprint ignores key order but not content', async () => {
    const s = createGame('you', 3)
    const shuffled = Object.fromEntries(Object.entries(s).reverse()) as unknown as GameState
    expect(await stateDigest(shuffled)).toBe(await stateDigest(s))
    expect(await stateDigest({ ...s, cash: s.cash + 1 })).not.toBe(await stateDigest(s))
    expect(await stateDigest({ ...s, summary: null, promo: 'x' })).toBe(await stateDigest(s))
  })

  it('a phone call in progress survives the trip', () => {
    const d = dice(7)
    let s = fillPool({ ...createGame('you', 7), rank: 'topProducer', cash: 3_000_000 })
    for (let i = 0; i < 4000 && !s.call; i++) s = applyAction(s, nextMove(s, d))
    expect(s.call).not.toBeNull()
    expect(fromWire(toWire(s))!.call).toEqual(s.call)
  })
})
