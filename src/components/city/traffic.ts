/* Traffic: little cars driving the straight runs of road (city/paths →
   roadRuns), keeping right, U-turning at the ends, over the bridges and
   back. Headlights and tail lights come on after dark. Two instanced meshes
   and a light mesh; nothing here is game state, and nothing is clickable. */

import * as THREE from 'three'
import type { CityLayout } from '../../city/layout'
import { GROUND_Y, roadRuns, tileAt, type RoadRun } from '../../city/paths'
import { wx, wz } from './cityMesh'

const PAINT = ['#c8372d', '#3f7fa6', '#e9dcc3', '#2f2f36', '#c9a227', '#5a9a48', '#8c8f9e', '#d9772b', '#f0f0f0']
const LANE = 0.2
const MAX_CARS = 46

interface Car {
  run: RoadRun
  /** Position along the run, in tiles from its start tile's centre. */
  s: number
  dir: 1 | -1
  speed: number
}

export class Traffic {
  readonly group = new THREE.Group()
  private cars: Car[] = []
  private body: THREE.InstancedMesh
  private cabin: THREE.InstancedMesh
  private lamps: THREE.InstancedMesh
  private lampMat: THREE.MeshBasicMaterial
  private city: CityLayout

  constructor(city: CityLayout) {
    this.city = city
    const runs = roadRuns(city)
    /* Longer roads get more cars. Seeded by position so it's the same city
       every visit, if not the same traffic. */
    for (const run of runs) {
      const len = run.to - run.from + 1
      const n = Math.max(1, Math.round(len / 11))
      for (let i = 0; i < n && this.cars.length < MAX_CARS; i++)
        this.cars.push({ run, s: Math.random() * (len - 1), dir: Math.random() < 0.5 ? 1 : -1, speed: 1.1 + Math.random() * 0.9 })
    }
    const n = this.cars.length
    this.body = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.09, 0.15).translate(0, 0.075, 0), new THREE.MeshLambertMaterial(), n)
    this.cabin = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.07, 0.13).translate(-0.02, 0.15, 0), new THREE.MeshLambertMaterial({ color: '#2b3340' }), n)
    this.lampMat = new THREE.MeshBasicMaterial({ transparent: true })
    this.lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.03, 0.12).translate(0, 0.08, 0), this.lampMat, n * 2)
    const c = new THREE.Color()
    for (let i = 0; i < n; i++) {
      this.body.setColorAt(i, c.set(PAINT[i % PAINT.length]))
      this.lamps.setColorAt(i * 2, c.set('#fff2b0'))
      this.lamps.setColorAt(i * 2 + 1, c.set('#ff3a2a'))
    }
    this.body.castShadow = true
    for (const m of [this.body, this.cabin, this.lamps]) {
      m.frustumCulled = false
      this.group.add(m)
    }
  }

  private m4 = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private p = new THREE.Vector3()
  private one = new THREE.Vector3(1, 1, 1)
  private up = new THREE.Vector3(0, 1, 0)

  private groundAt(col: number, row: number) {
    const t = tileAt(this.city, Math.round(col), Math.round(row))
    return t ? GROUND_Y[t.kind] : 0
  }

  update(dt: number, day: number) {
    const step = Math.min(dt, 0.1)
    this.cars.forEach((car, i) => {
      const len = car.run.to - car.run.from
      car.s += car.dir * car.speed * step
      if (car.s > len) {
        car.s = len
        car.dir = -1
      } else if (car.s < 0) {
        car.s = 0
        car.dir = 1
      }
      const along = car.run.from + car.s
      const row = car.run.along === 'row'
      const col = row ? along : car.run.at
      const r = row ? car.run.at : along
      /* Facing +x, keep-right is +z; facing +z, keep-right is −x. */
      const x = wx(col) + (row ? 0 : -LANE * car.dir)
      const z = wz(r) + (row ? LANE * car.dir : 0)
      /* Up the bridge ramps rather than teleporting onto the deck. */
      const a = this.groundAt(Math.floor(col), Math.floor(r))
      const b = this.groundAt(Math.ceil(col), Math.ceil(r))
      const y = a + (b - a) * (along - Math.floor(along))
      const yaw = row ? (car.dir > 0 ? 0 : Math.PI) : car.dir > 0 ? -Math.PI / 2 : Math.PI / 2
      this.q.setFromAxisAngle(this.up, yaw)
      this.p.set(x, y, z)
      this.m4.compose(this.p, this.q, this.one)
      this.body.setMatrixAt(i, this.m4)
      this.cabin.setMatrixAt(i, this.m4)
      /* Front and back lights, ±0.155 along the car's own x. */
      for (const [k, off] of [
        [0, 0.155],
        [1, -0.155],
      ] as const) {
        this.p.set(x + Math.cos(yaw) * off, y, z - Math.sin(yaw) * off)
        this.lamps.setMatrixAt(i * 2 + k, this.m4.compose(this.p, this.q, this.one))
      }
    })
    this.body.instanceMatrix.needsUpdate = true
    this.cabin.instanceMatrix.needsUpdate = true
    this.lamps.instanceMatrix.needsUpdate = true
    this.lampMat.opacity = Math.max(0, Math.min(1, (0.75 - day) * 2))
    this.lamps.visible = this.lampMat.opacity > 0.02
  }

  dispose() {
    for (const m of [this.body, this.cabin, this.lamps]) {
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
  }
}
