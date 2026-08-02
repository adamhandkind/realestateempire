/* v1 → v2 save migration. The localStorage key never changes (`res_save_v1`);
   only `GameState.version` moves. Every field added in Phase 2 gets a default
   here, so a Phase 1 player who refreshes mid-game lands in v2 with their
   progress intact and nothing to re-earn. */

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
      hustle: s.permBonuses?.hustle ?? 0,
      swagger: s.permBonuses?.swagger ?? 0,
      ego: s.permBonuses?.ego ?? 0,
    },
    reputation: typeof s.reputation === 'number' ? s.reputation : 0,
    activeChannelIds: Array.isArray(s.activeChannelIds)
      ? (s.activeChannelIds as string[])
      : [],
    outfitPresets: Array.isArray(s.outfitPresets)
      ? (s.outfitPresets as GameState['outfitPresets'])
      : [],
    gagCounters: {
      vrboOffers:
        (s.gagCounters as { vrboOffers?: number } | undefined)?.vrboOffers ?? 0,
      nextVrboWeek:
        (s.gagCounters as { nextVrboWeek?: number } | undefined)
          ?.nextVrboWeek ?? 0,
    },
    channelMuteUntil:
      s.channelMuteUntil && typeof s.channelMuteUntil === 'object'
        ? (s.channelMuteUntil as Record<string, number>)
        : {},
    pendingChoice:
      (s.pendingChoice as GameState['pendingChoice'] | undefined) ?? null,
    /* transient UI fields never come back from disk */
    summary: null,
    promo: null,
  }
}
