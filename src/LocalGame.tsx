/* Offline play, exactly as before Phase 2: the reducer in the browser and a
   save in localStorage. Used whenever no backend answers /api (npm run dev
   on its own, a static host), so the game always runs. */

import { useEffect, useReducer, useRef, useState } from 'react'
import CharacterSelect from './components/CharacterSelect'
import Game from './Game'
import { initialState, reducer } from './state/reducer'
import { loadSave, writeSave } from './state/save'

export default function LocalGame() {
  const saved = useRef(loadSave())
  const [state, dispatch] = useReducer(reducer, undefined, () => saved.current || initialState())
  /* No save means no agent has been chosen yet. Game over → New Game comes
     back here too, so the next run can be somebody else entirely. */
  const [choosing, setChoosing] = useState(!saved.current)

  useEffect(() => {
    if (!choosing) writeSave(state)
  }, [state, choosing])

  if (choosing)
    return (
      <CharacterSelect
        onStart={(characterId) => {
          dispatch({ type: 'NEW_GAME', characterId })
          setChoosing(false)
        }}
      />
    )
  return <Game state={state} dispatch={dispatch} onNewGame={() => setChoosing(true)} />
}
