/* v1 → v2 save migration. The localStorage key never changes (`res_save_v1`);
   only `GameState.version` moves. Every field added in Phase 2 gets a default
   here, so a Phase 1 player who refreshes mid-game lands in v2 with their
   progress intact and nothing to re-earn. */

import { RANKS } from '../data/ranks'
import { PRESET_SLOTS } from '../data/swag'
import { initialState } from './reducer'
import type { GameState } from './types'

interface AnySave {
  version?: number
  permBonuses?: { hustle?: number; swagger?: number; ego?: number }
  [k: string]: unknown
}

/** Returns a fully-populated v2 state, or null if `raw` isn't one of ours. */
export function migrate(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as AnySave
  if (s.version !== 1 && s.version !== 2) return null

  const base = initialState()
  const merged = { ...base, ...s } as GameState

  return {
    ...merged,
    version: 2,
    permBonuses: {
      hustle: s.permBonuses?.hustle ?? base.permBonuses.hustle,
      swagger: s.permBonuses?.swagger ?? base.permBonuses.swagger,
      ego: s.permBonuses?.ego ?? base.permBonuses.ego,
    },
    reputation: typeof s.reputation === 'number' ? s.reputation : base.reputation,
    activeChannelIds: Array.isArray(s.activeChannelIds)
      ? (s.activeChannelIds as string[])
      : base.activeChannelIds,
    outfitPresets: Array.isArray(s.outfitPresets)
      ? Array.from(
          { length: PRESET_SLOTS },
          (_, i) =>
            (s.outfitPresets as GameState['outfitPresets'])[i] ?? null,
        )
      : base.outfitPresets,
    gagCounters: {
      vrboOffers:
        (s.gagCounters as { vrboOffers?: number } | undefined)?.vrboOffers ??
        base.gagCounters.vrboOffers,
      nextVrboWeek:
        (s.gagCounters as { nextVrboWeek?: number } | undefined)
          ?.nextVrboWeek ?? base.gagCounters.nextVrboWeek,
    },
    channelMuteUntil:
      s.channelMuteUntil && typeof s.channelMuteUntil === 'object'
        ? (s.channelMuteUntil as Record<string, number>)
        : base.channelMuteUntil,
    pendingChoice:
      (s.pendingChoice as GameState['pendingChoice'] | undefined) ??
      base.pendingChoice,
    /* transient UI fields never come back from disk */
    summary: null,
    promo: null,
    /* v1-era fields are trusted except where a corrupt value would crash the
       first render before the reducer ever runs. */
    leads: Array.isArray(s.leads) ? (s.leads as GameState['leads']) : base.leads,
    counters:
      s.counters && typeof s.counters === 'object'
        ? { ...base.counters, ...(s.counters as object) }
        : base.counters,
    rank: RANKS.some((r) => r.id === s.rank)
      ? (s.rank as GameState['rank'])
      : base.rank,
  }
}
