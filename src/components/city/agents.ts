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
const SKIN = ['#f1c9a5', '#d9a77e', '#b07a52', '#8a5a3a', '#f5d6bd', '#c68b62']
const HAIR = ['#2b1d14', '#3b2a1e', '#6b4a2b', '#c9a35a', '#1a1a1d', '#8c3b1f', '#9a9a9a']
const TROUSERS = ['#2f3542', '#24272f', '#3a3f4b', '#4a4037']

/** The joints a walk cycle drives. Every pivot sits where the joint is, so
 *  rotating it swings whatever hangs below. */
export interface Rig {
  root: THREE.Group
  /** Everything above the ground: bobs, leans and sways. */
  body: THREE.Group
  torso: THREE.Group
  head: THREE.Group
  hips: [THREE.Group, THREE.Group]
  knees: [THREE.Group, THREE.Group]
  shoulders: [THREE.Group, THREE.Group]
  elbows: [THREE.Group, THREE.Group]
  phone: THREE.Object3D
}

interface Walker {
  spec: AgentSpec
  path: Tile[]
  /** Where along the path each point is, in world units. */
  points: THREE.Vector3[]
  rig: Rig
  label: HTMLDivElement
  /** Last drawn position, for picking up a new walk where this one is. */
  at: THREE.Vector3
  /** 0 standing, 1 striding: eased so starts and stops don't snap. */
  stride: number
  heading: number
  phase: number
  /** Seconds left on a wave, or 0. */
  wave: number
  /** When the next idle phone check starts, and how long it lasts. */
  fidgetAt: number
  fidget: number
  seed: number
}

const mat = (color: string, shiny = false) =>
  shiny ? new THREE.MeshPhongMaterial({ color, shininess: 90, specular: '#fff3c4' }) : new THREE.MeshLambertMaterial({ color })

/** A box whose origin is the middle of its top face, so it hangs from a joint. */
function hang(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, -h / 2, 0), m)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  return mesh
}

/** A box standing on its bottom face. */
function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), m)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  return mesh
}

const pivot = (x: number, y: number, z: number) => {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  return g
}

/** Same hue, darker: the tie and lapels against the blazer. */
const shade = (color: string, k: number) => '#' + new THREE.Color(color).multiplyScalar(k).getHexString()

