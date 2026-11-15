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
