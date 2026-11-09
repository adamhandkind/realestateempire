/* Agent creation: a name and a colour (your yard signs and flag in the
   shared city), then the existing character select. The server makes the
   game; the browser never picks its own seed. */

import { useEffect, useState, type FormEvent } from 'react'
import { AGENT_COLORS } from '../../data/agentColors'
import { ApiError, api, type CitySummary, type SaveText } from '../../net/api'
import CharacterSelect from '../CharacterSelect'
import { Gate } from './screens'

export default function CreateAgent({
  city,
  restart,
  onCreated,
}: {
  city: CitySummary
  /** Starting over after a game over: keeps the old name and colour handy. */
  restart: boolean
  onCreated: (save: SaveText) => void
}) {
  const [name, setName] = useState(city.agent?.name ?? '')
  const [color, setColor] = useState<string | null>(city.agent?.color ?? null)
  const [taken, setTaken] = useState<Set<string>>(new Set())
  const [step, setStep] = useState<'who' | 'character'>('who')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    api
      .leaderboard(city.id)
      .then((b) => live && setTaken(new Set(b.rows.filter((r) => !r.you).map((r) => r.color))))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [city.id])

  const next = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setStep('character')
  }

  const create = async (characterId: string) => {
    if (busy || !color) return
    setBusy(true)
    try {
      onCreated(await api.createAgent(city.id, { name, color, characterId, restart }))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't reach the server.")
      setStep('who')
      setBusy(false)
    }
  }

  if (step === 'character') return <CharacterSelect onStart={create} />

  const picked = AGENT_COLORS.find((c) => c.id === color)
  return (
    <Gate eyebrow={city.name} title={restart ? 'Back from the dead' : 'Create your agent'}>
      <p>
        {restart
          ? 'Your parents have agreed to let you try again. New game, same city.'
          : 'You start under a bridge with a tent and a dream. Everyone in ' + city.name + ' will see this name and colour.'}
      </p>
      <form onSubmit={next}>
        <label className="res-field">
          Agent name
          <input
            className="res-input"
            value={name}
            maxLength={24}
            autoFocus
            placeholder="e.g. Dave “The Closer” Kowalski"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="res-field">Your colour</div>
        <div className="res-swatches" role="radiogroup" aria-label="Your colour">
          {AGENT_COLORS.map((c) => (
            <button
              type="button"
              key={c.id}
              role="radio"
              aria-checked={color === c.id}
              aria-label={c.name + (taken.has(c.id) ? ' (taken)' : '')}
              title={c.name + (taken.has(c.id) ? ' — taken' : '')}
              className={'res-swatch' + (color === c.id ? ' on' : '')}
              style={{ background: c.hex }}
              disabled={taken.has(c.id)}
              onClick={() => setColor(c.id)}
            />
          ))}
        </div>
        <div className="res-swatch-name">{picked?.name ?? ''}</div>
        {error && <div className="res-err">{error}</div>}
        <button className="res-go" disabled={name.trim().length < 2 || !color}>
          Next: pick your agent
        </button>
      </form>
    </Gate>
  )
}
