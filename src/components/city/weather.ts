/* Seasonal weather over the city, following the market quarter: blossom
   petals drifting in spring, fireflies on summer nights, leaves tumbling in
   the fall, snow all winter. One THREE.Points cloud, moved on the CPU (a few
   hundred points), sized in screen pixels so it reads at any zoom. */

import * as THREE from 'three'
import { COLS, ROWS } from '../../city/layout'
import type { Season } from '../../city/season'

interface Kind {
  count: number
  size: number
  colors: string[]
  /** Fall speed (world units / s) and sideways sway. */
  fall: number
  sway: number
  /** Only after dark (fireflies). */
  night: boolean
  round: boolean
  top: number
}

const KINDS: Record<Season, Kind> = {
  spring: { count: 220, size: 4, colors: ['#f7c6d9', '#f2a7c3', '#fde3ec'], fall: 0.35, sway: 0.5, night: false, round: false, top: 9 },
  summer: { count: 140, size: 3.5, colors: ['#fff3a0', '#d8ff7a'], fall: 0, sway: 0.25, night: true, round: true, top: 1.6 },
  fall: { count: 260, size: 4.5, colors: ['#d9772b', '#c9502e', '#e3a93a', '#a8432a'], fall: 0.55, sway: 0.7, night: false, round: false, top: 9 },
  winter: { count: 650, size: 3, colors: ['#ffffff', '#eef4ff'], fall: 0.7, sway: 0.25, night: false, round: true, top: 11 },
}

let dot: THREE.Texture | null = null
/** A soft round dot, drawn once. */
function dotTexture(): THREE.Texture {
  if (dot) return dot
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.8)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 32, 32)
  dot = new THREE.CanvasTexture(c)
  return dot
}

export class Weather {
  readonly points: THREE.Points
  private kind: Kind
  private pos: Float32Array
  private seed: Float32Array
  private material: THREE.PointsMaterial

  constructor(season: Season) {
    const k = (this.kind = KINDS[season])
    this.pos = new Float32Array(k.count * 3)
    this.seed = new Float32Array(k.count)
    const col = new Float32Array(k.count * 3)
    const c = new THREE.Color()
    for (let i = 0; i < k.count; i++) {
      this.seed[i] = Math.random() * Math.PI * 2
      this.pos[i * 3] = (Math.random() - 0.5) * COLS
      this.pos[i * 3 + 1] = Math.random() * k.top
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * ROWS
      c.set(k.colors[i % k.colors.length])
      col.set([c.r, c.g, c.b], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    this.material = new THREE.PointsMaterial({
      size: k.size,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      map: k.round ? dotTexture() : null,
    })
    this.points = new THREE.Points(g, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 5
  }

  /** dt in seconds; day 0..1; zoom the camera's. */
  update(t: number, dt: number, day: number, zoom: number, pixelRatio: number) {
    const k = this.kind
    const p = this.pos
    const step = Math.min(dt, 0.1)
    for (let i = 0; i < k.count; i++) {
      const s = this.seed[i]
      const j = i * 3
      if (k.fall > 0) {
        p[j] += Math.sin(t * 0.8 + s) * k.sway * step
        p[j + 1] -= k.fall * (0.7 + 0.6 * ((s * 7) % 1)) * step
        p[j + 2] += Math.cos(t * 0.6 + s * 1.3) * k.sway * 0.6 * step
        if (p[j + 1] < 0) {
          p[j + 1] = k.top
          p[j] = (Math.random() - 0.5) * COLS
          p[j + 2] = (Math.random() - 0.5) * ROWS
        }
      } else {
        /* Fireflies wander low and blink. */
        p[j] += Math.sin(t * 0.7 + s * 3) * k.sway * step
        p[j + 2] += Math.cos(t * 0.5 + s * 2) * k.sway * step
        p[j + 1] = 0.25 + (Math.sin(t * 1.1 + s) * 0.5 + 0.5) * (k.top - 0.25)
      }
    }
    this.points.geometry.getAttribute('position').needsUpdate = true
    const blink = k.night ? (1 - day) * (0.65 + 0.35 * Math.sin(t * 3)) : 1
    this.material.opacity = k.night ? blink : 0.9
    this.points.visible = !k.night || day < 0.85
    this.material.size = k.size * Math.max(0.8, Math.min(2.4, zoom)) * pixelRatio
  }

  dispose() {
    this.points.geometry.dispose()
    this.material.dispose()
  }
}
