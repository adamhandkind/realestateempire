/* Stands in for the CITY Durable Object namespace in Node: one Room per city
   name, on in-memory storage, with every argument and result copied the way
   RPC would. `clock` drives the room's sense of time; `fireAlarms` plays the
   alarms that are due. */

import { Room, RoomError, type RoomEnv, type RoomStorage } from '../room'

export function memoryStorage() {
  const data = new Map<string, unknown>()
  let alarm: number | null = null
  const storage: RoomStorage = {
    async get<T>(k: string) {
      return data.has(k) ? (structuredClone(data.get(k)) as T) : undefined
    },
    async put(k, v) {
      data.set(k, structuredClone(v))
    },
    async list<T>({ prefix }: { prefix: string }) {
      const out = new Map<string, T>()
      for (const [k, v] of [...data].sort(([a], [b]) => a.localeCompare(b)))
        if (k.startsWith(prefix)) out.set(k, structuredClone(v) as T)
      return out
    },
    async setAlarm(t) {
      alarm = t
    },
    async deleteAlarm() {
      alarm = null
    },
  }
  return { storage, data, alarm: () => alarm }
}

export function fakeCityNamespace(env: () => RoomEnv) {
  const clock = { now: Date.UTC(2026, 10, 10, 12) }
  const rooms = new Map<string, { room: Room; mem: ReturnType<typeof memoryStorage> }>()
  const roomFor = (name: string) => {
    let r = rooms.get(name)
    if (!r) {
      const mem = memoryStorage()
      r = { room: new Room(mem.storage, env(), () => clock.now), mem }
      rooms.set(name, r)
    }
    return r
  }
  const namespace = {
    idFromName: (name: string) => name,
    get: (id: string) =>
      new Proxy(
        {},
        {
          get: (_t, method: string) => async (...args: unknown[]) => {
            const { room } = roomFor(id)
            const fn = (room as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[method]
            try {
              return { ok: true, value: structuredClone(await fn.apply(room, structuredClone(args))) }
            } catch (e) {
              if (e instanceof RoomError) return { ok: false, status: e.status, code: e.code, message: e.message }
              throw e
            }
          },
        },
      ),
  }
  return {
    namespace,
    clock,
    rooms,
    /** Advances the clock to each due alarm and runs it, `max` times at most. */
    async fireAlarms(max = 1) {
      let fired = 0
      for (const { room, mem } of rooms.values()) {
        for (let i = 0; i < max; i++) {
          const at = mem.alarm()
          if (at === null) break
          clock.now = Math.max(clock.now, at)
          await room.runTick()
          fired++
        }
      }
      return fired
    },
  }
}
