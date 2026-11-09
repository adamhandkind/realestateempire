/* The live room: who's on the map, and what everyone hears. */

import { describe, expect, it } from 'vitest'
import { parseClientMessage } from '../../src/live/presence'
import { LiveHub, type LiveSocket } from '../live'

function sock() {
  let att: unknown = null
  const sent: any[] = []
  const ws: LiveSocket & { sent: any[] } = {
    sent,
    send: (t) => sent.push(JSON.parse(t)),
    close: () => {},
    deserializeAttachment: () => structuredClone(att),
    serializeAttachment: (v) => {
      att = structuredClone(v)
    },
  }
  return ws
}

const who = (userId: string) => ({ userId, name: userId.toUpperCase(), color: 'coral', characterId: 'you', champion: userId === 'a' })

describe('the live room', () => {
  it('tells everyone where an agent is walking, and who left', () => {
    const socks: ReturnType<typeof sock>[] = []
    const clock = { now: 1000 }
    const hub = new LiveHub(() => socks, () => clock.now)
    const a = sock()
    const b = sock()
    socks.push(a)
    hub.open(a, who('a'))
    expect(a.sent[0]).toMatchObject({ t: 'hello', you: 'a', agents: [] })
    hub.message(a, JSON.stringify({ t: 'go', from: [3, 4], to: [5, 4] }))
    socks.push(b)
    hub.open(b, who('b'))
    expect(b.sent[0].agents).toEqual([expect.objectContaining({ userId: 'a', champion: true, from: [3, 4], to: [5, 4], at: 1000 })])
    clock.now += 1000
    hub.message(b, JSON.stringify({ t: 'go', from: [1, 1], to: [1, 2] }))
    expect(a.sent.at(-1)).toMatchObject({ t: 'agent', agent: { userId: 'b', champion: false } })
    expect(b.sent.some((m) => m.t === 'agent')).toBe(false)
    socks.splice(socks.indexOf(b), 1)
    hub.close(b)
    expect(a.sent.at(-1)).toEqual({ t: 'left', userId: 'b' })
  })

  it('keeps one agent per person across tabs, and ignores spam and junk', () => {
    const socks: ReturnType<typeof sock>[] = []
    const clock = { now: 0 }
    const hub = new LiveHub(() => socks, () => clock.now)
    const t1 = sock()
    const t2 = sock()
    const other = sock()
    socks.push(t1, t2, other)
    hub.open(t1, who('a'))
    hub.open(t2, who('a'))
    hub.open(other, who('c'))
    clock.now = 500
    hub.message(t1, JSON.stringify({ t: 'go', from: [0, 0], to: [1, 0] }))
    hub.message(t1, JSON.stringify({ t: 'go', from: [1, 0], to: [2, 0] }))
    clock.now = 900
    hub.message(t2, JSON.stringify({ t: 'go', from: [9, 9], to: [9, 8] }))
    expect(hub.agents()).toEqual([expect.objectContaining({ userId: 'a', from: [9, 9] })])
    expect(other.sent.filter((m) => m.t === 'agent')).toHaveLength(2)
    /* closing one tab of two: still on the map */
    socks.splice(0, 1)
    hub.close(t1)
    expect(other.sent.some((m) => m.t === 'left')).toBe(false)
    hub.message(other, 'not json')
    hub.message(other, JSON.stringify({ t: 'go', from: [-1, 0], to: [0, 0] }))
    hub.message(other, JSON.stringify({ t: 'go', from: [0, 0], to: [400, 0] }))
    expect(hub.agents().map((x) => x.userId)).toEqual(['a'])
    hub.message(other, JSON.stringify({ t: 'ping' }))
    expect(other.sent.at(-1)).toEqual({ t: 'pong' })
  })

  it('parses only what it expects', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'go', from: [1, 2], to: [3, 4], extra: 'x' }))).toEqual({ t: 'go', from: [1, 2], to: [3, 4] })
    expect(parseClientMessage(JSON.stringify({ t: 'go', from: [1.5, 2], to: [3, 4] }))).toBeNull()
    expect(parseClientMessage('x'.repeat(500))).toBeNull()
    expect(parseClientMessage(42)).toBeNull()
  })
})
