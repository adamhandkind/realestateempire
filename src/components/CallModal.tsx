import { useEffect, useState } from 'react'
import type { Dispatch } from 'react'
import { CALL_CARDS, cardOf } from '../data/callCards'
import { districtOrFirst } from '../data/districts'
import { hasFlag } from '../logic/characters'
import { arch } from '../logic/leads'
import {
  beatOf,
  momentumWord,
  playerLineFor,
  reactionFor,
} from '../logic/call'
import { money } from '../logic/rand'
import { P8 } from '../data/p8'
import type {
  Action,
  GameState,
  PlayableTactic,
  TacticId,
} from '../state/types'

const PLAYABLE: PlayableTactic[] = ['empathize', 'push', 'namedrop', 'flex']

const reduceMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/** Types the beat out one character at a time, unless the player has asked the
 *  world to stop moving. */
function useTypewriter(text: string): string {
  const [shown, setShown] = useState(text)
  useEffect(() => {
    if (reduceMotion()) {
      setShown(text)
      return
    }
    setShown('')
    let i = 0
    const id = setInterval(() => {
      i += 1
      setShown(text.slice(0, i))
      if (i >= text.length) clearInterval(id)
    }, 18)
    return () => clearInterval(id)
  }, [text])
  return shown
}

export default function CallModal({
  state,
  dispatch,
}: {
  state: GameState
  dispatch: Dispatch<Action>
}) {
  const call = state.call
  const lead = state.leads.find((l) => l.id === call?.leadId)
  const beat = beatOf(call?.currentBeatId ?? '')
  const beatText = lead
    ? beat.text
        .replace('{name}', lead.clientName)
        .replace('{price}', money(lead.salePrice))
    : ''
  const typed = useTypewriter(beatText)

  if (!call || !lead) return null

  const a = arch(lead.archetypeId)
  const raw = hasFlag(state, 'showRawNumbers')
  const pct = Math.abs(call.momentum) / P8.MOMENTUM_MAX
  const last = call.history[call.history.length - 1]

  /* Badge polarity is recomputed rather than stored: the beat and the
     archetype are the truth, and both are already in hand. */
  const badgeFor = (t: PlayableTactic): 'good' | 'avoid' | null => {
    if (!call.revealedTells.includes(t)) return null
    const r = reactionFor(lead, beat, t)
    if (r === 'great' || r === 'good') return 'good'
    if (r === 'terrible' || r === 'bad') return 'avoid'
    return 'good'
  }

  const usedCount = (t: TacticId) =>
    call.usedTactics.filter((x) => x === t).length

  return (
    <div className="res-modal">
      <div className="res-card res-call">
        <div className="res-call-head">
          <div>
            <h2 className="res-display">{lead.clientName}</h2>
            <div style={{ fontSize: 12, color: '#5e6270' }}>
              {a.label} · {districtOrFirst(lead.districtId).name}
            </div>
          </div>
          <div className="res-call-price">{money(lead.salePrice)}</div>
        </div>

        <div className="res-meter">
          <i
            className={call.momentum < 0 ? 'neg' : ''}
            style={{ width: pct * 50 + '%' }}
          />
        </div>
        <div className="res-meter-label">
          {momentumWord(call.momentum)}
          {raw && ' · ' + call.momentum}
        </div>

        <div className="res-call-pips">
          {[1, 2, 3].map((n) => (
            <i key={n} className={n <= call.turn ? 'on' : ''} />
          ))}
        </div>

        {call.phase === 'resolved' ? (
          <Resolution state={state} dispatch={dispatch} />
        ) : (
          <>
            <div className="res-beat">
              <span className="glyph">☎</span>
              {call.phase === 'showingReaction' ? beatText : typed}
            </div>

            {call.phase === 'showingReaction' && last && (
              <>
                <div className="res-bubbles">
                  <div className="res-bub me">
                    {playerLineFor(last.beatId, last.tacticUsed ?? 'empathize')}
                  </div>
                  <div className="res-bub them">{last.clientReply}</div>
                  {last.delta !== 0 && (
                    <div
                      className={'res-delta ' + (last.delta > 0 ? 'up' : 'down')}
                    >
                      {last.delta > 0 ? '+' : '−'}
                      {Math.abs(last.delta)}
                    </div>
                  )}
                </div>
                <button
                  className="res-go"
                  onClick={() => dispatch({ type: 'ADVANCE_CALL' })}
                >
                  Continue
                </button>
              </>
            )}

            {call.phase === 'awaitingTactic' && (
              <div className="res-tactics">
                {PLAYABLE.map((t) => {
                  const card = cardOf(t)
                  const n = usedCount(t)
                  const badge = badgeFor(t)
                  return (
                    <button
                      key={t}
                      className={'res-tactic' + (n > 0 ? ' dim' : '')}
                      onClick={() =>
                        dispatch({ type: 'PLAY_TACTIC', tacticId: t })
                      }
                    >
                      {badge && (
                        <span className={'badge ' + badge}>
                          {badge === 'good' ? '⭑' : '✕'}
                        </span>
                      )}
                      <b>{card.label}</b>
                      <span>{card.hint}</span>
                      {n > 0 && (
                        <span className="used">
                          used ×{n} · −{n * P8.REPEAT_PENALTY}
                        </span>
                      )}
                    </button>
                  )
                })}
                <button
                  className="res-tactic wide"
                  disabled={call.usedTactics.includes('read')}
                  onClick={() =>
                    dispatch({ type: 'PLAY_TACTIC', tacticId: 'read' })
                  }
                >
                  <b>{CALL_CARDS[4].label}</b>
                  <span>
                    {call.usedTactics.includes('read')
                      ? 'You only get one of these.'
                      : CALL_CARDS[4].hint}
                  </span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** The outcome page. Reuses the Phase 1 SOLD stamp on success. */
function Resolution({
  state,
  dispatch,
}: {
  state: GameState
  dispatch: Dispatch<Action>
}) {
  const call = state.call!
  const o = call.outcome
  const lead = state.leads.find((l) => l.id === call.leadId)
  return (
    <div style={{ position: 'relative', paddingTop: 10 }}>
      {o?.success ? (
        <>
          <div className="res-sold">SOLD</div>
          <p className="res-blurb">
            Signed on the phone. Your share came to {money(o.payout)}.
          </p>
        </>
      ) : (
        <p className="res-blurb">
          {lead
            ? lead.clientName + ' is still thinking. You get one more run at it.'
            : 'That one is gone. Some calls end the relationship, not the deal.'}
        </p>
      )}
      <button
        className="res-go"
        onClick={() => dispatch({ type: 'CLOSE_CALL_MODAL' })}
      >
        Back to the pipeline
      </button>
    </div>
  )
}
