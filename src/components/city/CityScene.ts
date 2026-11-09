/* The isometric city: one three.js scene, a fixed-angle orthographic camera
   that pans, zooms and turns in 90° steps, and picking that maps any click to
   a lot. Framework-free on purpose — CityView.tsx owns its lifecycle and feeds
   it data; this file only draws and reports what was clicked. */

import * as THREE from 'three'
import { COLS, ROWS, cityLayout as cityLayoutOf, type CityLayout } from '../../city/layout'
import type { LotUse } from '../../city/occupancy'
import type { Season } from '../../city/season'
import { DISTRICTS } from '../../data/districts'
import {
  buildCityGeometry,
  clientMarkers,
  WATER_Y,
  type Marker,
} from './cityMesh'
import { BRASS_LIGHT, CLIENT, MARBLE, PALETTES } from './palette'
import { daylightFor, type Daylight, type TimeMode } from '../../city/daylight'
import type { Tile } from '../../city/paths'
import { AgentLayer, type AgentSpec } from './agents'
import { Traffic } from './traffic'
import { Weather } from './weather'

/** True isometric: the camera looks down 35.264° (atan(1/√2)). */
const ELEVATION = Math.atan(1 / Math.SQRT2)
const DISTANCE = 80
const MIN_ZOOM = 0.5
const MAX_ZOOM = 4.5
const DRAG_THRESHOLD = 5

export interface SceneCallbacks {
  onSelect: (lotId: string | null) => void
  onHover: (lotId: string | null) => void
  /** Any click on the ground (a lot, a road, a park): where to walk. */
  onGround?: (tile: Tile) => void
}

export interface SceneData {
  city: CityLayout
  uses: Map<string, LotUse>
  season: Season
  priceMultOf: (districtId: string) => number
}

