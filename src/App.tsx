/* Front door. If a backend answers /api (the Cloudflare Worker), play is
   online: accounts, invites, cloud saves, a leaderboard. If nothing does
   (plain `npm run dev`, a static host), it's the local single-player game. */

import { useCallback, useEffect, useState } from 'react'
import LocalGame from './LocalGame'
import OnlineApp from './components/online/OnlineApp'
import { ApiError, probe, type Me } from './net/api'
import PartyPhone from './components/party/PartyPhone'
import PartyTv from './components/party/PartyTv'

/* Land Grab party mode has its own two screens, chosen by address: /tv for
   the big screen, /join (or /join/ABCD from the QR code) for each phone. */
const PARTY_PAGE = (() => {
  const p = window.location.pathname
  if (p === '/tv' || p.startsWith('/tv/')) return 'tv'
  if (p === '/join' || p.startsWith('/join/')) return 'phone'
  return null
})()

type Boot =
  | { kind: 'probing' }
  | { kind: 'local' }
  | {
      kind: 'online'
      initial: { kind: 'loading' } | { kind: 'signedOut' } | { kind: 'me'; me: Me } | { kind: 'error'; message: string }
    }

export default function App() {
  if (PARTY_PAGE === 'tv') return <PartyTv />
  if (PARTY_PAGE === 'phone') return <PartyPhone />
  return <MainApp />
}

function MainApp() {
  const [boot, setBoot] = useState<Boot>({ kind: 'probing' })

  useEffect(() => {
    /* A login link has to reach the online flow before the probe, which
       would otherwise report "signed out". */
    const hasLogin = new URL(window.location.href).searchParams.has('login')
    probe().then(
      (p) => {
        if (p.kind === 'none') setBoot({ kind: 'local' })
        else if (hasLogin) setBoot({ kind: 'online', initial: { kind: 'loading' } })
        else setBoot({ kind: 'online', initial: p.kind === 'me' ? p : { kind: 'signedOut' } })
      },
      (e) =>
        setBoot({
          kind: 'online',
          initial: { kind: 'error', message: e instanceof ApiError ? e.message : 'The server is having a moment.' },
        }),
    )
  }, [])

  const toLocal = useCallback(() => setBoot({ kind: 'local' }), [])

  if (boot.kind === 'probing') return null
  if (boot.kind === 'local') return <LocalGame />
  return <OnlineApp initial={boot.initial} onNoBackend={toLocal} />
}
