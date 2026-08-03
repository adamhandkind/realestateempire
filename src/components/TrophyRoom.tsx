import type { Dispatch } from 'react'
import { awardOf } from '../data/awards'
import { P7, TROPHY_DISPLAY_WARNING, TROPHY_ROOM_EMPTY } from '../data/p7'
import { displayedCount, shelfFull, weeksToCeremony } from '../logic/awards'
import type { Action, GameState } from '../state/types'

export default function TrophyRoom({
  state,
  dispatch,
}: {
  state: GameState
  dispatch: Dispatch<Action>
}) {
  const trophies = state.trophies ?? []
  const shown = displayedCount(state)
  const full = shelfFull(state)

  if (trophies.length === 0) {
    return (
      <div className="res-panel dark">
        <h3 className="res-h2 res-display">The Trophy Room</h3>
        <p className="res-blurb" style={{ marginTop: 8 }}>
          {TROPHY_ROOM_EMPTY.replace('{n}', String(weeksToCeremony(state)))}
        </p>
      </div>
    )
  }

  /* Newest season first — the shelf reads like a career, backwards. */
  const ordered = [...trophies].sort((a, b) => b.seasonIndex - a.seasonIndex)

  return (
    <div className="res-panel dark">
      <h3 className="res-h2 res-display">The Trophy Room</h3>
      <div className="res-line" style={{ marginBottom: 4 }}>
        <span className="res-meta">On display</span>
        <b style={{ color: full ? 'var(--sold)' : 'var(--brass)' }}>
          {shown}/{P7.TROPHY_DISPLAY_CAP}
        </b>
      </div>
      <div className="res-meta" style={{ marginBottom: 12, letterSpacing: 0 }}>
        {TROPHY_DISPLAY_WARNING}
      </div>

      <div className="res-grid">
        {ordered.map((t) => {
          const award = awardOf(t.awardId)
          if (!award) return null
          const blocked = !t.displayed && full
          return (
            <div
              key={t.awardId + '-' + t.seasonIndex}
              className={'res-trophy' + (t.displayed ? ' on' : '')}
            >
              <div className="res-trophy-glyph" aria-hidden="true">
                🏆
              </div>
              <div className="nm">{award.name}</div>
              <div className="res-meta">Season {t.seasonIndex + 1}</div>
              <div className="res-trophy-sub">{award.subtitle}</div>
              <div className="res-perk">{award.perk.text}</div>
              <div className="res-mini">
                <button
                  disabled={blocked}
                  title={
                    blocked
                      ? 'The shelf holds six. Take something down first.'
                      : award.perk.text
                  }
                  onClick={() =>
                    dispatch({
                      type: 'TOGGLE_TROPHY',
                      awardId: t.awardId,
                      seasonIndex: t.seasonIndex,
                    })
                  }
                >
                  {t.displayed ? 'Displayed — Put Away' : 'Display'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
