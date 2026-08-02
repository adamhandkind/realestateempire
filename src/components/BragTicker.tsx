import { useMemo } from 'react'
import { bragFor } from '../logic/economy'
import type { GameState } from '../state/types'

/** The signature element: fake social posts generated from live game state.
 *  Re-rolled when the week or rank changes, doubled so the scroll loops. */
export default function BragTicker({ state }: { state: GameState }) {
  const bragStrip = useMemo(() => {
    const out: string[] = []
    for (let i = 0; i < 6; i++) out.push(bragFor(state))
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.week, state.rank])

  return (
    <div className="res-ticker">
      <div className="res-ticker-inner">
        {bragStrip.concat(bragStrip).map((b, i) => (
          <span key={i}>{b}</span>
        ))}
      </div>
    </div>
  )
}
