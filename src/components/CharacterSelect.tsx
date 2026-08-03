import { useEffect, useRef, useState } from 'react'
import { CHARACTERS, PERK_FLAW } from '../data/characters'
import { DEFAULT_CHARACTER_ID } from '../data/p5'
import { AP_PER_WEEK, START_CASH } from '../logic/economy'
import type { CharacterDef } from '../state/types'

/** 3×3, with "You" dead centre. Every roster id appears exactly once. */
const GRID_ORDER = [
  'nigel',
  'doreen',
  'hunter',
  'chip',
  'you',
  'dave',
  'svetlana',
  'blaine',
  'terri',
]

const GRID: CharacterDef[] = GRID_ORDER.map(
  (id) => CHARACTERS.find((c) => c.id === id)!,
).filter(Boolean)

const shortCash = (n: number): string =>
  n === 0 ? '$0 start' : n >= 1000 ? '$' + Math.round(n / 1000) + 'k start' : '$' + n

/** Up to four chips, derived from the def — never hand-written per character. */
function chipsFor(c: CharacterDef): string[] {
  const out: string[] = []
  const stat = (label: string, n: number) =>
    n !== 0 && out.push((n > 0 ? '+' : '−') + Math.abs(n) + ' ' + label)
  stat('Hustle', c.statMods.hustle)
  stat('Swagger', c.statMods.swagger)
  stat('Ego', c.statMods.ego)
  if (c.apPerWeek !== AP_PER_WEEK) out.push(c.apPerWeek + ' AP')
  if (c.start.cash !== START_CASH) out.push(shortCash(c.start.cash))
  return out.slice(0, 4)
}

function Portrait({ c, size }: { c: CharacterDef; size: number }) {
  return (
    <div
      className="res-portrait"
      style={{ borderColor: c.portrait.accent, width: size, height: size }}
    >
      <span style={{ fontSize: size * 0.44 }}>{c.portrait.emoji}</span>
      <b style={{ color: c.portrait.accent }}>{c.portrait.initials}</b>
    </div>
  )
}

export default function CharacterSelect({
  onStart,
}: {
  onStart: (characterId: string) => void
}) {
  const [index, setIndex] = useState(
    Math.max(0, GRID.findIndex((c) => c.id === DEFAULT_CHARACTER_ID)),
  )
  const gridRef = useRef<HTMLDivElement>(null)
  const selected = GRID[index]
  const pf = PERK_FLAW[selected.id] ?? { perk: 'None', flaw: 'None' }

  useEffect(() => {
    gridRef.current?.focus()
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const move = (d: number) =>
      setIndex((i) => (i + d + GRID.length) % GRID.length)
    if (e.key === 'ArrowRight') move(1)
    else if (e.key === 'ArrowLeft') move(-1)
    else if (e.key === 'ArrowDown') move(3)
    else if (e.key === 'ArrowUp') move(-3)
    else if (e.key === 'Enter') onStart(selected.id)
    else return
    e.preventDefault()
  }

  return (
    <div className="res-app">
      <h1 className="res-display res-select-title">CHOOSE YOUR AGENT</h1>

      <div
        className="res-roster"
        ref={gridRef}
        tabIndex={0}
        role="listbox"
        aria-label="Playable agents"
        onKeyDown={onKeyDown}
      >
        {GRID.map((c, i) => (
          <div
            key={c.id}
            role="option"
            aria-selected={i === index}
            className={'res-char' + (i === index ? ' on' : '')}
            style={{ borderColor: i === index ? c.portrait.accent : undefined }}
            onClick={() => setIndex(i)}
            onDoubleClick={() => onStart(c.id)}
          >
            <Portrait c={c} size={64} />
            <div className="nm">{c.name}</div>
            <div className="res-meta">{c.tagline}</div>
            <div className="res-chiprow">
              {/* A derived chip the perk line already leads with would read
                  as a duplicate, so it yields to the perk. */}
              {chipsFor(c)
                .filter(
                  (t) =>
                    !(PERK_FLAW[c.id]?.perk ?? '').split(' · ')[0].includes(t),
                )
                .map((t) => (
                  <span className="res-chip" key={t}>
                    {t}
                  </span>
                ))}
              <span className="res-chip perk">
                {(PERK_FLAW[c.id]?.perk ?? 'None').split(' · ')[0]}
              </span>
              <span className="res-chip flaw">
                {(PERK_FLAW[c.id]?.flaw ?? 'None').split(' · ')[0]}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="res-panel res-detail">
        <div className="res-detail-head">
          <Portrait c={selected} size={88} />
          <div>
            <h2 className="res-display">{selected.name}</h2>
            <div className="res-meta">{selected.tagline}</div>
          </div>
        </div>
        <p className="res-blurb">{selected.bio}</p>

        <div className="res-line">
          <span className="res-mint">PERKS</span>
          <b className="res-mint">{pf.perk}</b>
        </div>
        <div className="res-line">
          <span className="res-loss">FLAWS</span>
          <b className="res-loss">{pf.flaw}</b>
        </div>

        <div className="res-brag">{selected.brags[0]}</div>

        <button className="res-go" onClick={() => onStart(selected.id)}>
          Start as {selected.name}
        </button>
      </div>
    </div>
  )
}
