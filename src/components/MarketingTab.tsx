import type { Dispatch } from 'react'
import { CHANNELS } from '../data/marketing'
import { DISTRICTS } from '../data/districts'
import { channelCost, isChannelLocked, isChannelMuted, unlockRankFor } from '../logic/marketing'
import { TARGETABLE_CHANNEL_IDS } from '../logic/territoryWeek'
import { money } from '../logic/rand'
import type { Action, Channel, GameState } from '../state/types'

function lockReason(state: GameState, channel: Channel): string | null {
  if (!isChannelLocked(state, channel)) return null
  if (state.reputation < channel.unlockRep) return `Requires ${channel.unlockRep} reputation.`
  return `Unlocks at ${unlockRankFor(state, channel).replace(/([A-Z])/g, ' $1')}.`
}

export default function MarketingTab({ state, dispatch }: { state: GameState; dispatch: Dispatch<Action> }) {
  const active = state.activeChannelIds.length
  const weeklySpend = CHANNELS.filter((c) => state.activeChannelIds.includes(c.id)).reduce((sum, c) => sum + channelCost(state, c), 0)
  return <>
    <section className="res-marketing-intro">
      <div><p className="res-eyebrow">Your public face</p><h2 className="res-display">Marketing</h2><p>Run campaigns to build reputation and bring new leads into the office.</p></div>
      <div className="res-marketing-totals" aria-label="Marketing summary"><span><b>{active}</b> live</span><span><b>{money(weeklySpend)}</b> / week</span></div>
    </section>
    <div className="res-marketing-grid">
      {CHANNELS.map((channel) => {
        const on = state.activeChannelIds.includes(channel.id)
        const locked = isChannelLocked(state, channel)
        const muted = isChannelMuted(state, channel.id)
        const reason = lockReason(state, channel)
        const targetable = TARGETABLE_CHANNEL_IDS.includes(channel.id)
        return <article key={channel.id} className={'res-campaign' + (on ? ' live' : '') + (locked ? ' locked' : '')}>
          <div className="res-campaign-head"><div><h3>{channel.name}</h3><p>{channel.flavor}</p></div><span className={'res-status' + (on ? ' live' : '')}>{on ? 'Live' : locked ? 'Locked' : 'Ready'}</span></div>
          <div className="res-campaign-stats"><span>{money(channelCost(state, channel))}/wk</span><span>+{channel.repPerWeek} rep/wk</span><span>{Math.round(channel.inboundChance * 100)}% lead chance</span></div>
          {muted && <p className="res-warn">Muted by the algorithm this week. It still bills.</p>}
          {on && targetable && <label className="res-target">Aim this campaign at<select value={state.channelTargets[channel.id] ?? ''} onChange={(e) => dispatch({ type: 'SET_CHANNEL_TARGET', channelId: channel.id, districtId: e.target.value || null })}><option value="">The whole city</option>{DISTRICTS.map((district) => <option key={district.id} value={district.id}>{district.name}</option>)}</select></label>}
          <button className="res-campaign-toggle" disabled={!on && locked} title={reason ?? channel.flavor} onClick={() => dispatch({ type: 'TOGGLE_CHANNEL', channelId: channel.id })}>{on ? 'Pause campaign' : reason ?? 'Launch campaign'}</button>
        </article>
      })}
    </div>
  </>
}
