/* The territory block of End Week, in the order the spec fixes and a test
   pins: passive property share -> channel targeting -> rival moves -> player
   decay -> threshold sweep -> king check.

   The log budget is strict and deliberate. Per week, at most: one gain line per
   rival, one defense line per rival (on a 4-week cooldown), ONE decay line
   total no matter how many districts went quiet, and threshold lines only on
   an actual crossing. The territory system is loud enough on the map. */

import { DISTRICTS, DISTRICT_IDS, districtOrFirst } from '../data/districts'
import {
  DOMINANT_LINE,
  KING_SUBTITLE,
  KING_TITLE,
  LOST_DOMINANT_LINE,
  PRESENCE_LINE,
  QUIET_WEEK_LINE,
} from '../data/districts'
import { DEFENSE_COOLDOWN_WEEKS, INDIES, LOCK_REFIRE_WEEKS, P6, PLAYER } from '../data/p6'
import { FALLBACK_RIVAL, RIVALS } from '../data/rivals'
import type { GameState, RivalDef, WeekSummary } from '../state/types'
import { clampRep, deriveStats } from './economy'
import { withLog } from './log'
import { interp } from './portfolio'
import { pick, randInt } from './rand'
import {
  drainShare,
  gain,
  isDominant,
  hasPresence,
  isLocked,
  playerShare,
  pluralityRival,
  rivalTotal,
  roundShare,
  sharesOf,
  transferShare,
} from './territory'
import { CHANNELS } from '../data/marketing'

/** Only these three channels can be aimed at a district. */
export const TARGETABLE_CHANNEL_IDS = [
  'billboard',
  'benchDomination',
  'tvCommercial',
]

export const isTargetable = (channelId: string): boolean =>
  TARGETABLE_CHANNEL_IDS.includes(channelId)

/* ------------------------------------------------------------- showdown */

/** Your Swagger against theirs, clamped so neither side is ever a lock. Terri
 *  renders this number raw; everyone else gets a feeling about it. */
export function showdownWinChance(s: GameState, rival: RivalDef): number {
  const swagger = deriveStats(s).swagger
  const raw =
    P6.SHOWDOWN_BASE + (swagger - rival.swagger) * P6.SHOWDOWN_SWAGGER_FACTOR
  return Math.max(0.15, Math.min(0.85, raw))
}

/* ------------------------------------------------------------ a. passive */

/** Owning a door in a district is presence, whether you work it or not. */
export function passivePropertyShare(s: GameState): GameState {
  let out = s
  for (const p of s.properties)
    out = gain(out, p.districtId, PLAYER, P6.GAIN_PROPERTY_PASSIVE)
  return out
}

/* ------------------------------------------------------- b. channel aim */

export function targetedChannelShare(s: GameState): GameState {
  let out = s
  for (const c of CHANNELS) {
    if (!s.activeChannelIds.includes(c.id)) continue
    const target = s.channelTargets[c.id]
    if (!target) continue
    out = gain(out, target, PLAYER, P6.GAIN_CHANNEL_TARGET)
  }
  return out
}

/* ------------------------------------------------------- c. rival moves */

export interface RivalWeek {
  state: GameState
  /** Headline gain lines, one per rival at most. */
  headlines: string[]
}

