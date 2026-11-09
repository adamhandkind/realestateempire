/* The city's live room: every open browser's WebSocket, and where each one's
   agent is walking. The Durable Object uses the hibernation API, so a socket
   costs nothing while nobody moves; each socket carries its own state as an
   attachment, which survives the object sleeping. Kept apart from the
   runtime (it sees sockets through LiveSocket) so the tests can drive it. */

import { dedupe, MIN_GO_MS, parseClientMessage, type LiveAgent, type ServerMessage } from '../src/live/presence'

export interface LiveSocket {
  send(text: string): void
  close(code?: number, reason?: string): void
  deserializeAttachment(): unknown
  serializeAttachment(v: unknown): void
}

/** What a socket remembers about itself. `agent` is null until it first
 *  says where it is: someone who has the game open but never looked at the
 *  map isn't standing anywhere. */
export interface SocketState {
  userId: string
  name: string
  color: string
  characterId: string
  champion: boolean
  agent: LiveAgent | null
  lastGo: number
}

export class LiveHub {
  private sockets: () => LiveSocket[]
  private now: () => number

  constructor(sockets: () => LiveSocket[], now: () => number = Date.now) {
    this.sockets = sockets
    this.now = now
  }

  private state(ws: LiveSocket): SocketState | null {
    const s = ws.deserializeAttachment() as SocketState | null
    return s && typeof s.userId === 'string' ? s : null
  }

  private send(ws: LiveSocket, m: ServerMessage) {
    try {
      ws.send(JSON.stringify(m))
    } catch {
      /* closing; the close handler tidies up */
    }
  }

  /** Everyone standing on the map right now, one per person. */
  agents(except?: LiveSocket): LiveAgent[] {
    const out: LiveAgent[] = []
    for (const ws of this.sockets()) {
      if (ws === except) continue
      const s = this.state(ws)
      if (s?.agent) out.push(s.agent)
    }
    return dedupe(out)
  }

  broadcast(m: ServerMessage, except?: LiveSocket) {
    for (const ws of this.sockets()) if (ws !== except) this.send(ws, m)
  }

  /** A socket just opened (the Worker has already checked who it is). */
  open(ws: LiveSocket, who: Omit<SocketState, 'agent' | 'lastGo'>) {
    ws.serializeAttachment({ ...who, agent: null, lastGo: 0 } satisfies SocketState)
    this.send(ws, { t: 'hello', you: who.userId, agents: this.agents(ws).filter((a) => a.userId !== who.userId), now: this.now() })
  }

  message(ws: LiveSocket, raw: unknown) {
    const s = this.state(ws)
    const m = parseClientMessage(raw)
    if (!s || !m) return
    if (m.t === 'ping') return this.send(ws, { t: 'pong' })
    const now = this.now()
    if (now - s.lastGo < MIN_GO_MS) return
    const agent: LiveAgent = {
      userId: s.userId,
      name: s.name,
      color: s.color,
      characterId: s.characterId,
      champion: s.champion,
      from: m.from,
      to: m.to,
      at: now,
    }
    ws.serializeAttachment({ ...s, agent, lastGo: now } satisfies SocketState)
    this.broadcast({ t: 'agent', agent }, ws)
  }

  /** A socket closed. If that was their last tab, they leave the map. */
  close(ws: LiveSocket) {
    const s = this.state(ws)
    if (!s) return
    const still = this.sockets().some((o) => o !== ws && this.state(o)?.userId === s.userId)
    if (!still && s.agent) this.broadcast({ t: 'left', userId: s.userId }, ws)
  }
}
