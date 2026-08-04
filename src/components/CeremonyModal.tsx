import { useEffect, useState, type Dispatch } from 'react'
import { AGENT_OF_THE_YEAR, awardOf } from '../data/awards'
import {
  CEREMONY_TITLE,
  NO_SPEECH_LINE,
  SPEECH_OPTIONS,
} from '../data/p7'
import { PLAYER_NOMINEE, nomineeName, nomineeOf } from '../logic/awards'
import type { Action, AwardResult, GameState } from '../state/types'

/** Honours the OS setting the way the rest of the game does: no counting, no
 *  confetti, but the reveal is still paged. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/** Counts a score up on reveal. Returns the final value immediately when
 *  motion is reduced, or when the card has already been read. */
function useCountUp(target: number, active: boolean, instant: boolean): number {
  const [n, setN] = useState(instant ? target : 0)
  useEffect(() => {
    if (!active) return
    if (instant) {
      setN(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 700)
      setN(target * (1 - Math.pow(1 - t, 3)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    /* A backgrounded tab stops firing rAF, which would strand the number at 0
       forever. The score is diegetic — it always lands. */
    const settle = setTimeout(() => setN(target), 900)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(settle)
    }
  }, [target, active, instant])
  return n
}

function NomineeRow({
  id,
  score,
  isWinner,
  instant,
}: {
  id: string
  score: number
  isWinner: boolean
  instant: boolean
}) {
  const n = useCountUp(score, true, instant)
  const who = nomineeOf(id)
  const isPlayer = id === PLAYER_NOMINEE
  return (
    <div
      className={'res-nominee' + (isWinner ? ' win' : '')}
      style={
        isWinner && !isPlayer
          ? { borderColor: who?.color, background: (who?.color ?? '#333') + '33' }
          : undefined
      }
    >
      <span>{isPlayer ? 'You' : nomineeName(id)}</span>
      <b>{Math.round(n)}</b>
    </div>
  )
}

function AwardCard({
  result,
  instant,
  weeks,
}: {
  result: AwardResult
  instant: boolean
  weeks: number
}) {
  const award = awardOf(result.awardId)
  if (!award) return null
  const won = result.winnerId === PLAYER_NOMINEE
  const ranked = Object.keys(result.scores).sort(
    (a, b) => result.scores[b] - result.scores[a],
  )
  return (
    <div className={'res-award' + (result.awardId === AGENT_OF_THE_YEAR ? ' big' : '')}>
      <h3 className="res-display res-award-name">{award.name}</h3>
      <div className="res-award-sub">{award.subtitle}</div>
      <div className="res-nominees">
        {ranked.map((id) => (
          <NomineeRow
            key={id}
            id={id}
            score={result.scores[id]}
            isWinner={id === result.winnerId}
            instant={instant}
          />
        ))}
      </div>
      <p className={'res-award-line' + (won ? ' win' : '')}>
        {won
          ? award.winLine.replace('{weeks}', String(weeks))
          : award.loseLine.replaceAll('{winner}', nomineeName(result.winnerId))}
      </p>
    </div>
  )
}

export default function CeremonyModal({
  state,
  dispatch,
}: {
  state: GameState
  dispatch: Dispatch<Action>
}) {
  const c = state.ceremony
  const reduced = usePrefersReducedMotion()
  const [burst, setBurst] = useState(false)

  /* Gold on a player win, and nothing at all when motion is reduced. */
  const current = c && c.revealIndex > 0 ? c.results[c.revealIndex - 1] : null
  const currentWon = current?.winnerId === PLAYER_NOMINEE
  useEffect(() => {
    if (!currentWon || reduced) return
    setBurst(true)
    const t = setTimeout(() => setBurst(false), 2200)
    return () => clearTimeout(t)
  }, [currentWon, current?.awardId, reduced])

  if (!c) return null

  const revealed = c.results.slice(0, c.revealIndex)
  const done = c.revealIndex >= c.results.length
  const wins = c.results.filter((r) => r.winnerId === PLAYER_NOMINEE).length

  return (
    <div className="res-modal res-ceremony">
      <div className="res-proscenium" onClick={(e) => e.stopPropagation()}>
        <div className="res-ceremony-head">
          <div className="res-display res-ceremony-title">{CEREMONY_TITLE}</div>
          <div className="res-meta">Season {c.seasonIndex + 1}</div>
        </div>

        <div className="res-ceremony-body">
          {revealed.length === 0 && (
            <p className="res-blurb">
              The room has gone quiet in the way rooms do when there is a
              microphone and a list. Somebody taps it twice.
            </p>
          )}
          {revealed.map((r, i) => (
            <AwardCard
              key={r.awardId}
              result={r}
              weeks={state.week}
              /* Only the newest card animates; earlier ones are already read. */
              instant={reduced || i < revealed.length - 1}
            />
          ))}
        </div>

        {!done && (
          <button
            className="res-go"
            onClick={() => dispatch({ type: 'ADVANCE_CEREMONY' })}
          >
            {c.revealIndex === 0
              ? 'Begin'
              : c.revealIndex === c.results.length - 1
                ? 'And now — Agent of the Year'
                : 'Next category'}
          </button>
        )}

        {done && wins > 0 && !c.speechGiven && (
          <div className="res-speech">
            <h3 className="res-display">THE SPEECH</h3>
            <div className="res-meta" style={{ marginBottom: 8 }}>
              They are waiting. The music is cued.
            </div>
            {SPEECH_OPTIONS.map((o) => (
              <button
                key={o.key}
                className="res-tab res-speech-opt"
                onClick={() => dispatch({ type: 'GIVE_SPEECH', key: o.key })}
              >
                <b>{o.label}</b>
                <span>
                  +{o.rep} Rep
                  {o.ego ? ' · +' + o.ego + ' Ego' : ''}
                  {o.cringeSeason ? ' · cringe +5% next season' : ''}
                </span>
              </button>
            ))}
          </div>
        )}

        {done && wins === 0 && (
          <p className="res-blurb res-speech-none">{NO_SPEECH_LINE}</p>
        )}

        {done && (wins === 0 || c.speechGiven) && (
          <button
            className="res-go"
            onClick={() => dispatch({ type: 'CLOSE_CEREMONY' })}
          >
            {wins > 0 ? 'Take the photo' : 'Drive home'}
          </button>
        )}
      </div>

      {burst && (
        <div className="res-confetti">
          {Array.from({ length: 60 }).map((_, i) => (
            <i
              key={i}
              style={{
                left: ((i * 1.7) % 100) + '%',
                animationDelay: (i % 12) * 0.09 + 's',
                background: i % 3 === 0 ? '#f0e2ad' : '#c9a227',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
