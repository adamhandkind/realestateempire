/* The city's Durable Object: one per city, named by the city's id. It owns
   the city's storage and its nightly alarm and hands every call to Room
   (room.ts). The Worker only reaches it after checking who's asking
   (game.ts), so nothing here re-checks sign-in or membership. */

import { DurableObject } from 'cloudflare:workers'
import type { Env } from './env'
import { Room, RoomError, type Agent, type RoomStorage } from './room'

export type RoomResult<T> = { ok: true; value: T } | { ok: false; status: number; code: string; message: string }

/** RPC can't carry a custom error class, so failures come back as data. */
async function wrap<T>(f: () => Promise<T>): Promise<RoomResult<T>> {
  try {
    return { ok: true, value: await f() }
  } catch (e) {
    if (e instanceof RoomError) return { ok: false, status: e.status, code: e.code, message: e.message }
    throw e
  }
}

export class CityObject extends DurableObject<Env> {
  private room: Room

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    const s = ctx.storage
    const storage: RoomStorage = {
      get: (k) => s.get(k),
      put: (k, v) => s.put(k, v),
      list: (o) => s.list(o),
      setAlarm: (t) => s.setAlarm(t),
      deleteAlarm: () => s.deleteAlarm(),
    }
    this.room = new Room(storage, env)
  }

  join(cityId: string, agent: Agent, restart: boolean) {
    return wrap(() => this.room.join(cityId, agent, restart))
  }
  game(cityId: string, userId: string) {
    return wrap(() => this.room.game(cityId, userId))
  }
  view(cityId: string, userId: string) {
    return wrap(() => this.room.view(cityId, userId))
  }
  act(cityId: string, userId: string, baseVersion: number, actions: unknown) {
    return wrap(() => this.room.act(cityId, userId, baseVersion, actions))
  }
  bid(cityId: string, userId: string, body: { listingId: string; amount: number; downPct: number }) {
    return wrap(() => this.room.bid(cityId, userId, body))
  }
  withdraw(cityId: string, userId: string, listingId: string) {
    return wrap(() => this.room.withdraw(cityId, userId, listingId))
  }
  start(cityId: string, userId: string) {
    return wrap(() => this.room.start(cityId, userId))
  }
  setSchedule(cityId: string, userId: string, hour: number, zone: string) {
    return wrap(() => this.room.setSchedule(cityId, userId, hour, zone))
  }
  manualTick() {
    return wrap(() => this.room.manualTick())
  }

  async alarm(): Promise<void> {
    await this.room.runTick()
  }
}
