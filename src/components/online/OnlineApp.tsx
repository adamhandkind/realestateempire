/* Online play, start to finish: invite or sign-in link → 18+ check → city → agent →
   game. Each step asks the server where things stand (GET /api/me) rather
   than remembering, so a refresh always lands on the right screen. */

import { useCallback, useEffect, useState } from 'react'
import { ApiError, api, probe, type InvitePeek, type Me, type SaveText } from '../../net/api'
import CityGame from './CityGame'
import CreateAgent from './CreateAgent'
import { AdultGate, CityPicker, FoundCity, Gate, NoCity, SignIn } from './screens'
import './online.css'

const CITY_KEY = 'res_city'
const rememberCity = (id: string | null) => {
  try {
    if (id) window.localStorage.setItem(CITY_KEY, id)
    else window.localStorage.removeItem(CITY_KEY)
  } catch {
    /* fine */
  }
}
const recalledCity = () => {
  try {
    return window.localStorage.getItem(CITY_KEY)
  } catch {
    return null
  }
}

/** Reads ?login= and ?invite= once and takes them out of the address bar,
 *  so a refresh or a shared screenshot doesn't carry them. */
function takeParams(): { login: string | null; invite: string | null } {
  const url = new URL(window.location.href)
  const login = url.searchParams.get('login')
  const invite = url.searchParams.get('invite')
  if (login || invite) {
    url.searchParams.delete('login')
    url.searchParams.delete('invite')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  }
  return { login, invite }
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'signedOut' }
  | { kind: 'me'; me: Me }
  | { kind: 'error'; message: string }

export default function OnlineApp({ initial, onNoBackend }: { initial: Phase; onNoBackend: () => void }) {
  const [phase, setPhase] = useState<Phase>(initial)
  const [params] = useState(takeParams)
  const [invite, setInvite] = useState<string | null>(params.invite)
  const [invitePeek, setInvitePeek] = useState<InvitePeek | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [cityId, setCityId] = useState<string | null>(recalledCity)
  const [save, setSave] = useState<SaveText | null>(null)
  const [restarting, setRestarting] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const p = await probe()
      if (p.kind === 'none') onNoBackend()
      else setPhase(p.kind === 'me' ? { kind: 'me', me: p.me } : { kind: 'signedOut' })
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof ApiError ? e.message : 'The server is having a moment.' })
    }
  }, [onNoBackend])

  /* First load: spend a sign-in link, look at the invite, then see who we are. */
  useEffect(() => {
    void (async () => {
      if (params.login) {
        try {
          await api.verify(params.login)
        } catch (e) {
          setNotice(e instanceof ApiError ? e.message : "Couldn't sign you in.")
        }
      }
      if (invite) api.peekInvite(invite).then(setInvitePeek, () => {})
      await refresh()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Signed in and holding an invite: join that city. */
  useEffect(() => {
    if (phase.kind !== 'me' || !invite) return
    const token = invite
    setInvite(null)
    api
      .acceptInvite(token)
      .then((r) => {
        setCityId(r.cityId)
        rememberCity(r.cityId)
        return refresh()
      })
      .catch((e) => setNotice(e instanceof ApiError ? e.message : "Couldn't take that invite."))
  }, [phase, invite, refresh])

  const me = phase.kind === 'me' ? phase.me : null
  const city = me ? (me.cities.find((c) => c.id === cityId) ?? (me.cities.length === 1 ? me.cities[0] : null)) : null

  /* Load the save once there's an agent to load. */
  useEffect(() => {
    if (!city?.agent || restarting || save) return
    let live = true
    api.getGame(city.id).then(
      (s) => live && setSave(s),
      (e) => live && setPhase({ kind: 'error', message: e instanceof ApiError ? e.message : "Couldn't load your game." }),
    )
    return () => {
      live = false
    }
  }, [city, restarting, save])

  const signOut = async () => {
    await api.logout().catch(() => {})
    setSave(null)
    setPhase({ kind: 'signedOut' })
  }
  const switchCity = () => {
    rememberCity(null)
    setCityId(null)
    setSave(null)
  }

  if (phase.kind === 'loading') return <Gate title="Opening the office…">{null}</Gate>
  if (phase.kind === 'error')
    return (
      <Gate title="Something broke">
        <p>{phase.message}</p>
        <button className="res-go" onClick={() => void refresh()}>
          Try again
        </button>
      </Gate>
    )
  if (phase.kind === 'signedOut')
    return (
      <SignIn
        invite={invite}
        invitePeek={invitePeek}
        notice={notice}
        onJoined={(id) => {
          setInvite(null)
          setCityId(id)
          rememberCity(id)
          void refresh()
        }}
      />
    )

  const m = phase.me
  if (!m.user.adult) return <AdultGate onDone={() => void refresh()} />
  if (m.cities.length === 0)
    return m.user.isOwner ? (
      <FoundCity onDone={() => void refresh()} onSignOut={signOut} />
    ) : (
      <NoCity email={m.user.email} onSignOut={signOut} />
    )
  if (!city)
    return (
      <CityPicker
        cities={m.cities}
        onPick={(id) => {
          setCityId(id)
          rememberCity(id)
        }}
      />
    )
  if (!city.agent || restarting)
    return (
      <CreateAgent
        city={city}
        restart={restarting}
        onCreated={(s) => {
          setRestarting(false)
          setSave(s)
          rememberCity(city.id)
          void refresh()
        }}
      />
    )
  if (!save) return <Gate eyebrow={city.name} title="Loading your game…">{null}</Gate>

  return (
    <>
      {notice && (
        <div className="res-app">
          <div className="res-banner res-notice" style={{ marginTop: 10 }}>
            <span>{notice}</span>
            <button aria-label="Dismiss" onClick={() => setNotice(null)}>
              ×
            </button>
          </div>
        </div>
      )}
      <CityGame
        key={city.id}
        city={city}
        email={m.user.email}
        cityCount={m.cities.length}
        save={save}
        onNewGame={() => {
          setSave(null)
          setRestarting(true)
        }}
        onSwitchCity={switchCity}
        onSignOut={signOut}
        onSignedOut={() => setPhase({ kind: 'signedOut' })}
      />
    </>
  )
}
