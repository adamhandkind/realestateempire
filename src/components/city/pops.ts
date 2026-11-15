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

/** Add a shader patch on top of whatever patches a material already has. */
export function patchShader(
  mat: THREE.Material,
  key: string,
  fn: (shader: THREE.WebGLProgramParametersWithUniforms) => void,
) {
  const prev = mat.onBeforeCompile.bind(mat)
  const prevKey = mat.customProgramCacheKey.bind(mat)
  mat.onBeforeCompile = (shader, r) => {
    prev(shader, r)
    fn(shader)
  }
  mat.customProgramCacheKey = () => prevKey() + '|' + key
}

/** Teach a material to squash the lots named in the uniforms. */
export function popMaterial(mat: THREE.Material, uniforms: PopUniforms) {
  patchShader(mat, 'build-pop', (shader) => {
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
  })
}

const SPARKS = 36
const SPARK_LIFE = 1.3

interface Burst {
  t: number
  pts: THREE.Points
  vel: Float32Array
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
  private bursts: Burst[] = []
  private sparkMat = new THREE.PointsMaterial({
    color: '#ffd76a',
    size: 7,
    sizeAttenuation: false,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  private ringGeo = new THREE.RingGeometry(0.42, 0.5, 40).rotateX(-Math.PI / 2)

  private enabled: boolean

  constructor(enabled: boolean) {
    this.enabled = enabled
  }

  /** Gold sparks fountaining off a roof: something just became yours. */
  burst(x: number, y: number, z: number) {
    if (!this.enabled) return
    const pos = new Float32Array(SPARKS * 3)
    const vel = new Float32Array(SPARKS * 3)
    for (let i = 0; i < SPARKS; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 0.6 + Math.random() * 1.4
      pos.set([x, y, z], i * 3)
      vel.set([Math.cos(a) * r, 2.6 + Math.random() * 2.4, Math.sin(a) * r], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const pts = new THREE.Points(g, this.sparkMat.clone())
    pts.frustumCulled = false
    this.group.add(pts)
    this.bursts.push({ t: 0, pts, vel })
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
    for (const b of [...this.bursts]) {
      b.t += step
      const attr = b.pts.geometry.getAttribute('position') as THREE.BufferAttribute
      const a = attr.array as Float32Array
      for (let i = 0; i < SPARKS; i++) {
        b.vel[i * 3 + 1] -= 7 * step
        a[i * 3] += b.vel[i * 3] * step
        a[i * 3 + 1] = Math.max(0.05, a[i * 3 + 1] + b.vel[i * 3 + 1] * step)
        a[i * 3 + 2] += b.vel[i * 3 + 2] * step
      }
      attr.needsUpdate = true
      const k = b.t / SPARK_LIFE
      ;(b.pts.material as THREE.PointsMaterial).opacity = 1 - k * k
      if (k >= 1) this.dropBurst(b)
    }
  }

  private dropBurst(b: Burst) {
    this.group.remove(b.pts)
    b.pts.geometry.dispose()
    ;(b.pts.material as THREE.Material).dispose()
    this.bursts = this.bursts.filter((x) => x !== b)
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
    for (const b of [...this.bursts]) this.dropBurst(b)
    this.ringGeo.dispose()
    this.sparkMat.dispose()
  }
}