/** A figure about half a house tall, standing at the origin, facing +x. */
export function figure(color: string, champion: boolean, key: string): Rig {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const skin = mat(SKIN[hash('skin' + key) % SKIN.length])
  const hairCol = HAIR[hash('hair' + key) % HAIR.length]
  const pants = mat(champion ? '#2a2326' : TROUSERS[hash('pants' + key) % TROUSERS.length])
  const shoe = mat('#17171b', true)
  const blazer = mat(champion ? KIT.BLAZER : color)
  const lapel = mat(champion ? KIT.LAPEL : shade(color, 0.72))
  const shirt = mat('#f4f1ea')
  const tie = mat(champion ? KIT.GOLD : shade(color, 0.45), champion)

  /* Legs: hip → thigh → knee → shin → shoe. */
  const hips: Rig['hips'] = [pivot(0, 0.175, -0.04), pivot(0, 0.175, 0.04)]
  const knees: Rig['knees'] = [pivot(0, -0.088, 0), pivot(0, -0.088, 0)]
  for (let i = 0; i < 2; i++) {
    hips[i].add(hang(0.052, 0.092, 0.05, pants))
    hips[i].add(knees[i])
    knees[i].add(hang(0.046, 0.075, 0.046, pants))
    if (champion) {
      /* Crocodile boots: tall, pointed, scaled. */
      knees[i].add(hang(0.05, 0.06, 0.05, mat(KIT.BOOTS, true), 0.004, -0.03))
      knees[i].add(hang(0.03, 0.015, 0.052, mat(KIT.BOOTS_SCALES), 0, -0.045))
      knees[i].add(hang(0.1, 0.022, 0.054, mat(KIT.BOOTS, true), 0.025, -0.07))
    } else knees[i].add(hang(0.085, 0.022, 0.05, shoe, 0.017, -0.07))
    body.add(hips[i])
  }
  body.add(box(0.075, 0.035, 0.13, pants, 0, 0.162))

  /* Torso pivots at the waist so it can twist against the hips and lean. */
  const torso = pivot(0, 0.19, 0)
  body.add(torso)
  torso.add(box(0.1, 0.16, champion ? 0.17 : 0.15, blazer))
  /* Shirt, tie and lapels on the chest (+x is forward). */
  torso.add(box(0.004, 0.09, 0.05, shirt, 0.051, 0.07))
  torso.add(box(0.006, 0.075, 0.018, tie, 0.054, 0.075))
  torso.add(box(0.006, 0.02, 0.026, tie, 0.054, 0.135))
  for (const side of [-1, 1]) torso.add(box(0.005, 0.085, 0.022, lapel, 0.052, 0.07, side * 0.034))
  if (champion) {
    /* Shoulder pads that could stop a door; gold buttons. */
    torso.add(box(0.11, 0.035, 0.24, mat(KIT.BLAZER_LIGHT), 0, 0.14))
    for (const y of [0.03, 0.055]) torso.add(box(0.006, 0.012, 0.012, mat(KIT.GOLD, true), 0.053, y, 0.022))
  } else torso.add(box(0.098, 0.02, 0.17, blazer, 0, 0.14))

  /* Arms: shoulder → upper arm → elbow → forearm → hand. */
  const span = champion ? 0.115 : 0.1
  const shoulders: Rig['shoulders'] = [pivot(0, 0.15, -span), pivot(0, 0.15, span)]
  const elbows: Rig['elbows'] = [pivot(0, -0.075, 0), pivot(0, -0.075, 0)]
  for (let i = 0; i < 2; i++) {
    shoulders[i].add(hang(0.042, 0.08, 0.042, blazer))
    shoulders[i].add(elbows[i])
    elbows[i].add(hang(0.038, 0.065, 0.038, blazer))
    elbows[i].add(hang(0.04, 0.008, 0.04, shirt, 0, -0.06))
    elbows[i].add(hang(0.032, 0.03, 0.032, skin, 0, -0.066))
    torso.add(shoulders[i])
  }
  /* Every realtor carries the briefcase. The champion has people for that. */
  if (!champion) {
    const bag = mat('#5a3a22')
    elbows[0].add(hang(0.1, 0.075, 0.028, bag, 0.0, -0.09))
    elbows[0].add(hang(0.03, 0.012, 0.01, mat('#d8b46a', true), 0, -0.084))
  } else elbows[1].add(hang(0.042, 0.012, 0.042, mat(KIT.GOLD, true), 0, -0.054))
  /* The phone, out only when they check it. */
  const phone = hang(0.012, 0.045, 0.026, mat('#101014', true), 0.02, -0.075)
  phone.visible = false
  elbows[1].add(phone)

  /* Head on a neck pivot, so it can look around and nod. */
  const head = pivot(0, 0.16, 0)
  torso.add(head)
  head.add(box(0.03, 0.02, 0.03, skin))
  head.add(box(0.09, 0.095, 0.085, skin, 0, 0.016))
  for (const side of [-1, 1]) head.add(box(0.004, 0.014, 0.012, mat('#1b1b20'), 0.046, 0.065, side * 0.02))
  if (champion) {
    /* The haircut: big, sculpted and shiny. */
    const hair = mat(KIT.HAIR, true)
    head.add(box(0.1, 0.05, 0.095, hair, -0.006, 0.09))
    head.add(box(0.085, 0.06, 0.08, hair, 0.016, 0.12))
    head.add(box(0.05, 0.04, 0.06, mat(KIT.HAIR_SHINE, true), 0.04, 0.15))
  } else {
    const hair = mat(hairCol)
    const style = hash('style' + key) % 4
    head.add(box(0.096, 0.025, 0.091, hair, -0.004, 0.105))
    head.add(box(0.03, 0.06, 0.091, hair, -0.034, 0.055))
    if (style === 1) head.add(box(0.05, 0.035, 0.07, hair, 0.022, 0.125)) /* a quiff */
    if (style === 2) head.add(box(0.04, 0.04, 0.04, hair, -0.05, 0.1)) /* a bun */
    if (style === 3) for (const side of [-1, 1]) head.add(box(0.07, 0.08, 0.012, hair, -0.01, 0.035, side * 0.047)) /* long */
  }

  /* A disc in their colour, so you can tell whose agent it is from afar. */
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.15, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }),
  )
  ring.position.y = 0.012
  root.add(ring)
  root.scale.setScalar(1.7)
  return { root, body, torso, head, hips, knees, shoulders, elbows, phone }
}

