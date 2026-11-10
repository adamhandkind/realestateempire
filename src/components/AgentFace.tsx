/* A playable agent's face, drawn in code like the Hall of Fame portraits: a
   round headshot in their accent colour, with the haircut, outfit and props
   from data/faces. */

import { useId } from 'react'
import { faceFor, type FaceLook, type Hair, type Mouth } from '../data/faces'

const INK = '#1d1b20'
const LIP = '#7a3b30'
const GOLD = '#e9c94a'

/* Hair that sits behind the head (long sides, curls). */
function HairBack({ hair, c }: { hair: Hair; c: string }) {
  if (hair === 'bob')
    return <path d="M30 46 Q29 20 50 20 Q71 20 70 46 L71 62 Q66 64 62 61 L62 40 L38 40 L38 61 Q34 64 29 62 Z" fill={c} />
  if (hair === 'sleek') return <path d="M31 44 Q30 20 50 20 Q70 20 69 44 L69 64 L31 64 Z" fill={c} />
  if (hair === 'curls')
    return (
      <g fill={c}>
        {[
          [33, 32, 7],
          [38, 24, 7],
          [47, 20, 7],
          [57, 21, 7],
          [65, 26, 7],
          [68, 35, 7],
          [31, 42, 6.5],
          [69, 44, 6.5],
          [30.5, 52, 6],
          [69.5, 53, 6],
        ].map(([x, y, r]) => (
          <circle key={x + ':' + y} cx={x} cy={y} r={r} />
        ))}
      </g>
    )
  return null
}

/* Hair over the forehead. */
function HairFront({ hair, c }: { hair: Hair; c: string }) {
  switch (hair) {
    case 'short':
      return <path d="M33.5 44 Q31 24 50 23.5 Q69 24 66.5 44 Q65 33 58 31 Q50 34 42 31 Q35 33 33.5 44 Z" fill={c} />
    case 'side':
      return <path d="M33.5 44 Q31 23 48 23 Q69 23 66.5 42 Q64 31 54 30 Q44 33 38 31 Q35 35 33.5 44 Z" fill={c} />
    case 'bob':
      return <path d="M33.5 42 Q32 23 50 23 Q68 23 66.5 42 Q62 32 52 31 Q44 30 38 35 Q35 38 33.5 42 Z" fill={c} />
    case 'sleek':
      return (
        <g fill={c}>
          <path d="M33 38.5 Q33 22 50 22 Q67 22 67 38.5 Z" />
          <rect x="31" y="36" width="4.5" height="28" />
          <rect x="64.5" y="36" width="4.5" height="28" />
        </g>
      )
    case 'swoop':
      return (
        <g>
          <path d="M33.5 42 Q30 20 55 19 Q73 20 67 40 Q66 30 56 29 Q46 29 42 34 Q38 30 33.5 42 Z" fill={c} />
          <path d="M40 30 Q52 14 70 24 Q58 22 48 31 Z" fill={c} />
          <path d="M45 23 Q54 18 63 21" stroke="#fff3c4" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.8" />
        </g>
      )
    case 'fade':
      return <path d="M34 38 Q34 23 50 23 Q66 23 66 38 Q62 33 50 32.5 Q38 33 34 38 Z" fill={c} />
    case 'quiff':
      return (
        <g>
          <path d="M34 40 Q32 26 40 22 Q46 8 60 12 Q70 16 66 40 Q63 30 54 29 Q44 29 34 40 Z" fill={c} />
          <path d="M45 18 Q52 11 61 14" stroke="#fff3c4" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.6" />
        </g>
      )
    case 'ring':
      return (
        <g>
          <path d="M33.5 49 Q31 40 35 33 Q36 38 37.5 41 Z" fill={c} />
          <path d="M66.5 49 Q69 40 65 33 Q64 38 62.5 41 Z" fill={c} />
          <ellipse cx="45" cy="30" rx="4.5" ry="2" fill="#fff" opacity="0.35" />
        </g>
      )
    case 'curls':
      return (
        <g fill={c}>
          <circle cx="40" cy="28" r="6" />
          <circle cx="50" cy="26" r="6.5" />
          <circle cx="60" cy="28" r="6" />
        </g>
      )
  }
}

function MouthShape({ mouth, lipstick }: { mouth: Mouth; lipstick: boolean }) {
  const stroke = lipstick ? '#b3121f' : LIP
  const w = lipstick ? 2.6 : 1.6
  switch (mouth) {
    case 'smile':
      return <path d="M44 53.5 Q50 58.5 56 53.5" stroke={stroke} strokeWidth={w} fill="none" strokeLinecap="round" />
    case 'smirk':
      return <path d="M44.5 54.5 Q51 56.5 56.5 52" stroke={stroke} strokeWidth={w} fill="none" strokeLinecap="round" />
    case 'flat':
      return <path d="M45 54.5 Q50 55.3 55 54.5" stroke={stroke} strokeWidth={w} fill="none" strokeLinecap="round" />
    case 'grin':
      return <path d="M43 52.5 Q50 60 57 52.5 Q50 55 43 52.5 Z" fill="#fff" stroke={stroke} strokeWidth="1" />
    case 'beam':
      return <path d="M42.5 52 Q50 62 57.5 52 Z" fill="#fff" stroke={stroke} strokeWidth="1" />
  }
}

