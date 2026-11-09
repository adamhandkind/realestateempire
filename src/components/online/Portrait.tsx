/* A champion's portrait for the Hall of Fame wall and awards night, drawn in
   code like everything else: the burgundy blazer with shoulder pads that
   could stop a door, a gold tie, and the haircut, which has a name. Their
   own colour is the backdrop. */

import { hash } from '../../city/hash'
import { KIT } from '../../data/cityAwards'

const SKIN = ['#f1c9a5', '#d9a77e', '#b07a52', '#8a5a3a', '#f5d6bd']

export default function Portrait({ name, color, seed, size = 132 }: { name: string; color: string; seed: string; size?: number }) {
  const skin = SKIN[hash('skin' + seed) % SKIN.length]
  /* Each champion's haircut swoops its own way. */
  const swoop = hash('swoop' + seed) % 2 ? 1 : -1
  const id = 'p' + (hash(seed + name) % 1e6)
  return (
    <svg viewBox="0 0 120 140" width={size} height={(size * 140) / 120} role="img" aria-label={name + ' in the Champion’s Kit'} className="res-portrait">
      <defs>
        <linearGradient id={id + 'bg'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.95" />
          <stop offset="1" stopColor="#14161f" />
        </linearGradient>
        <linearGradient id={id + 'hair'} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={KIT.HAIR} />
          <stop offset="0.55" stopColor={KIT.HAIR_SHINE} />
          <stop offset="1" stopColor={KIT.HAIR} />
        </linearGradient>
      </defs>
      {/* The gilt frame. */}
      <rect x="1" y="1" width="118" height="138" rx="6" fill={KIT.GOLD} />
      <rect x="6" y="6" width="108" height="128" rx="3" fill={`url(#${id}bg)`} />
      {/* Blazer: the pads first, then the body, lapels, shirt and tie. */}
      <path d="M14 134 L18 102 Q20 92 34 90 L86 90 Q100 92 102 102 L106 134 Z" fill={KIT.BLAZER} />
      <rect x="14" y="88" width="30" height="12" rx="5" fill={KIT.BLAZER_LIGHT} />
      <rect x="76" y="88" width="30" height="12" rx="5" fill={KIT.BLAZER_LIGHT} />
      <path d="M48 90 L60 120 L72 90 Z" fill="#f5f2ea" />
      <path d="M57 96 L63 96 L65 118 L60 124 L55 118 Z" fill={KIT.GOLD} />
      <path d="M44 90 L60 124 L52 134 L40 104 Z" fill={KIT.LAPEL} />
      <path d="M76 90 L60 124 L68 134 L80 104 Z" fill={KIT.LAPEL} />
      <circle cx="74" cy="114" r="2.4" fill={KIT.GOLD} />
      <circle cx="74" cy="124" r="2.4" fill={KIT.GOLD} />
      {/* Head and neck. */}
      <rect x="52" y="74" width="16" height="18" fill={skin} />
      <ellipse cx="60" cy="62" rx="19" ry="22" fill={skin} />
      <circle cx="53" cy="62" r="2" fill="#1d1b20" />
      <circle cx="67" cy="62" r="2" fill="#1d1b20" />
      {/* The smile of someone who just closed. */}
      <path d="M51 71 Q60 79 69 71 Q60 75 51 71 Z" fill="#fff" stroke="#7a3b30" strokeWidth="1" />
      {/* The haircut: big, sculpted, shiny. */}
      <path
        d={`M38 58 Q36 26 ${60 + swoop * 6} 20 Q${86 + swoop * 4} 18 84 ${swoop > 0 ? 40 : 46} Q82 50 80 56 Q74 40 60 40 Q46 42 42 58 Z`}
        fill={`url(#${id}hair)`}
      />
      <path d={`M${50 + swoop * 6} 28 Q60 22 ${70 + swoop * 4} 27`} stroke="#fff3c4" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.8" />
      {/* A crown, obviously. */}
      <path d="M48 16 L52 6 L56 13 L60 4 L64 13 L68 6 L72 16 Z" fill={KIT.GOLD} stroke="#8a6d12" strokeWidth="0.8" />
    </svg>
  )
}
