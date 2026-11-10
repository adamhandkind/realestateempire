/* The card that opens when you click one of the little people on the map:
   their face, who they're playing as, and how they're doing. Sits where the
   lot card does; only one of the two is open at a time. */

import { characterOf } from '../../logic/characters'
import { rankOf } from '../../logic/economy'
import { money } from '../../logic/rand'
import type { RankId } from '../../state/types'
import AgentFace from '../AgentFace'

export interface AgentInfo {
  id: string
  name: string
  /** CSS colour: their yard signs, flag and the disc under their feet. */
  color: string
  characterId: string
  you: boolean
  /** Last season's champion's title, when this is them. */
  championTitle?: string
  /** Standing, when the city has one (a shared city). */
  place?: number
  of?: number
  netWorth?: number
  cash?: number
  rank?: RankId
  buildings?: number
  /** City weeks since they last made a move. */
  missed?: number
  gameOver?: boolean
}

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return n + s
}

export default function AgentCard({
  agent,
  onClose,
  onFollow,
}: {
  agent: AgentInfo
  onClose: () => void
  onFollow: () => void
}) {
  const c = characterOf(agent.characterId)
  return (
    <aside className="res-lotcard res-agentcard" style={{ borderTopColor: agent.color }} aria-label={'Agent ' + agent.name}>
      <button className="res-lotcard-x" onClick={onClose} aria-label="Close">
        ×
      </button>
      <div className="res-agentcard-head">
        <AgentFace characterId={agent.characterId} accent={agent.color} size={84} />
        <div>
          {agent.championTitle && <div className="res-agentcard-champ">👑 Champion · “{agent.championTitle}”</div>}
          <h3 className="res-display">{agent.you && agent.name !== 'You' ? agent.name + ' (you)' : agent.name}</h3>
          {c && (
            <div className="res-meta">
              {c.id !== 'you' && c.name + ' · '}
              {c.tagline}
            </div>
          )}
        </div>
      </div>

      {(agent.place !== undefined || agent.netWorth !== undefined) && (
        <div className="res-agentcard-stats">
          {agent.place !== undefined && (
            <div>
              <span className="res-meta">Standing</span>
              <b>
                {ordinal(agent.place)}
                {agent.of ? ' of ' + agent.of : ''}
              </b>
            </div>
          )}
          {agent.netWorth !== undefined && (
            <div>
              <span className="res-meta">Net worth</span>
              <b>{money(agent.netWorth)}</b>
            </div>
          )}
          {agent.cash !== undefined && (
            <div>
              <span className="res-meta">Cash</span>
              <b>{money(agent.cash)}</b>
            </div>
          )}
          {agent.rank && (
            <div>
              <span className="res-meta">Rank</span>
              <b>{rankOf(agent.rank).name}</b>
            </div>
          )}
          {agent.buildings !== undefined && (
            <div>
              <span className="res-meta">Buildings</span>
              <b>{agent.buildings}</b>
            </div>
          )}
        </div>
      )}

      {agent.gameOver ? (
        <p className="res-agentcard-note">Out of the game. Moved back in with their parents.</p>
      ) : agent.missed && agent.missed >= 2 ? (
        <p className="res-agentcard-note">Hasn’t made a move in {agent.missed} weeks.</p>
      ) : null}

      {c && !agent.you && <div className="res-brag">{c.brags[0]}</div>}

      <button className="res-go" onClick={onFollow}>
        {agent.you ? '◎ Follow me' : '◎ Follow ' + agent.name.split(' ')[0]}
      </button>
    </aside>
  )
}
