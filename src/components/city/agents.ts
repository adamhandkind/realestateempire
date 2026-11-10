/* The agents on the map: you, and (in a shared city) everyone else who has
   the game open. Each is a little low-poly figure in their colour; last
   season's champion walks in the full kit — burgundy blazer with shoulder
   pads, a big shiny sculpted haircut, crocodile boots.

   Walks are described as (from tile, to tile, start time), the same thing
   the live room sends, and every browser works out the same route
   (city/paths → findPath), so a walk looks the same everywhere without
   streaming positions. */

import * as THREE from 'three'
import type { CityLayout } from '../../city/layout'
import { findPath, GROUND_Y, tileAt, walkable, type Tile } from '../../city/paths'
import { hash } from '../../city/hash'
import { KIT } from '../../data/cityAwards'
import { wx, wz } from './cityMesh'

export interface AgentSpec {
  id: string
  name: string
  /** CSS colour. */
  color: string
  you: boolean
  champion: boolean
  /** The champion's title, for their label. */
  title?: string
  from: Tile
  to: Tile
  /** performance.now()-free: Date.now() ms when the walk began. */
  at: number
}

/** Tiles per second. Brisk; there are listings to see. */
const SPEED = 2.6
const SKIN = ['#f1c9a5', '#d9a77e', '#b07a52', '#8a5a3a', '#f5d6bd']

interface Walker {
  spec: AgentSpec
  path: Tile[]
  /** Where along the path each point is, in world units. */
  points: THREE.Vector3[]
  group: THREE.Group
  legs: THREE.Object3D[]
  label: HTMLDivElement
  /** Last drawn position, for picking up a new walk where this one is. */
  at: THREE.Vector3
}

const mat = (color: string, shiny = false) =>
  shiny ? new THREE.MeshPhongMaterial({ color, shininess: 90, specular: '#fff3c4' }) : new THREE.MeshLambertMaterial({ color })

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), m)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  return mesh
}

/** A figure about half a house tall, standing at the origin, facing +x. */
export function figure(color: string, champion: boolean, key: string): { group: THREE.Group; legs: THREE.Object3D[] } {
  const g = new THREE.Group()
  const skin = mat(SKIN[hash('skin' + key) % SKIN.length])
  const legs: THREE.Object3D[] = []
  for (const side of [-1, 1]) {
    /* A pivot at the hip so the leg swings. */
    const hip = new THREE.Group()
    hip.position.set(0, 0.17, side * 0.045)
    const leg = box(0.05, 0.17, 0.05, mat(champion ? '#2a2326' : '#2f3542'), 0, -0.17, 0)
    hip.add(leg)
    if (champion) {
      /* Crocodile boots: tall, pointed, scaled. */
      hip.add(box(0.1, 0.06, 0.06, mat(KIT.BOOTS, true), 0.02, -0.17, 0))
      hip.add(box(0.03, 0.02, 0.064, mat(KIT.BOOTS_SCALES), 0.0, -0.13, 0))
    }
    legs.push(hip)
    g.add(hip)
  }
  if (champion) {
    /* The burgundy blazer, shoulder pads that could stop a door, gold buttons. */
    g.add(box(0.12, 0.19, 0.18, mat(KIT.BLAZER), 0, 0.16, 0))
    g.add(box(0.13, 0.05, 0.3, mat(KIT.BLAZER_LIGHT), 0, 0.31, 0))
    g.add(box(0.125, 0.12, 0.04, mat(KIT.LAPEL), 0.004, 0.2, 0))
    g.add(box(0.13, 0.02, 0.02, mat(KIT.GOLD, true), 0.003, 0.22, 0))
    g.add(box(0.13, 0.02, 0.02, mat(KIT.GOLD, true), 0.003, 0.18, 0))
  } else {
    g.add(box(0.11, 0.17, 0.16, mat(color), 0, 0.17, 0))
  }
  g.add(box(0.1, 0.1, 0.1, skin, 0, 0.35, 0))
  if (champion) {
    /* The haircut: big, sculpted and shiny. */
    const hair = mat(KIT.HAIR, true)
    g.add(box(0.12, 0.05, 0.12, hair, -0.005, 0.43, 0))
    g.add(box(0.1, 0.06, 0.1, hair, 0.02, 0.47, 0))
    g.add(box(0.06, 0.04, 0.08, mat(KIT.HAIR_SHINE, true), 0.045, 0.5, 0))
  } else {
    g.add(box(0.105, 0.03, 0.105, mat('#3b2a1e'), -0.005, 0.44, 0))
  }
  /* A disc in their colour, so you can tell whose agent it is from afar. */
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.15, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }),
  )
  ring.position.y = 0.012
  g.add(ring)
  g.scale.setScalar(1.6)
  return { group: g, legs }
}

export class AgentLayer {
  readonly group = new THREE.Group()
  private walkers = new Map<string, Walker>()
  private city: CityLayout
  private labels: HTMLElement

  constructor(city: CityLayout, labels: HTMLElement) {
    this.city = city
    this.labels = labels
  }

