/* Seconds left on the turn clock, ticking. Corrects for a device whose own
   clock is off, using the server time sent with each view. */

import { useEffect, useRef, useState } from 'react'
import type { PartyView } from '../../party/protocol'

export function useSecondsLeft(view: PartyView | null): number | null {
  const offset = useRef(0)
  const [now, setNow] = useState(() => Date.now())
  const serverNow = view?.serverNow
  useEffect(() => {
    if (serverNow) offset.current = serverNow - Date.now()
  }, [serverNow])
  const deadline = view?.deadline ?? null
  useEffect(() => {
    if (deadline === null) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [deadline])
  if (deadline === null) return null
  /* Never more than the clock had when the server sent it. */
  const full = Math.ceil((deadline - (view?.serverNow ?? deadline)) / 1000)
  return Math.max(0, Math.min(full, Math.ceil((deadline - (now + offset.current)) / 1000)))
}