export class CityScene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.OrthographicCamera
  private cityMesh: THREE.Mesh | null = null
  private glowMesh: THREE.Mesh
  private glowMat: THREE.MeshLambertMaterial
  private lightsMesh: THREE.Mesh | null = null
  private lightsMat = new THREE.MeshBasicMaterial({ vertexColors: true })
  private hemi: THREE.HemisphereLight
  private sun: THREE.DirectionalLight
  private weather: Weather | null = null
  private weatherSeason: Season | null = null
  private weatherOn = true
  private traffic: Traffic | null = null
  readonly agents: AgentLayer
  private follow: string | null = null
  private timeMode: TimeMode = 'auto'
  private light: Daylight = { day: 1, golden: 0, arc: 0.5 }
  private lightCheckedAt = -Infinity
  private lastT = 0
  private water: THREE.Mesh
  private markerMeshes: THREE.InstancedMesh[] = []
  private heights: number[] = []
  private cityMarkers: Marker[] = []
  private clientLots: string[] = []
  private hoverBox: THREE.LineSegments
  private selectBox: THREE.LineSegments
  private labels: { el: HTMLDivElement; pos: THREE.Vector3 }[] = []
  private raycaster = new THREE.Raycaster()
  private ndc = new THREE.Vector2()
  private data: SceneData | null = null
  private frame = 0
  private disposed = false
  private resizeObs: ResizeObserver

  /* camera state: where it looks, which quarter-turn, how close */
  private target = new THREE.Vector3(0, 0, 0)
  private goalTarget = new THREE.Vector3(0, 0, 0)
  private azimuth = Math.PI / 4
  private goalAzimuth = Math.PI / 4
  private zoom = 1
  private goalZoom = 1
  private fitted = false

  private drag: { x: number; y: number; moved: boolean; id: number } | null =
    null
  private hoverLot: string | null = null
  private selectedLot: string | null = null
  private pendingHover: { x: number; y: number } | null = null

  private host: HTMLElement
  private cb: SceneCallbacks

  constructor(host: HTMLElement, labelLayer: HTMLElement, cb: SceneCallbacks) {
    this.host = host
    this.cb = cb
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.domElement.className = 'res-city-canvas'
    host.appendChild(this.renderer.domElement)

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400)

    const hemi = (this.hemi = new THREE.HemisphereLight('#fff6e6', '#5a4a3a', 1.6))
    this.scene.add(hemi)
    const sun = (this.sun = new THREE.DirectionalLight('#ffe8c2', 2.2))
    sun.position.set(-18, 30, 12)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const sc = sun.shadow.camera
    sc.left = -28
    sc.right = 28
    sc.top = 22
    sc.bottom = -22
    sc.near = 1
    sc.far = 90
    sun.shadow.bias = -0.0008
    sun.shadow.normalBias = 0.02
    this.scene.add(sun, sun.target)

    /* Windows and lamp heads: the same flat colours by day, lit at night. */
    this.glowMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#ffc46b', emissiveIntensity: 0 })
    this.glowMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.glowMat)
    this.scene.add(this.glowMesh)

    this.agents = new AgentLayer(cityLayoutOf(), labelLayer)
    this.scene.add(this.agents.group)
    /* Traffic and weather are motion for its own sake; respect the setting. */
    const calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.weatherOn = !calm

    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(COLS, ROWS),
      new THREE.MeshLambertMaterial({ color: '#2f86b8' }),
    )
    this.water.rotation.x = -Math.PI / 2
    this.water.position.y = WATER_Y
    this.water.receiveShadow = true
    this.scene.add(this.water)

    this.hoverBox = outlineBox(MARBLE, 0.7)
    this.selectBox = outlineBox(BRASS_LIGHT, 1)
    this.scene.add(this.hoverBox, this.selectBox)

    for (const d of DISTRICTS) {
      const el = document.createElement('div')
      el.className = 'res-city-label'
      el.textContent = d.name
      labelLayer.appendChild(el)
      /* labelPos is in the 1000x700 map; one tile is 25 map units. */
      this.labels.push({
        el,
        pos: new THREE.Vector3(
          d.labelPos.x / 25 - COLS / 2,
          1.2,
          d.labelPos.y / 25 - ROWS / 2,
        ),
      })
    }

    const c = this.renderer.domElement
    c.addEventListener('pointerdown', this.onDown)
    c.addEventListener('pointermove', this.onMove)
    c.addEventListener('pointerup', this.onUp)
    c.addEventListener('pointerleave', this.onLeave)
    c.addEventListener('wheel', this.onWheel, { passive: false })
    c.addEventListener('contextmenu', (e) => e.preventDefault())

    this.resizeObs = new ResizeObserver(() => this.resize())
    this.resizeObs.observe(host)
    this.resize()
    this.loop()
  }

  /* ------------------------------------------------------------ data in */

  /** Rebuilds the city. Call when what's built on the lots changes. */
  setData(data: SceneData) {
    this.data = data
    if (!this.traffic) {
      this.traffic = new Traffic(data.city)
      this.scene.add(this.traffic.group)
    }
    if (this.weatherSeason !== data.season) this.setWeather(data.season)
    this.lightCheckedAt = -Infinity

    const geo = buildCityGeometry(
      data.city,
      data.uses,
      data.season,
      data.priceMultOf,
    )
    if (this.cityMesh) {
      this.cityMesh.geometry.dispose()
      this.cityMesh.geometry = geo.main
    } else {
      this.cityMesh = new THREE.Mesh(
        geo.main,
        new THREE.MeshLambertMaterial({ vertexColors: true }),
      )
      this.cityMesh.castShadow = true
      this.cityMesh.receiveShadow = true
      this.scene.add(this.cityMesh)
    }
    this.glowMesh.geometry.dispose()
    this.glowMesh.geometry = geo.glow
    if (this.lightsMesh) {
      this.scene.remove(this.lightsMesh)
      this.lightsMesh.geometry.dispose()
      this.lightsMesh = null
    }
    if (geo.lights) {
      this.lightsMesh = new THREE.Mesh(geo.lights, this.lightsMat)
      this.scene.add(this.lightsMesh)
    }
    this.heights = geo.heights
    this.cityMarkers = geo.markers
    this.setMarkers()
    this.placeBox(this.hoverBox, this.hoverLot)
    this.placeBox(this.selectBox, this.selectedLot)
  }

  private setWeather(season: Season) {
    if (this.weather) {
      this.scene.remove(this.weather.points)
      this.weather.dispose()
      this.weather = null
    }
    this.weatherSeason = season
    if (!this.weatherOn) return
    this.weather = new Weather(season)
    this.scene.add(this.weather.points)
  }

  /** Snow, leaves and petals on or off. */
  setWeatherOn(on: boolean) {
    this.weatherOn = on
    if (this.weatherSeason) this.setWeather(this.weatherSeason)
  }

  /** Auto follows the viewer's clock; day and night pin it. */
  setTimeMode(mode: TimeMode) {
    this.timeMode = mode
    this.lightCheckedAt = -Infinity
  }

  /** The agents on the map. `follow` keeps the camera on one as it walks. */
  setAgents(specs: AgentSpec[]) {
    this.agents.setAgents(specs)
  }

  followAgent(id: string | null) {
    this.follow = id
    if (id) this.goalZoom = Math.max(this.goalZoom, 2)
  }

  /** Just the client markers — cheap, so leads can change every click. */
  setClients(lotIds: Iterable<string>) {
    this.clientLots = [...lotIds]
    this.setMarkers()
  }

  setSelected(lotId: string | null) {
    this.selectedLot = lotId
    this.placeBox(this.selectBox, lotId)
  }

  /** Glide the camera to a lot. */
  focusLot(lotId: string) {
    const lot = this.data?.city.lotById.get(lotId)
    if (!lot) return
    this.goalTarget.set(lot.col - COLS / 2 + 0.5, 0, lot.row - ROWS / 2 + 0.5)
    this.goalZoom = Math.max(this.goalZoom, 2.2)
  }

  /* ------------------------------------------------------- camera input */

  rotate(steps: number) {
    this.goalAzimuth += (steps * Math.PI) / 2
  }

  zoomBy(f: number) {
    this.goalZoom = clamp(this.goalZoom * f, MIN_ZOOM, MAX_ZOOM)
  }

  resetView() {
    this.follow = null
    this.goalTarget.set(0, 0, 0)
    this.goalZoom = this.fitZoom()
  }

  /** The zoom at which the whole city fits the stage, whichever way it faces. */
  private fitZoom() {
    const w = this.camera.right - this.camera.left
    const h = this.camera.top - this.camera.bottom
    /* A quarter-turned rectangle's footprint is the same at every 45° step. */
    const across = (COLS + ROWS) / Math.SQRT2
    const deep = across * Math.sin(ELEVATION) + 1.5
    return clamp(Math.min(w / (across + 1), h / deep), MIN_ZOOM, MAX_ZOOM)
  }

  /** Pan by a screen-space amount, in world units at the current zoom. */
  pan(dxWorld: number, dzWorld: number) {
    this.follow = null
    /* Screen right and screen "up" projected onto the ground plane. */
    const right = new THREE.Vector3(
      Math.cos(this.azimuth),
      0,
      -Math.sin(this.azimuth),
    )
    const fwd = new THREE.Vector3(
      -Math.sin(this.azimuth),
      0,
      -Math.cos(this.azimuth),
    )
    this.goalTarget
      .addScaledVector(right, dxWorld)
      .addScaledVector(fwd, dzWorld)
    this.goalTarget.x = clamp(this.goalTarget.x, -COLS / 2, COLS / 2)
    this.goalTarget.z = clamp(this.goalTarget.z, -ROWS / 2, ROWS / 2)
  }

  /** How many world units one screen pixel spans right now. */
  private worldPerPixel() {
    const h = this.host.clientHeight || 1
    return (this.camera.top - this.camera.bottom) / this.camera.zoom / h
  }

  private onDown = (e: PointerEvent) => {
    this.drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId }
    this.renderer.domElement.setPointerCapture(e.pointerId)
  }

  private onMove = (e: PointerEvent) => {
    if (this.drag) {
      const dx = e.clientX - this.drag.x
      const dy = e.clientY - this.drag.y
      if (!this.drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD)
        this.drag.moved = true
      if (this.drag.moved) {
        const k = this.worldPerPixel()
        /* Ground is foreshortened vertically by sin(elevation). */
        this.pan(-dx * k, (dy * k) / Math.sin(ELEVATION))
        /* Drag pans immediately, without easing, so the map sticks to the hand. */
        this.target.copy(this.goalTarget)
        this.drag.x = e.clientX
        this.drag.y = e.clientY
        this.renderer.domElement.style.cursor = 'grabbing'
        return
      }
    }
    this.pendingHover = { x: e.clientX, y: e.clientY }
  }

  private onUp = (e: PointerEvent) => {
    const d = this.drag
    this.drag = null
    this.renderer.domElement.style.cursor = ''
    if (!d || d.moved) return
    const lot = this.pick(e.clientX, e.clientY)
    this.cb.onSelect(lot)
    const tile = this.groundTile(e.clientX, e.clientY)
    if (tile) this.cb.onGround?.(tile)
  }

  private onLeave = () => {
    this.pendingHover = null
    this.setHover(null)
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    this.zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15)
  }

  /** Keyboard controls; the host element forwards its keydown here. */
  handleKey(e: KeyboardEvent): boolean {
    const step = 2.5 / this.goalZoom
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.pan(-step, 0)
        return true
      case 'ArrowRight':
      case 'd':
      case 'D':
        this.pan(step, 0)
        return true
      case 'ArrowUp':
      case 'w':
      case 'W':
        this.pan(0, step)
        return true
      case 'ArrowDown':
      case 's':
      case 'S':
        this.pan(0, -step)
        return true
      case 'q':
      case 'Q':
        this.rotate(-1)
        return true
      case 'e':
      case 'E':
        this.rotate(1)
        return true
      case '+':
      case '=':
        this.zoomBy(1.25)
        return true
      case '-':
      case '_':
        this.zoomBy(0.8)
        return true
      case '0':
        this.resetView()
        return true
    }
    return false
  }

  /* ------------------------------------------------------------ picking */

  private pick(clientX: number, clientY: number): string | null {
    if (!this.cityMesh || !this.data) return null
    const r = this.renderer.domElement.getBoundingClientRect()
    this.ndc.set(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.ndc, this.camera)
    /* The floating markers are the most obvious thing to click; they win. */
    const mark = this.raycaster.intersectObjects(this.markerMeshes, false)[0]
    if (mark && mark.instanceId !== undefined) {
      const list = (mark.object as THREE.InstancedMesh).userData
        .list as Marker[]
      return list[mark.instanceId]?.lotId ?? null
    }
    const hit = this.raycaster.intersectObject(this.cityMesh, false)[0]
    if (!hit?.face) return null
    const idx = (
      this.cityMesh.geometry.getAttribute('lotIndex') as THREE.BufferAttribute
    ).getX(hit.face.a)
    return idx >= 0 ? (this.data.city.lots[idx]?.id ?? null) : null
  }

  /** The tile under the pointer, wherever it lands on the ground plane. */
  private groundTile(clientX: number, clientY: number): Tile | null {
    const lotId = this.pick(clientX, clientY)
    const lot = lotId ? this.data?.city.lotById.get(lotId) : undefined
    if (lot) return [lot.col, lot.row]
    const r = this.renderer.domElement.getBoundingClientRect()
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, this.camera)
    const hit = new THREE.Vector3()
    if (!this.raycaster.ray.intersectPlane(GROUND, hit)) return null
    const col = Math.floor(hit.x + COLS / 2)
    const row = Math.floor(hit.z + ROWS / 2)
    return col >= 0 && row >= 0 && col < COLS && row < ROWS ? [col, row] : null
  }

  private setHover(lotId: string | null) {
    if (lotId === this.hoverLot) return
    this.hoverLot = lotId
    this.placeBox(this.hoverBox, lotId)
    this.renderer.domElement.style.cursor = lotId ? 'pointer' : ''
    this.cb.onHover(lotId)
  }

  private placeBox(box: THREE.LineSegments, lotId: string | null) {
    const lot = lotId ? this.data?.city.lotById.get(lotId) : undefined
    if (!lot || !this.data) {
      box.visible = false
      return
    }
    const idx = this.data.city.lots.indexOf(lot)
    const h = Math.max(0.2, this.heights[idx] ?? 0.3)
    box.visible = true
    box.position.set(lot.col - COLS / 2 + 0.5, 0, lot.row - ROWS / 2 + 0.5)
    box.scale.set(0.96, h + 0.04, 0.96)
  }

  /* ------------------------------------------------------------ markers */

  private setMarkers() {
    if (!this.data) return
    const markers = [
      ...this.cityMarkers,
      ...clientMarkers(this.data.city, this.heights, this.clientLots),
    ]
    for (const m of this.markerMeshes) {
      this.scene.remove(m)
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
    this.markerMeshes = []
    const kinds: [Marker['kind'], string, number][] = [
      ['listing', MARBLE, 0.16],
      ['owned', BRASS_LIGHT, 0.13],
      ['lead', CLIENT, 0.15],
    ]
    for (const [kind, color, size] of kinds) {
      const list = markers.filter((m) => m.kind === kind)
      if (!list.length) continue
      const mesh = new THREE.InstancedMesh(
        new THREE.OctahedronGeometry(size),
        new THREE.MeshBasicMaterial({ color }),
        list.length,
      )
      mesh.userData.list = list
      this.markerMeshes.push(mesh)
      this.scene.add(mesh)
    }
  }

  private animateMarkers(t: number) {
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    /* Markers stay readable when the whole city is in view. */
    const k = Math.max(1, 1.8 / this.zoom)
    const s = new THREE.Vector3(k, 1.4 * k, k)
    const p = new THREE.Vector3()
    for (const mesh of this.markerMeshes) {
      const list = mesh.userData.list as Marker[]
      list.forEach((mk, i) => {
        const phase = (mk.x * 1.7 + mk.z * 0.9) % (Math.PI * 2)
        p.set(
          mk.x,
          mk.y + (k - 1) * 0.25 + Math.sin(t * 2.2 + phase) * 0.08,
          mk.z,
        )
        q.setFromAxisAngle(UP, t * 1.4 + phase)
        mesh.setMatrixAt(i, m4.compose(p, q, s))
      })
      mesh.instanceMatrix.needsUpdate = true
      /* They move every frame; let the raycaster recompute their bounds. */
      mesh.boundingSphere = null
    }
  }

  /* --------------------------------------------------------------- loop */

  private resize() {
    const w = this.host.clientWidth || 1
    const h = this.host.clientHeight || 1
    this.renderer.setSize(w, h, false)
    const view = 22
    const aspect = w / h
    this.camera.left = (-view * aspect) / 2
    this.camera.right = (view * aspect) / 2
    this.camera.top = view / 2
    this.camera.bottom = -view / 2
    this.camera.updateProjectionMatrix()
    if (!this.fitted && this.host.clientWidth > 0) {
      this.fitted = true
      this.zoom = this.goalZoom = this.fitZoom()
    }
  }

  private loop = () => {
    if (this.disposed) return
    this.frame = requestAnimationFrame(this.loop)
    const t = performance.now() / 1000
    const dt = this.lastT ? t - this.lastT : 0
    this.lastT = t

    if (t - this.lightCheckedAt > 1) {
      this.lightCheckedAt = t
      if (this.data) this.light = daylightFor(this.timeMode, new Date(), this.data.season)
    }
    this.applyLight(t)
    this.agents.update(t)
    if (this.follow) {
      const p = this.agents.positionOf(this.follow)
      if (p) this.goalTarget.set(p.x, 0, p.z)
    }
    this.traffic?.update(dt, this.light.day)
    this.weather?.update(t, dt, this.light.day, this.zoom, this.renderer.getPixelRatio())

    /* Ease toward the goals; a quarter turn takes about a third of a second. */
    this.azimuth += (this.goalAzimuth - this.azimuth) * 0.16
    this.zoom += (this.goalZoom - this.zoom) * 0.18
    this.target.lerp(this.goalTarget, 0.16)

    const cam = this.camera
    cam.position.set(
      this.target.x + DISTANCE * Math.cos(ELEVATION) * Math.sin(this.azimuth),
      this.target.y + DISTANCE * Math.sin(ELEVATION),
      this.target.z + DISTANCE * Math.cos(ELEVATION) * Math.cos(this.azimuth),
    )
    cam.lookAt(this.target)
    cam.zoom = this.zoom
    cam.updateProjectionMatrix()

    if (this.pendingHover && !this.drag) {
      this.setHover(this.pick(this.pendingHover.x, this.pendingHover.y))
      this.pendingHover = null
    }
    this.animateMarkers(t)
    this.renderer.render(this.scene, cam)
    this.positionLabels()
    this.agents.positionLabels(cam, this.host.clientWidth, this.host.clientHeight, this.zoom)
  }

  private col = new THREE.Color()
  /** Day, golden hour or night, from this.light. Cheap enough per frame. */
  private applyLight(t: number) {
    if (!this.data) return
    const { day, golden, arc } = this.light
    const pal = PALETTES[this.data.season]
    const night = 1 - day
    const c = this.col
    const mix = (dayHex: string, goldHex: string, nightHex: string, out: THREE.Color) =>
      out.set(dayHex).lerp(c.set(goldHex), golden * day * 0.8).lerp(c.set(nightHex), night)
    mix('#fff6e6', '#ffd9b0', '#7f95c9', this.hemi.color)
    mix('#5a4a3a', '#5a3f2e', '#1d2233', this.hemi.groundColor)
    this.hemi.intensity = 1.6 - 0.75 * night - 0.25 * golden * day
    mix('#ffe8c2', '#ffa860', '#a8bfff', this.sun.color)
    this.sun.intensity = 2.2 * day + 0.6 * night - 0.4 * golden * day
    /* The sun crosses the sky by day; the moon sits high at night. */
    if (day > 0.05) this.sun.position.set(-26 + 52 * arc, 9 + 24 * Math.sin(Math.PI * arc), 12)
    else this.sun.position.set(-10, 30, -14)
    const bg = (this.scene.background as THREE.Color | null) ?? new THREE.Color()
    this.scene.background = bg.set(pal.sky).lerp(c.set('#0b0d16'), night * 0.5)
    ;(this.water.material as THREE.MeshLambertMaterial).color.set(pal.water).lerp(c.set('#1b2c44'), night * 0.6)
    this.glowMat.emissiveIntensity = night * 0.8
    /* Holiday lights: always on, brighter after dark, and they twinkle. */
    const tw = 0.85 + 0.15 * Math.sin(t * 2.3)
    this.lightsMat.color.setScalar((0.6 + 0.4 * night) * tw)
  }

  private positionLabels() {
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    const v = new THREE.Vector3()
    const show = this.zoom < 2.6
    for (const l of this.labels) {
      v.copy(l.pos).project(this.camera)
      const x = (v.x * 0.5 + 0.5) * w
      const y = (-v.y * 0.5 + 0.5) * h
      l.el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
      l.el.style.opacity = show ? '1' : '0'
    }
  }

  dispose() {
    this.disposed = true
    this.agents.dispose()
    this.traffic?.dispose()
    this.weather?.dispose()
    cancelAnimationFrame(this.frame)
    this.resizeObs.disconnect()
    for (const l of this.labels) l.el.remove()
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
      else mat?.dispose()
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}

const UP = new THREE.Vector3(0, 1, 0)
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v))

/** A unit-footprint box outline standing on the ground, scaled per lot. */
function outlineBox(color: string, opacity: number): THREE.LineSegments {
  const g = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  )
  const box = new THREE.LineSegments(
    g,
    new THREE.LineBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      depthTest: false,
    }),
  )
  box.renderOrder = 10
  box.visible = false
  return box
}

/** WebGL available at all? Checked before mounting so we can fall back. */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}
