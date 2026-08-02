import type { GameState } from '../state/types'

/** The comedy channel. Every mechanical outcome arrives here already in voice. */
export default function LogTab({ state }: { state: GameState }) {
  return (
    <div className="res-panel">
      <h3 className="res-h2 res-display">The Record</h3>
      <ul className="res-log">
        {state.log.map((e, i) => (
          <li key={i}>
            <span className="w">Wk {e.week}</span>
            <span className={e.kind}>{e.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