/** Shortest signed turn from a to b. */
const turn = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a))
const ease = (x: number) => x * x * (3 - 2 * x)

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
        const rig = figure(spec.color, spec.champion, spec.id)
        rig.root.userData.agentId = spec.id
        const label = document.createElement('div')
        label.className = 'res-agent-label' + (spec.you ? ' you' : '') + (spec.champion ? ' champ' : '')
        label.style.setProperty('--agent', spec.color)
        label.textContent = (spec.champion ? '👑 ' : '') + (spec.you ? 'You' : spec.name) + (spec.champion && spec.title ? ' · ' + spec.title : '')
        this.labels.appendChild(label)
        this.group.add(rig.root)
        const r = this.route(spec)
        const seed = (hash('seed' + spec.id) % 1000) / 1000
        w = {
          spec,
          ...r,
          rig,
          label,
          at: r.points[0].clone(),
          stride: 0,
          heading: 0,
          phase: seed * 6,
          wave: 0,
          /* Scheduled on the first frame, from the scene clock. */
          fidgetAt: -1,
          fidget: 0,
          seed,
        }
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

  /** Say hi: they turn to the camera and wave. */
  wave(id: string) {
    const w = this.walkers.get(id)
    if (w) w.wave = 1.8
  }

  private lastT = 0

  /** `cameraAz` is the camera's azimuth, so a wave can face the viewer. */
  update(t: number, cameraAz = 0, now = Date.now()) {
    const dt = this.lastT ? Math.min(0.1, t - this.lastT) : 0
    this.lastT = t
    for (const w of this.walkers.values()) {
      const along = Math.max(0, ((now - w.spec.at) / 1000) * SPEED)
      const last = w.points.length - 1
      const i = Math.min(last, Math.floor(along))
      const f = i >= last ? 0 : along - i
      const a = w.points[i]
      const b = w.points[Math.min(last, i + 1)]
      w.at.lerpVectors(a, b, f)
      const walking = along < last

      /* Ease into and out of the stride; turn smoothly into each new street. */
      w.stride += ((walking ? 1 : 0) - w.stride) * Math.min(1, dt * 7)
      let face = w.heading
      if (walking) {
        const dx = b.x - a.x
        const dz = b.z - a.z
        if (dx || dz) face = Math.atan2(-dz, dx)
      } else if (w.wave > 0) face = Math.atan2(-Math.cos(cameraAz), Math.sin(cameraAz))
      w.heading += turn(w.heading, face) * Math.min(1, dt * 10)
      w.rig.root.rotation.y = w.heading
      if (w.fidgetAt < 0) w.fidgetAt = t + 3 + w.seed * 8
      if (walking) {
        w.fidget = 0
        w.fidgetAt = t + 5 + w.seed * 6
      }
      this.pose(w, t, dt)
      w.rig.root.position.copy(w.at)
    }
  }

  /** Walk cycle, idle life, phone checks and waves, blended by stride. */
  private pose(w: Walker, t: number, dt: number) {
    const r = w.rig
    const s = w.stride
    const champ = w.spec.champion
    /* Cadence follows the ground speed, so feet don't skate. */
    w.phase += dt * (champ ? 10.5 : 11.5) * Math.max(0.15, s)
    const p = w.phase
    const sp = Math.sin(p)
    const cp = Math.cos(p)

    /* Legs: thighs swing, the knee folds as the leg comes through. */
    const reach = (champ ? 0.62 : 0.55) * s
    r.hips[0].rotation.z = sp * reach
    r.hips[1].rotation.z = -sp * reach
    r.knees[0].rotation.z = -(0.04 + 0.85 * Math.max(0, cp)) * s
    r.knees[1].rotation.z = -(0.04 + 0.85 * Math.max(0, -cp)) * s

    /* Body: rises over the planted foot, a lean into the walk, hips sway. */
    const breathe = Math.sin(t * 2.1 + w.seed * 9)
    const bob = (1 - Math.abs(sp)) * (champ ? 0.03 : 0.018) * s
    r.body.position.y = bob - 0.004 * s
    r.body.position.z = Math.sin(t * 0.7 + w.seed * 5) * 0.006 * (1 - s) + cp * 0.008 * s * (champ ? 2 : 1)
    r.body.rotation.x = cp * (champ ? 0.07 : 0.035) * s
    r.torso.rotation.z = -0.09 * s + (champ ? 0.05 : 0) * (1 - s)
    r.torso.rotation.y = sp * 0.16 * s
    r.torso.scale.y = 1 + breathe * 0.012 * (1 - s)

    /* Arms counter-swing; the briefcase hand swings less. */
    const arm = 0.55 * s
    r.shoulders[0].rotation.set(0.06, 0, -sp * arm * 0.6)
    r.shoulders[1].rotation.set(-0.06, 0, -(-sp) * arm)
    r.elbows[0].rotation.set(0, 0, 0.12 * s)
    r.elbows[1].rotation.set(0, 0, (0.2 + 0.35 * Math.max(0, sp)) * s + 0.08)

    /* Head: steady against the twist, and a look around when standing. */
    const look = Math.sin(t * 0.43 + w.seed * 20) * Math.sin(t * 0.17 + w.seed * 3)
    r.head.rotation.set(0, -sp * 0.12 * s + look * 0.7 * (1 - s), 0)

    /* Idle phone check, every so often while standing. */
    if (s < 0.05 && !w.wave && t > w.fidgetAt) {
      w.fidget = 2.6
      w.fidgetAt = t + 7 + w.seed * 9
    }
    if (w.fidget > 0) {
      w.fidget = Math.max(0, w.fidget - dt)
      const k = ease(Math.min(1, Math.min(w.fidget, 2.6 - w.fidget) / 0.35))
      r.shoulders[1].rotation.z += 0.75 * k
      r.shoulders[1].rotation.x += 0.35 * k
      r.elbows[1].rotation.z += 1.5 * k
      r.head.rotation.z = -0.32 * k
      r.head.rotation.y *= 1 - k
      r.phone.visible = k > 0.3
    } else r.phone.visible = false

    /* Wave: right arm up and out, hand going side to side. */
    if (w.wave > 0) {
      w.wave = Math.max(0, w.wave - dt)
      const k = ease(Math.min(1, Math.min(w.wave, 1.8 - w.wave) / 0.25))
      r.shoulders[1].rotation.x = -0.06 - 2.5 * k
      r.shoulders[1].rotation.z = 0.25 * k
      r.elbows[1].rotation.x = (-0.5 + Math.sin(t * 16) * 0.45) * k
      r.elbows[1].rotation.z = 0.15
      r.head.rotation.z = 0.12 * k
      r.head.rotation.x = 0.08 * Math.sin(t * 8) * k
      r.phone.visible = false
      w.fidget = 0
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
    this.group.remove(w.rig.root)
    w.rig.root.traverse((o) => {
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
