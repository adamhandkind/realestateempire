/* Front door. If a backend answers /api (the Cloudflare Worker), play is
   online: accounts, invites, cloud saves, a leaderboard. If nothing does
   (plain `npm run dev`, a static host), it's the local single-player game. */

import { useCallback, useEffect, useState } from 'react'
import LocalGame from './LocalGame'
import OnlineApp from './components/online/OnlineApp'
import { ApiError, probe, type Me } from './net/api'

type Boot =
  | { kind: 'probing' }
  | { kind: 'local' }
  | {
      kind: 'online'
      initial: { kind: 'loading' } | { kind: 'signedOut' } | { kind: 'me'; me: Me } | { kind: 'error'; message: string }
    }

export default function App() {
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