function Person({ f }: { f: FaceLook }) {
  const has = (p: FaceLook['props'][number]) => f.props.includes(p)
  const brow = f.hairColor
  return (
    <g>
      <HairBack hair={f.hair} c={f.hairColor} />
      {/* Body: outfit, the shirt in the V, lapel lines. */}
      <path d="M10 100 Q12 78 32 73 L68 73 Q88 78 90 100 Z" fill={f.outfit} />
      <path d="M42 73 L50 92 L58 73 Z" fill={f.shirt} />
      <path d="M42 73 L50 92 L58 73" stroke="rgba(0,0,0,.25)" strokeWidth="1" fill="none" />
      {has('popped') && (
        <g fill={f.shirt}>
          <path d="M40 73 L43 65 L49.5 77 Z" />
          <path d="M60 73 L57 65 L50.5 77 Z" />
        </g>
      )}
      {has('tie') && <path d="M48.5 74 L51.5 74 L53 88 L50 92 L47 88 Z" fill="#7a1f2b" />}
      {has('cravat') && <path d="M44 73 Q50 80 56 73 Q53 84 50 87 Q47 84 44 73 Z" fill="#7a5ea3" />}
      {has('collar') && <rect x="47.5" y="74" width="5" height="4" rx="0.6" fill="#fff" />}
      {/* Neck, ears, head. */}
      <rect x="44" y="58" width="12" height="17" fill={f.skin} />
      <rect x="44" y="58" width="12" height="5" fill="rgba(0,0,0,.12)" />
      <circle cx="33.5" cy="46" r="3.5" fill={f.skin} />
      <circle cx="66.5" cy="46" r="3.5" fill={f.skin} />
      <ellipse cx="50" cy="44" rx="16.5" ry="19" fill={f.skin} />
      {has('pearls') && (
        <g fill="#f7f3ea" stroke="rgba(0,0,0,.2)" strokeWidth="0.3">
          {[42, 45, 48, 51, 54, 57].map((x, i) => (
            <circle key={x} cx={x + 0.5} cy={72 + Math.sin((i / 5) * Math.PI) * 2.6} r="1.5" />
          ))}
        </g>
      )}
      {/* Eyes and brows. */}
      <circle cx="44" cy="45" r="1.9" fill={INK} />
      <circle cx="56" cy="45" r="1.9" fill={INK} />
      <path d="M40.5 40.5 Q44 38.8 47 40.2" stroke={brow} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M53 40.2 Q56 38.8 59.5 40.5" stroke={brow} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {has('eyebags') && (
        <g stroke="#8a5a6a" strokeWidth="0.9" fill="none" strokeLinecap="round">
          <path d="M41.5 48.3 Q44 49.8 46.5 48.3" />
          <path d="M53.5 48.3 Q56 49.8 58.5 48.3" />
        </g>
      )}
      {has('wrinkles') && (
        <g stroke="rgba(0,0,0,.2)" strokeWidth="0.8" fill="none" strokeLinecap="round">
          <path d="M38.5 45 L36.3 44.2 M38.5 46.6 L36.3 47.4" />
          <path d="M61.5 45 L63.7 44.2 M61.5 46.6 L63.7 47.4" />
          <path d="M41.5 51 Q40.5 54 42.5 57" />
          <path d="M58.5 51 Q59.5 54 57.5 57" />
        </g>
      )}
      <MouthShape mouth={f.mouth} lipstick={has('lipstick')} />
      {has('moustache') && (
        <path d="M43.5 51.2 Q47 48.8 50 51 Q53 48.8 56.5 51.2 Q53 53 50 52 Q47 53 43.5 51.2 Z" fill="#5c574e" />
      )}
      <HairFront hair={f.hair} c={f.hairColor} />
      {/* Props on the face. */}
      {has('monocle') && (
        <g stroke={GOLD} fill="none">
          <circle cx="56" cy="45" r="4.2" strokeWidth="1.2" fill="rgba(255,255,255,.15)" />
          <path d="M60 46.5 Q66 56 62 70" strokeWidth="0.7" />
        </g>
      )}
      {has('readers') && (
        <g stroke="#c9a227" strokeWidth="1" fill="rgba(255,255,255,.15)">
          <rect x="39.5" y="45.5" width="8" height="4.6" rx="1.6" />
          <rect x="52.5" y="45.5" width="8" height="4.6" rx="1.6" />
          <path d="M47.5 47 L52.5 47" fill="none" />
          <path d="M39.5 47.5 Q34 60 40 72 M60.5 47.5 Q66 60 60 72" fill="none" strokeWidth="0.6" />
        </g>
      )}
      {has('cateye') && (
        <g stroke={INK} strokeWidth="1.3" fill="rgba(255,255,255,.12)" strokeLinejoin="round">
          <path d="M38.5 42.5 L48 43.3 Q48 48.2 44 48.2 Q39.8 48.2 38.5 42.5 Z" />
          <path d="M52 43.3 L61.5 42.5 Q60.2 48.2 56 48.2 Q52 48.2 52 43.3 Z" />
          <path d="M48 44.5 L52 44.5 M38.5 42.5 L36.5 40.5 M61.5 42.5 L63.5 40.5" fill="none" />
        </g>
      )}
      {has('shades') && (
        <g fill={INK}>
          <rect x="38" y="24" width="10.5" height="5" rx="2.2" />
          <rect x="51.5" y="24" width="10.5" height="5" rx="2.2" />
          <rect x="48" y="25.5" width="4" height="1.2" />
        </g>
      )}
      {has('tophat') && (
        <g>
          <rect x="37" y="6" width="26" height="22" rx="1.5" fill="#141418" />
          <rect x="37" y="21" width="26" height="4" fill="#7a5ea3" />
          <ellipse cx="50" cy="28" rx="21" ry="3.6" fill="#141418" />
        </g>
      )}
      {has('earrings') && (
        <g stroke={GOLD} strokeWidth="1.2" fill="none">
          <circle cx="33" cy="52" r="2.6" />
          <circle cx="67" cy="52" r="2.6" />
        </g>
      )}
      {/* Props in front of the body. */}
      {has('mic') && (
        <g>
          <rect x="73.5" y="78" width="3" height="24" fill="#2a2a2e" />
          <rect x="68.5" y="60" width="13" height="20" rx="6.5" fill="#2a2a2e" />
          <rect x="68.5" y="72" width="13" height="3" fill="#c8372d" />
          <g stroke="#55555c" strokeWidth="0.6">
            <path d="M70.5 64 L79.5 64 M70 67 L80 67 M70 70 L80 70" />
          </g>
        </g>
      )}
      {has('phone') && (
        <g>
          <rect x="15" y="62" width="12" height="20" rx="2" fill={INK} />
          <rect x="16.5" y="64" width="9" height="15" rx="0.8" fill="#9fd3ff" />
          <ellipse cx="21" cy="84" rx="6.5" ry="5" fill={f.skin} />
        </g>
      )}
    </g>
  )
}

