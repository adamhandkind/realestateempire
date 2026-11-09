/* Node has no `cloudflare:workers`. The tests never construct a real
   Durable Object (fakeCity.ts drives Room directly); this only lets the
   Worker's entry module, which re-exports CityObject, load. */
export class DurableObject<E = unknown> {
  ctx: unknown
  env: E
  constructor(ctx: unknown, env: E) {
    this.ctx = ctx
    this.env = env
  }
}