  /** Where a tile's agent stands: a little off-centre per person, so two
   *  people on one corner don't merge. */
  private standAt(t: Tile, id: string, y?: number): THREE.Vector3 {
    const k = hash('stand' + id)
    const ox = ((k % 7) - 3) * 0.04
    const oz = (((k >> 3) % 7) - 3) * 0.04
    const tile = tileAt(this.city, t[0], t[1])
    return new THREE.Vector3(wx(t[0]) + ox, y ?? (tile ? GROUND_Y[tile.kind] : 0), wz(t[1]) + oz)
  }

  private route(spec: AgentSpec): { path: Tile[]; points: THREE.Vector3[] } {
    /* Nowhere to walk (into the river): stay put. */
    const path = findPath(this.city, spec.from, spec.to) ?? [walkable(this.city, ...spec.from) ? spec.from : spec.to]
    const points = path.map((t) => this.standAt(t, spec.id))
    /* At a lot, stop out front rather than inside the living room. */
    if (path.length > 1) {
      const last = tileAt(this.city, ...spec.to)
      if (last && last.kind !== 'road' && last.kind !== 'bridge') points[points.length - 1].lerp(points[points.length - 2], 0.45)
    }
    return { path, points }
  }

  setAgents(specs: AgentSpec[]) {
    const keep = new Set(specs.map((s) => s.id))
    for (const [id, w] of this.walkers)
      if (!keep.has(id)) {
        this.drop(w)
        this.walkers.delete(id)
      }
    for (const spec of specs) {
      let w = this.walkers.get(spec.id)
      const look = (s: AgentSpec) => s.color + s.champion + s.name + (s.title ?? '')
      if (w && look(w.spec) !== look(spec)) {
        this.drop(w)
        this.walkers.delete(spec.id)
        w = undefined
      }
      if (!w) {
        const { group, legs } = figure(spec.color, spec.champion, spec.id)
        group.userData.agentId = spec.id
        const label = document.createElement('div')
        label.className = 'res-agent-label' + (spec.you ? ' you' : '') + (spec.champion ? ' champ' : '')
        label.style.setProperty('--agent', spec.color)
        label.textContent = (spec.champion ? '👑 ' : '') + (spec.you ? 'You' : spec.name) + (spec.champion && spec.title ? ' · ' + spec.title : '')
        this.labels.appendChild(label)
        this.group.add(group)
        const r = this.route(spec)
        w = { spec, ...r, group, legs, label, at: r.points[0].clone() }
        this.walkers.set(spec.id, w)
      } else if (w.spec.at !== spec.at || w.spec.to.join() !== spec.to.join() || w.spec.from.join() !== spec.from.join()) {
        w.spec = spec
        Object.assign(w, this.route(spec))
      }
    }
  }

  /** The tile an agent is on now (or about to step onto). */
  tileOf(id: string, now = Date.now()): Tile | null {
    const w = this.walkers.get(id)
    if (!w) return null
    const i = Math.min(w.path.length - 1, Math.round(((now - w.spec.at) / 1000) * SPEED))
    return w.path[Math.max(0, i)]
  }

  /** The agent a ray hits first (a click on a figure or its colour disc). */
  pick(raycaster: THREE.Raycaster): string | null {
    for (const hit of raycaster.intersectObjects(this.group.children, true)) {
      for (let o: THREE.Object3D | null = hit.object; o; o = o.parent)
        if (typeof o.userData.agentId === 'string') return o.userData.agentId
    }
    return null
  }

  /** Where an agent is in the world (for the camera to follow). */
  positionOf(id: string): THREE.Vector3 | null {
    return this.walkers.get(id)?.at ?? null
  }

  update(t: number, now = Date.now()) {
    for (const w of this.walkers.values()) {
      const along = Math.max(0, ((now - w.spec.at) / 1000) * SPEED)
      const last = w.points.length - 1
      const i = Math.min(last, Math.floor(along))
      const f = i >= last ? 0 : along - i
      const a = w.points[i]
      const b = w.points[Math.min(last, i + 1)]
      w.at.lerpVectors(a, b, f)
      const walking = along < last
      if (walking) {
        const dx = b.x - a.x
        const dz = b.z - a.z
        if (dx || dz) w.group.rotation.y = Math.atan2(-dz, dx)
      }
      const phase = t * 11 + (hash(w.spec.id) % 10)
      const swing = walking ? Math.sin(phase) * 0.6 : 0
      w.legs[0].rotation.z = swing
      w.legs[1].rotation.z = -swing
      /* The champ struts. */
      const bob = walking ? Math.abs(Math.sin(phase)) * (w.spec.champion ? 0.035 : 0.02) : 0
      w.group.position.set(w.at.x, w.at.y + bob, w.at.z)
    }
  }

  positionLabels(camera: THREE.Camera, width: number, height: number, zoom: number) {
    const v = new THREE.Vector3()
    for (const w of this.walkers.values()) {
      v.set(w.at.x, w.at.y + 0.85, w.at.z).project(camera)
      const x = (v.x * 0.5 + 0.5) * width
      const y = (-v.y * 0.5 + 0.5) * height
      w.label.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
      w.label.style.opacity = zoom > 0.9 || w.spec.you || w.spec.champion ? '1' : '0'
    }
  }

  private drop(w: Walker) {
    this.group.remove(w.group)
    w.group.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      ;(m.material as THREE.Material | undefined)?.dispose?.()
    })
    w.label.remove()
  }

  dispose() {
    for (const w of this.walkers.values()) this.drop(w)
    this.walkers.clear()
  }
}