/** §7.1 gains, then the off-focus bleed, then §7.2 home defense. */
export function rivalMoves(s: GameState): RivalWeek {
  let out = s
  const headlines: string[] = []

  for (const r of RIVALS) {
    /* gains: a week's points, split across one or two focus districts */
    const points = randInt(r.aggression.min, r.aggression.max)
    const n = Math.min(randInt(1, 2), r.focusDistricts.length)
    const targets: string[] = []
    while (targets.length < n) {
      const d = pick(r.focusDistricts)
      if (!targets.includes(d)) targets.push(d)
    }

    let bestDistrict = targets[0]
    let bestMoved = -1
    for (const d of targets) {
      const res = transferShare(out, d, r.id, points / targets.length)
      out = res.state
      if (res.moved > bestMoved) {
        bestMoved = res.moved
        bestDistrict = d
      }
    }
    if (bestMoved > 0)
      headlines.push(
        interp(r.lines.gain, { district: districtOrFirst(bestDistrict).name }),
      )

    /* off-focus bleed: nobody can be everywhere */
    for (const id of DISTRICT_IDS) {
      if (r.focusDistricts.includes(id)) continue
      out = drainShare(out, id, r.id, P6.RIVAL_DECAY_OFFFOCUS).state
    }

    /* §7.2 home defense — only when you are actually beating them at home */
    const home = r.homeDistrict
    if (playerShare(out, home) > (sharesOf(out, home)[r.id] ?? 0)) {
      out = gain(out, home, r.id, P6.RIVAL_HOME_DEFENSE)
      const last = out.rivalEffects.lastDefense[r.id] ?? -999
      if (out.week - last >= DEFENSE_COOLDOWN_WEEKS) {
        out = withLog(out, 'event', r.lines.defense)
        out = {
          ...out,
          rivalEffects: {
            ...out.rivalEffects,
            lastDefense: { ...out.rivalEffects.lastDefense, [r.id]: out.week },
          },
        }
      }
    }
  }

  /* undercut countdown and the one-week intel window */
  const undercutWeeksLeft = Math.max(0, out.rivalEffects.undercutWeeksLeft - 1)
  const intel =
    out.chadwickIntel && out.week - out.chadwickIntel.week > 1
      ? null
      : out.chadwickIntel
  out = {
    ...out,
    rivalEffects: { ...out.rivalEffects, undercutWeeksLeft },
    chadwickIntel: intel,
  }

  headlines.forEach((h) => {
    out = withLog(out, 'event', h)
  })
  return { state: out, headlines }
}

/* -------------------------------------------------------- d. player decay */

/** A district counts as worked if you farmed it, closed a deal from it, own a
 *  property in it, or pointed a channel at it. Any ONE of those is enough. */
export function activeDistricts(s: GameState): Set<string> {
  const active = new Set<string>()
  s.weekFarmedDistricts.forEach((d) => active.add(d))
  s.weekDealDistricts.forEach((d) => active.add(d))
  s.properties.forEach((p) => active.add(p.districtId))
  Object.entries(s.channelTargets).forEach(([channelId, districtId]) => {
    if (districtId && s.activeChannelIds.includes(channelId))
      active.add(districtId)
  })
  return active
}

export function playerDecay(s: GameState): GameState {
  const active = activeDistricts(s)
  let out = s
  let quiet = 0
  for (const id of DISTRICT_IDS) {
    if (active.has(id)) continue
    const held = playerShare(out, id)
    if (held <= 0) continue
    const res = drainShare(out, id, PLAYER, Math.min(P6.DECAY_INACTIVE, held))
    out = res.state
    if (res.moved > 0) quiet++
  }
  /* One line for the whole quiet week. The log does not flood. */
  if (quiet > 0)
    out = withLog(out, 'flavor', interp(QUIET_WEEK_LINE, { n: String(quiet) }))
  return out
}

/* ----------------------------------------------------- e. threshold sweep */

export interface ThresholdSnapshot {
  presence: Record<string, boolean>
  dominant: Record<string, boolean>
}

export function snapshotThresholds(s: GameState): ThresholdSnapshot {
  const presence: Record<string, boolean> = {}
  const dominant: Record<string, boolean> = {}
  for (const id of DISTRICT_IDS) {
    presence[id] = hasPresence(s, id)
    dominant[id] = isDominant(s, id)
  }
  return { presence, dominant }
}

/**
 * Fires the lockout clamp where it is owed, then logs only genuine crossings
 * against `before`.
 */
export function thresholdSweep(
  s: GameState,
  before: ThresholdSnapshot,
): GameState {
  let out = s
  for (const d of DISTRICTS) {
    out = applyLockout(out, d.id)

    if (hasPresence(out, d.id) && !before.presence[d.id])
      out = withLog(out, 'event', interp(PRESENCE_LINE, { district: d.name }))

    const nowDominant = isDominant(out, d.id)
    if (nowDominant && !before.dominant[d.id])
      out = withLog(
        out,
        'promotion',
        interp(DOMINANT_LINE, { district: d.name, perk: d.dominantPerk.text }),
      )
    else if (!nowDominant && before.dominant[d.id])
      out = withLog(out, 'event', interp(LOST_DOMINANT_LINE, { district: d.name }))
  }
  return out
}

