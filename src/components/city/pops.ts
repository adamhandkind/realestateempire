/* Build pops: when a lot changes hands or gets a new building, that building
   rises out of the ground with a springy overshoot and a dust ring spreads
   from its base. The city is one merged mesh, so the rise is done in the
   vertex shader: every vertex already carries its lot's index, and up to four
   lots at a time get their height scaled. */

import * as THREE from 'three'

const RISE = 0.8
const RING = 0.7

export interface PopUniforms {
  [name: string]: THREE.IUniform
  uPopLot: { value: THREE.Vector4 }
  uPopK: { value: THREE.Vector4 }
}

/** Springy settle: overshoots to ~1.1, then lands on 1. */
export function easeOutBack(t: number): number {
  const c1 = 1.9
  const c3 = c1 + 1
  const u = t - 1
  return 1 + c3 * u * u * u + c1 * u * u
}

/** Teach a material to squash the lots named in the uniforms. */
export function popMaterial(mat: THREE.Material, uniforms: PopUniforms) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        'attribute float lotIndex;\nuniform vec4 uPopLot;\nuniform vec4 uPopK;\nvoid main() {',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 popHit = 1.0 - step(0.5, abs(vec4(lotIndex) - uPopLot));
        transformed.y *= 1.0 + dot(popHit, uPopK - 1.0);`,
      )
  }
  mat.customProgramCacheKey = () => 'build-pop'
}

interface Pop {
  slot: number
  t: number
  ring: THREE.Mesh
}

export class BuildPops {
  readonly group = new THREE.Group()
  readonly uniforms: PopUniforms = {
    uPopLot: { value: new THREE.Vector4(-1, -1, -1, -1) },
    uPopK: { value: new THREE.Vector4(1, 1, 1, 1) },
  }
  private live: Pop[] = []
  private ringGeo = new THREE.RingGeometry(0.42, 0.5, 40).rotateX(-Math.PI / 2)

  private enabled: boolean

  constructor(enabled: boolean) {
    this.enabled = enabled
  }

  start(lotIndex: number, x: number, z: number) {
    if (!this.enabled) return
    /* Reuse a slot already on this lot, else a free one, else the oldest. */
    const lots = this.uniforms.uPopLot.value
    let slot = [0, 1, 2, 3].find((i) => lots.getComponent(i) === lotIndex)
    slot ??= [0, 1, 2, 3].find((i) => !this.live.some((p) => p.slot === i))
    if (slot === undefined) {
      slot = this.live[0].slot
      this.drop(this.live[0])
    }
    const old = this.live.find((p) => p.slot === slot)
    if (old) this.drop(old)
    lots.setComponent(slot, lotIndex)
    this.uniforms.uPopK.value.setComponent(slot, 0.02)

    const ring = new THREE.Mesh(
      this.ringGeo,
      new THREE.MeshBasicMaterial({ color: '#f3e7cf', transparent: true, opacity: 0.9, depthWrite: false }),
    )
    ring.position.set(x, 0.06, z)
    ring.scale.setScalar(0.3)
    this.group.add(ring)
    this.live.push({ slot, t: 0, ring })
  }

  update(dt: number) {
    /* A long frame (a hidden tab) shouldn't skip the whole thing. */
    const step = Math.min(dt, 1 / 20)
    for (const p of [...this.live]) {
      p.t += step
      const rise = Math.min(1, p.t / RISE)
      this.uniforms.uPopK.value.setComponent(p.slot, Math.max(0.02, easeOutBack(rise)))
      const r = Math.min(1, p.t / RING)
      p.ring.scale.setScalar(0.3 + 1.5 * (1 - (1 - r) * (1 - r)))
      ;(p.ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - r)
      p.ring.visible = r < 1
      if (rise >= 1 && r >= 1) this.drop(p)
    }
  }

  private drop(p: Pop) {
    this.uniforms.uPopLot.value.setComponent(p.slot, -1)
    this.uniforms.uPopK.value.setComponent(p.slot, 1)
    this.group.remove(p.ring)
    ;(p.ring.material as THREE.Material).dispose()
    this.live = this.live.filter((x) => x !== p)
  }

  dispose() {
    for (const p of [...this.live]) this.drop(p)
    this.ringGeo.dispose()
  }
}
