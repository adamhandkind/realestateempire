/* Accumulates flat-shaded, vertex-coloured triangles into one BufferGeometry.
   The whole city is a handful of these, so it draws in a few calls. Each
   vertex also carries the index of the lot it belongs to (-1 for none), which
   is how a click on any roof, wall or lawn finds its lot. */

import * as THREE from 'three'

type V3 = [number, number, number]

export class MeshBuilder {
  private pos: number[] = []
  private nor: number[] = []
  private col: number[] = []
  private lot: number[] = []
  private c = new THREE.Color()
  /** Parsing a CSS colour per triangle was most of the build time. */
  private rgb = new Map<string, [number, number, number]>()
  /** Lot index stamped on everything added until it's changed. */
  lotIndex = -1

  private tri(a: V3, b: V3, d: V3, color: string) {
    const ux = b[0] - a[0],
      uy = b[1] - a[1],
      uz = b[2] - a[2]
    const vx = d[0] - a[0],
      vy = d[1] - a[1],
      vz = d[2] - a[2]
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len
    ny /= len
    nz /= len
    let rgb = this.rgb.get(color)
    if (!rgb) {
      this.c.set(color)
      rgb = [this.c.r, this.c.g, this.c.b]
      this.rgb.set(color, rgb)
    }
    for (const p of [a, b, d]) {
      this.pos.push(p[0], p[1], p[2])
      this.nor.push(nx, ny, nz)
      this.col.push(rgb[0], rgb[1], rgb[2])
      this.lot.push(this.lotIndex)
    }
  }

  /** Counter-clockwise when seen from outside. */
  quad(a: V3, b: V3, c: V3, d: V3, color: string) {
    this.tri(a, b, c, color)
    this.tri(a, c, d, color)
  }

  /** Axis-aligned box standing on y0. `top` overrides the roof face colour. */
  box(
    x: number,
    y0: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    top?: string,
    bottom = false,
  ) {
    const x0 = x - w / 2,
      x1 = x + w / 2
    const z0 = z - d / 2,
      z1 = z + d / 2
    const y1 = y0 + h
    this.quad(
      [x0, y1, z1],
      [x1, y1, z1],
      [x1, y1, z0],
      [x0, y1, z0],
      top ?? color,
    )
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color)
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color)
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color)
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color)
    if (bottom)
      this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color)
  }

  /** Four-sided pyramid (hip roof, tent, tower cap) on a w×d base at y0. */
  pyramid(
    x: number,
    y0: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
  ) {
    const x0 = x - w / 2,
      x1 = x + w / 2
    const z0 = z - d / 2,
      z1 = z + d / 2
    const apex: V3 = [x, y0 + h, z]
    this.tri([x0, y0, z1], [x1, y0, z1], apex, color)
    this.tri([x1, y0, z1], [x1, y0, z0], apex, color)
    this.tri([x1, y0, z0], [x0, y0, z0], apex, color)
    this.tri([x0, y0, z0], [x0, y0, z1], apex, color)
  }

  /** Gable roof: a triangular prism whose ridge runs along x (or z). */
  gable(
    x: number,
    y0: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    alongX = true,
    gableEnd = color,
  ) {
    if (!alongX) {
      /* Same shape rotated a quarter turn: swap the axes. */
      const x0 = x - w / 2,
        x1 = x + w / 2,
        z0 = z - d / 2,
        z1 = z + d / 2,
        y1 = y0 + h
      this.quad([x0, y0, z1], [x, y1, z1], [x, y1, z0], [x0, y0, z0], color)
      this.quad([x1, y0, z0], [x, y1, z0], [x, y1, z1], [x1, y0, z1], color)
      this.tri([x0, y0, z1], [x1, y0, z1], [x, y1, z1], gableEnd)
      this.tri([x1, y0, z0], [x0, y0, z0], [x, y1, z0], gableEnd)
      return
    }
    const x0 = x - w / 2,
      x1 = x + w / 2,
      z0 = z - d / 2,
      z1 = z + d / 2,
      y1 = y0 + h
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z], [x0, y1, z], color)
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z], [x1, y1, z], color)
    this.tri([x1, y0, z1], [x1, y0, z0], [x1, y1, z], gableEnd)
    this.tri([x0, y0, z0], [x0, y0, z1], [x0, y1, z], gableEnd)
  }

  /** Low-poly cone (trees). */
  cone(
    x: number,
    y0: number,
    z: number,
    r: number,
    h: number,
    color: string,
    sides = 6,
  ) {
    const apex: V3 = [x, y0 + h, z]
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2
      const b = ((i + 1) / sides) * Math.PI * 2
      this.tri(
        [x + Math.cos(b) * r, y0, z + Math.sin(b) * r],
        [x + Math.cos(a) * r, y0, z + Math.sin(a) * r],
        apex,
        color,
      )
    }
  }

  get empty() {
    return this.pos.length === 0
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setAttribute('lotIndex', new THREE.Float32BufferAttribute(this.lot, 1))
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }
}
