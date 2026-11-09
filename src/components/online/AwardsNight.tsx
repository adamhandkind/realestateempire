/* Awards night: week 52's ceremony. The champion is crowned (portrait,
   title, final number) and the rest of the group gets roasted. Shown once
   per browser when a season finishes, and on demand from the League tab. */

import type { Award, SeasonResult } from '../../citygame/types'
import { AWARDS } from '../../data/cityAwards'
import { AGENT_COLORS } from '../../data/agentColors'
import { money } from '../../logic/rand'
import Portrait from './Portrait'

const hexOf = (id: string) => AGENT_COLORS.find((c) => c.id === id)?.hex ?? '#888'

const line = (a: Award) => AWARDS[a.id].line.replace(/\{a\}/g, a.name).replace(/\{stat\}/g, a.stat)

export default function AwardsNight({ result, me, onClose }: { result: SeasonResult; me: string; onClose: () => void }) {
  const champ = result.standings[0]
  const roasts = (result.awards ?? []).filter((a) => a.id !== 'champion')
  if (!champ) return null
  const youWon = champ.userId === me
  return (
    <div className="res-modal res-modal-top" role="dialog" aria-modal="true" aria-label={'Season ' + result.season + ' awards night'} onClick={onClose}>
      <div className="res-awards" onClick={(e) => e.stopPropagation()}>
        <div className="res-eyebrow">Season {result.season} · Week 52</div>
        <h2 className="res-display">Awards Night</h2>
        <div className="res-awards-crown">
          <Portrait name={champ.name} color={hexOf(champ.color)} seed={result.season + ':' + champ.userId} size={150} />
          <div>
            <div className="res-meta">Champion of the City</div>
            <div className="res-awards-name">{youWon ? 'You' : champ.name}</div>
            {result.title && <div className="res-awards-title">“{result.title}”</div>}
            <p>{line(result.awards?.[0] ?? { id: 'champion', userId: champ.userId, name: champ.name, color: champ.color, stat: '' })}</p>
            <div className="res-awards-stats">
              <span>
                <b>{money(champ.netWorth)}</b> net worth
              </span>
              {champ.doors !== undefined && (
                <span>
                  <b>{champ.doors}</b> doors
                </span>
              )}
              {champ.deals !== undefined && (
                <span>
                  <b>{champ.deals}</b> deals
                </span>
              )}
            </div>
            <p className="res-awards-kit">
              {youWon
                ? 'You’ll wear the kit all next season: the burgundy blazer, the haircut, the crocodile boots. Everyone will see you coming.'
                : champ.name + ' wears the kit all next season. You will hear the boots before you see them.'}
            </p>
          </div>
        </div>
        {roasts.length > 0 && (
          <>
            <h3 className="res-h2 res-display">The Roast</h3>
            <ul className="res-roasts">
              {roasts.map((a) => (
                <li key={a.id} className={a.userId === me ? 'you' : ''}>
                  <div className="res-roast-title">{AWARDS[a.id].title}</div>
                  <div>
                    <b style={{ color: hexOf(a.color) }}>{a.userId === me ? 'You' : a.name}</b> — {line(a)}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="res-awards-final">
          <div className="res-meta">Final standings</div>
          <ol>
            {result.standings.map((s) => (
              <li key={s.userId}>
                <span className="dot" style={{ background: hexOf(s.color) }} /> {s.userId === me ? 'You' : s.name} · {money(s.netWorth)}
              </li>
            ))}
          </ol>
        </div>
        <button className="res-go" onClick={onClose}>
          {youWon ? 'Put on the blazer' : 'Applaud politely'}
        </button>
      </div>
    </div>
  )
}
