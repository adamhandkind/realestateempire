/* Atmosphere: the touches that make the city feel alive at a glance.
   - Dusk: buildings switch their lights on one by one as it gets dark,
     instead of the whole city at once.
   - Water: slow ripples, and sun glints by day.
   - Stars: a twinkling sky behind the city at night. */

import * as THREE from 'three'
import { patchShader } from './pops'

const declareLot = (src: string) =>
  src.includes('attribute float lotIndex;') ? src : src.replace('void main() {', 'attribute float lotIndex;\nvoid main() {')

/** Each building gets its own darkness threshold for switching its lights on. */
export function duskLights(mat: THREE.MeshLambertMaterial, uniforms: { uNight: THREE.IUniform<number> }) {
  patchShader(mat, 'dusk', (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = declareLot(shader.vertexShader)
      .replace('void main() {', 'uniform float uNight;\nvarying float vLit;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        /* Street lamps (no lot) come on first; buildings follow in a hashed order. */
        float onAt = lotIndex < 0.0 ? 0.12 : 0.18 + 0.7 * fract(sin(lotIndex * 12.9898) * 43758.5453);
        vLit = smoothstep(onAt - 0.06, onAt + 0.06, uNight);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying float vLit;\nvoid main() {')
      .replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vLit;')
  })
}

/** Ripples and glints on the river. */
export function waterRipples(
  mat: THREE.MeshLambertMaterial,
  uniforms: { uTime: THREE.IUniform<number>; uDay: THREE.IUniform<number> },
) {
  patchShader(mat, 'water', (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec2 vW;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vW = (modelMatrix * vec4(transformed, 1.0)).xz;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uTime;\nuniform float uDay;\nvarying vec2 vW;\nvoid main() {')
      .replace(
        'vec3 totalEmissiveRadiance = emissive;',
        `vec3 totalEmissiveRadiance = emissive;
        float wv = sin(vW.x * 2.3 + uTime * 0.9) * sin(vW.y * 1.9 - uTime * 0.7)
                 + 0.55 * sin((vW.x + vW.y) * 4.7 + uTime * 1.6)
                 + 0.35 * sin((vW.x - vW.y) * 7.9 - uTime * 2.1);
        diffuseColor.rgb *= 0.91 + 0.09 * wv;
        float glint = smoothstep(1.45, 1.75, wv);
        totalEmissiveRadiance += glint * mix(vec3(0.35, 0.42, 0.6) * 0.5, vec3(1.0, 0.95, 0.82) * 0.55, uDay);`,
      )
  })
}

const STARS = 420

/** A screen-fixed field of stars, parked behind everything at the far plane. */
export class Stars {
  readonly points: THREE.Points
  private mat: THREE.ShaderMaterial

  constructor(far: number) {
    const pos = new Float32Array(STARS * 3)
    const seed = new Float32Array(STARS)
    for (let i = 0; i < STARS; i++) {
      /* Spread over a generous area; the camera's frustum crops it. */
      pos.set([(Math.random() - 0.5) * 80, (Math.random() - 0.5) * 50, -far * 0.97], i * 3)
      seed[i] = Math.random()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1))
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uPx: { value: 1 } },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float seed;
        uniform float uTime;
        uniform float uPx;
        varying float vA;
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          float tw = 0.55 + 0.45 * sin(uTime * (0.8 + seed * 2.2) + seed * 40.0);
          vA = (0.35 + 0.65 * seed) * tw;
          gl_PointSize = (1.0 + 2.2 * seed * seed) * uPx;
        }`,
      fragmentShader: `
        uniform float uNight;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(vec3(0.95, 0.96, 1.0), vA * uNight * smoothstep(0.5, 0.1, d));
        }`,
    })
    this.points = new THREE.Points(g, this.mat)
    this.points.frustumCulled = false
    this.points.renderOrder = -1
  }

  /** Stars ride with the camera, so pans and turns leave the sky alone. */
  update(t: number, night: number, zoom: number, pixelRatio: number) {
    this.mat.uniforms.uTime.value = t
    this.mat.uniforms.uNight.value = Math.max(0, night * 1.2 - 0.2)
    this.mat.uniforms.uPx.value = pixelRatio
    this.points.scale.set(1 / zoom, 1 / zoom, 1)
    this.points.visible = night > 0.17
  }

  dispose() {
    this.points.geometry.dispose()
    this.mat.dispose()
  }
}

const SHELL_SPARKS = 90
const PALETTE = ['#ffd76a', '#ff6b6b', '#7ad7ff', '#b58cff', '#7dffb0', '#fff3c4']

interface Shell {
  /** Seconds until launch; negative once it is in the air. */
  wait: number
  t: number
  fuse: number
  pts: THREE.Points
  vel: Float32Array
  burst: boolean
  x: number
  z: number
}

/** Fireworks: shells climb from street level, then break into colour. */
export class Fireworks {
  readonly group = new THREE.Group()
  private shells: Shell[] = []
  private enabled: boolean

  constructor(enabled: boolean) {
    this.enabled = enabled
  }

  /** A volley of `count` shells around (x, z), staggered so it rolls. */
  show(x: number, z: number, count: number) {
    if (!this.enabled) return
    for (let i = 0; i < count; i++) {
      const pos = new Float32Array(SHELL_SPARKS * 3)
      const vel = new Float32Array(SHELL_SPARKS * 3)
      const sx = x + (Math.random() - 0.5) * 7
      const sz = z + (Math.random() - 0.5) * 7
      for (let k = 0; k < SHELL_SPARKS; k++) pos.set([sx, 0.5, sz], k * 3)
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      const col = PALETTE[Math.floor(Math.random() * PALETTE.length)]
      const pts = new THREE.Points(
        g,
        new THREE.PointsMaterial({ color: col, size: 8, sizeAttenuation: false, transparent: true, depthWrite: false }),
      )
      pts.frustumCulled = false
      pts.visible = false
      this.group.add(pts)
      this.shells.push({ wait: i * 0.38 + Math.random() * 0.15, t: 0, fuse: 0.75 + Math.random() * 0.3, pts, vel, burst: false, x: sx, z: sz })
    }
  }

  update(dt: number) {
    const step = Math.min(dt, 1 / 20)
    for (const s of [...this.shells]) {
      if (s.wait > 0) {
        s.wait -= step
        continue
      }
      s.pts.visible = true
      s.t += step
      const attr = s.pts.geometry.getAttribute('position') as THREE.BufferAttribute
      const a = attr.array as Float32Array
      const mat = s.pts.material as THREE.PointsMaterial
      if (!s.burst) {
        /* Climbing: every spark rides together as one bright point. */
        const y = 0.5 + 9 * s.t - 3 * s.t * s.t
        for (let k = 0; k < SHELL_SPARKS; k++) a.set([s.x, y, s.z], k * 3)
        mat.size = 5
        if (s.t >= s.fuse) {
          s.burst = true
          s.t = 0
          mat.size = 8
          const speed = 3.4 + Math.random() * 1.4
          for (let k = 0; k < SHELL_SPARKS; k++) {
            /* Even spread over a sphere, so it reads as a round burst. */
            const u = Math.random() * 2 - 1
            const th = Math.random() * Math.PI * 2
            const r = Math.sqrt(1 - u * u) * speed * (0.85 + Math.random() * 0.15)
            s.vel.set([Math.cos(th) * r, u * speed, Math.sin(th) * r], k * 3)
          }
        }
      } else {
        const drag = Math.exp(-1.6 * step)
        for (let k = 0; k < SHELL_SPARKS; k++) {
          s.vel[k * 3] *= drag
          s.vel[k * 3 + 1] = s.vel[k * 3 + 1] * drag - 2.2 * step
          s.vel[k * 3 + 2] *= drag
          a[k * 3] += s.vel[k * 3] * step
          a[k * 3 + 1] += s.vel[k * 3 + 1] * step
          a[k * 3 + 2] += s.vel[k * 3 + 2] * step
        }
        const k = s.t / 1.8
        /* A little crackle on the way out. */
        mat.opacity = Math.max(0, 1 - k * k) * (k > 0.55 ? 0.7 + 0.3 * Math.sin(s.t * 40) : 1)
        if (k >= 1) this.drop(s)
      }
      attr.needsUpdate = true
    }
  }

  private drop(s: Shell) {
    this.group.remove(s.pts)
    s.pts.geometry.dispose()
    ;(s.pts.material as THREE.Material).dispose()
    this.shells = this.shells.filter((x) => x !== s)
  }

  dispose() {
    for (const s of [...this.shells]) this.drop(s)
  }
}

/** Soft cloud shadows drifting across the city: they dim direct sunlight
 *  only, so lit windows and lamps are untouched. */
export function cloudShadows(
  mat: THREE.Material,
  uniforms: { uCloudT: THREE.IUniform<number>; uDay: THREE.IUniform<number> },
) {
  patchShader(mat, 'clouds', (shader) => {
    shader.uniforms.uCloudT = uniforms.uCloudT
    shader.uniforms.uCloudDay = uniforms.uDay
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec2 vCW;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vCW = (modelMatrix * vec4(transformed, 1.0)).xz;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform float uCloudT;
        uniform float uCloudDay;
        varying vec2 vCW;
        float cHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float cNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(cHash(i), cHash(i + vec2(1, 0)), u.x), mix(cHash(i + vec2(0, 1)), cHash(i + vec2(1, 1)), u.x), u.y);
        }
        float cloudShade(vec2 w) {
          vec2 p = (w + vec2(uCloudT * 0.55, uCloudT * 0.2)) * 0.085;
          float n = 0.65 * cNoise(p) + 0.35 * cNoise(p * 2.3 + 7.1);
          /* About a third of the city under cloud at any moment. */
          return 1.0 - 0.42 * uCloudDay * smoothstep(0.5, 0.68, n);
        }
        void main() {`,
      )
      .replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse',
        'vec3 outgoingLight = reflectedLight.directDiffuse * cloudShade(vCW)',
      )
  })
}