/**
 * §7.6. At 75%+ the rivals are clamped to RIVAL_LOCKED_FLOOR combined and the
 * excess goes to indies. The line fires once, then stays quiet for 20 weeks
 * even if the player drops below the line and climbs back.
 */
export function applyLockout(s: GameState, districtId: string): GameState {
  if (!isLocked(s, districtId)) return s
  const total = rivalTotal(s, districtId)
  if (total <= P6.RIVAL_LOCKED_FLOOR) return s

  const rival = pluralityRival(s, districtId) ?? FALLBACK_RIVAL
  const shares = { ...sharesOf(s, districtId) }
  const keep = P6.RIVAL_LOCKED_FLOOR / total
  let freed = 0
  let kept = 0
  let biggest: string | null = null
  for (const r of RIVALS) {
    const held = shares[r.id] ?? 0
    if (held <= 0) continue
    const share = roundShare(held * keep)
    freed += held - share
    kept += share
    shares[r.id] = share
    if (!biggest || share > shares[biggest]) biggest = r.id
  }
  /* Rounding each rival independently can miss the floor by a tenth; the
     largest survivor absorbs the difference so the total is exactly 5.0. */
  const slack = roundShare(P6.RIVAL_LOCKED_FLOOR - kept)
  if (biggest && slack !== 0) {
    shares[biggest] = Math.max(0, roundShare(shares[biggest] + slack))
    freed -= slack
  }
  shares[INDIES] = Math.max(0, roundShare((shares[INDIES] ?? 0) + freed))

  let out: GameState = {
    ...s,
    territory: { ...s.territory, [districtId]: { shares } },
  }

  const last = out.rivalEffects.lastLock[districtId] ?? -999
  if (out.week - last >= LOCK_REFIRE_WEEKS) {
    out = withLog(
      out,
      'promotion',
      interp(rival.lines.locked, { district: districtOrFirst(districtId).name }),
    )
    out = {
      ...out,
      rivalEffects: {
        ...out.rivalEffects,
        lastLock: { ...out.rivalEffects.lastLock, [districtId]: out.week },
      },
    }
  }
  return out
}

/* ------------------------------------------------------- f. the king check */

export interface KingResult {
  state: GameState
  crowned: boolean
}

/** Dominant in all eight. Fires exactly once; the game continues after it. */
export function checkKing(s: GameState, phase2Built = true): KingResult {
  if (s.kingOfBrantford) return { state: s, crowned: false }
  const dominant = DISTRICT_IDS.filter((id) => isDominant(s, id)).length
  if (dominant < P6.KING_REQUIREMENT) return { state: s, crowned: false }

  let out: GameState = { ...s, kingOfBrantford: true, promo: KING_TITLE }
  if (phase2Built) out = { ...out, reputation: clampRep(out.reputation + 25) }
  out = withLog(out, 'promotion', KING_TITLE + '. ' + KING_SUBTITLE)
  return { state: out, crowned: true }
}

/* ------------------------------------------------------------ g. summary */

/** One row per district that actually moved, with who holds it now. */
export function territorySummary(
  before: Record<string, number>,
  after: GameState,
  rivalMoveLines: string[],
): WeekSummary['territory'] {
  const rows: WeekSummary['territory']['rows'] = []
  for (const d of DISTRICTS) {
    const delta = roundShare(playerShare(after, d.id) - (before[d.id] ?? 0))
    if (delta === 0) continue
    rows.push({ name: d.name, delta, holder: holderLabel(after, d.id) })
  }
  return { rows, rivalMoves: rivalMoveLines }
}

function holderLabel(s: GameState, districtId: string): string {
  const shares = sharesOf(s, districtId)
  const player = shares[PLAYER] ?? 0
  const indies = shares[INDIES] ?? 0
  const rival = pluralityRival(s, districtId)
  if (rival) return rival.name
  return player >= indies ? 'You' : 'Independents'
}

/** Snapshot of the player's share everywhere, for the summary's deltas. */
export function playerShareSnapshot(s: GameState): Record<string, number> {
  const out: Record<string, number> = {}
  for (const id of DISTRICT_IDS) out[id] = playerShare(s, id)
  return out
}