export default function AgentFace({
  characterId,
  accent,
  size,
  label,
  inline,
}: {
  characterId: string
  accent: string
  size: number
  /** Sits in a line of text (the header) rather than on a card. */
  inline?: boolean
  /** Accessible name; omit when the name is printed right beside it. */
  label?: string
}) {
  const f = faceFor(characterId)
  const id = 'af' + useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={'res-face' + (inline ? ' res-face-inline' : '')}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <clipPath id={id + 'clip'}>
          <circle cx="50" cy="50" r="48" />
        </clipPath>
        <radialGradient id={id + 'bg'} cx="50%" cy="35%" r="70%">
          <stop offset="0" stopColor={accent} stopOpacity="0.9" />
          <stop offset="1" stopColor="#14161f" />
        </radialGradient>
        {f.sepia && (
          <filter id={id + 'sepia'}>
            <feColorMatrix
              type="matrix"
              values="0.39 0.77 0.19 0 0  0.35 0.69 0.17 0 0  0.27 0.53 0.13 0 0  0 0 0 1 0"
            />
          </filter>
        )}
      </defs>
      <g clipPath={`url(#${id}clip)`}>
        <g filter={f.sepia ? `url(#${id}sepia)` : undefined}>
          <rect width="100" height="100" fill={`url(#${id}bg)`} />
          {/* A soft light behind the head, so dark hair reads on a dark ground. */}
          <ellipse cx="50" cy="42" rx="30" ry="30" fill="#fff" opacity="0.1" />
          {f.props.includes('ringlight') && (
            <circle cx="50" cy="42" r="29" fill="none" stroke="#fff8e0" strokeWidth="5" opacity="0.85" />
          )}
          <g opacity={f.fade ?? 1}>
            <Person f={f} />
          </g>
        </g>
      </g>
      <circle cx="50" cy="50" r="48" fill="none" stroke={accent} strokeWidth="3" />
      <circle cx="50" cy="50" r="46.2" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="0.8" />
    </svg>
  )
}
