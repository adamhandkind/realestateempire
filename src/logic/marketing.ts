/* Pure marketing math. Nothing here mutates state or logs — the reducer owns
   both. Every roll goes through logic/rand so a seeded run is reproducible. */

import { CHANNELS, LEAD_POOL_SKEW, TIKTOK_GHOST_RATE } from '../data/marketing'
import type { Channel, GameState, Lead, RankId } from '../state/types'
import { getChar, hasFlag } from './characters'
import { atLeastRank, repUnlocked } from './economy'
import { arch, legalArchetypes, makeLead } from './leads'
import { chance, pick } from './rand'

export const channelOf = (id: string): Channel | undefined =>
  CHANNELS.find((c) => c.id === id)

/** The rank a channel unlocks at FOR THIS CHARACTER. The data is never
 *  mutated — Blaine simply reads TikTok's gate as Junior. */
export function unlockRankFor(state: GameState, channel: Channel): RankId {
  if (channel.id === 'tiktok' && hasFlag(state, 'tiktokEarly')) return 'junior'
  return channel.unlockRank
}

export function isChannelLocked(state: GameState, channel: Channel): boolean {
  return (
    !atLeastRank(state.rank, unlockRankFor(state, channel)) ||
    !repUnlocked(state.reputation, channel.unlockRep)
  )
}

/** What one channel costs this character per week. */
export const channelCost = (state: GameState, channel: Channel): number =>
  Math.round(channel.weeklyCost * getChar(state).marketingCostMult)

/** Rep lost this week when nothing at all is running. */
export const repDecayFor = (state: GameState, base: number): number =>
  base * getChar(state).repDecayMult

/** Active channels, in table order, regardless of how they got toggled on. */
export function activeChannels(state: GameState): Channel[] {
  return CHANNELS.filter((c) => state.activeChannelIds.includes(c.id))
}

export function weeklyChannelSpend(state: GameState): number {
  return activeChannels(state).reduce((t, c) => t + channelCost(state, c), 0)
}

export function weeklyChannelRep(state: GameState): number {
  return activeChannels(state).reduce((t, c) => t + c.repPerWeek, 0)
}

/** A muted channel still bills; it just stops producing. */
export function isChannelMuted(state: GameState, channelId: string): boolean {
  const until = state.channelMuteUntil[channelId]
  return typeof until === 'number' && state.week < until
}

/**
 * One inbound roll for one channel. Returns the lead, or null when the roll
 * misses, the channel is muted, or nothing legal is in the pool yet.
 */
export function rollInbound(state: GameState, channel: Channel): Lead | null {
  if (isChannelMuted(state, channel.id)) return null
  if (!chance(channel.inboundChance)) return null

  /* A channel aimed at a district produces leads from it — no roll. */
  const target = state.channelTargets[channel.id]

  if (channel.id === 'tiktok' && chance(TIKTOK_GHOST_RATE))
    return makeLead(state, arch('ghostGary'), channel.id, target)

  const legal = legalArchetypes(state)
  if (!legal.length) return null
  const skewed = legal.filter((a) => channel.leadPool.includes(a.id))
  const from = skewed.length && chance(LEAD_POOL_SKEW) ? skewed : legal
  return makeLead(state, pick(from), channel.id, target)
}
