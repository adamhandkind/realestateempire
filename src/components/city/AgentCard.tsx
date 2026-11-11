/* The card that opens when you click an agent walking the map: rank, standing
   and the closet they're showing off. Read-only; it decides nothing. */

import type { AgentCardData } from '../../city/agentCard'
import { money } from '../../logic/rand'
import AgentFace from '../AgentFace'

const ordinal = (n: number) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th')

export default function AgentCard({
  card,
  onClose,
  onFollow,
}: {
  card: AgentCardData
  onClose: () => void
  /** Keep the camera on them as they walk. */
  onFollow?: () => void
}) {
  const wearing = card.worn.filter((w) => w.name)
  return (
    <aside className="res-lotcard res-agentcard" aria-label={'Agent card: ' + card.name} style={{ borderTopColor: card.color }}>
      <button className="res-lotcard-x" onClick={onClose} aria-label="Close">
        ×
      </button>
      <div className="res-agentcard-head">
        <AgentFace characterId={card.characterId} accent={card.color} size={76} />
        <div>
          <div className="res-meta">
            {card.characterName ? card.characterName + ' · ' : ''}
            {card.rank}
          </div>
          <h3 className="res-display">
            {card.title && <span aria-label="Last season's champion">👑 </span>}
            {card.name}
          </h3>
        </div>
      </div>
      {card.title && <div className="res-owner res-agentcard-champ">Champion · “{card.title}”</div>}

      <div className="res-line">
        <span>Net worth</span>
        <b>{money(card.netWorth)}</b>
      </div>
      {card.place != null && card.players != null && (
        <div className="res-line">
          <span>Standing</span>
          <b>
            {ordinal(card.place)} of {card.players}
          </b>
        </div>
      )}
      <div className="res-line">
        <span>Doors</span>
        <b>{card.doors}</b>
      </div>
      {card.rivalry && (
        <div className="res-line">
          <span>Head to head</span>
          <b>
            You {card.rivalry.youWon} · {card.name} {card.rivalry.theyWon}
          </b>
        </div>
      )}
      {card.gameOver && <div className="res-chip warn">bankrupt</div>}
      {!card.you && card.missed >= 3 && <div className="res-chip warn">hasn't checked in for {card.missed} weeks</div>}

      <div className="res-agentcard-closet">
        <div className="res-meta">
          The closet · {card.owned} of {card.totalSwag} owned
        </div>
        {wearing.length === 0 ? (
          <p className="res-blurb">
            {card.you ? 'Nothing on but ambition. The Closet tab can fix that.' : 'Nothing on but ambition.'}
          </p>
        ) : (
          <ul>
            {card.worn.map((w) => (
              <li key={w.slot} className={w.name ? '' : 'empty'}>
                <span className="slot">{w.slotLabel}</span>
                <b>{w.name ?? '—'}</b>
                {w.flavor && <i>{w.flavor}</i>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {onFollow && (
        <button className="res-go" onClick={onFollow}>
          ◎ {card.you ? 'Follow me' : 'Follow ' + card.name.split(' ')[0]}
        </button>
      )}
    </aside>
  )
}
