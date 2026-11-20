/* The board on a phone. It opens zoomed in on the spots you can pick, and
   you can pinch to zoom and drag to look around. A drag never counts as a
   tap, so looking around can't pick a spot by accident. */

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import type { BoardView } from '../../board/types'
import BoardSvg, { type Clickable, type Ghost } from '../board/BoardSvg'
import { BOARD_BOX, spotXY } from '../board/frame'

type Frame = [number, number, number, number]

const [BX, BY, BW, BH] = BOARD_BOX
const ASPECT = BW / BH
const MIN_W = BW * 0.3

/** Keeps a frame the board's shape, no smaller than MIN_W, and on the board. */
function clamp(f: Frame): Frame {
  const w = Math.min(BW, Math.max(MIN_W, f[2]))
  const h = w / ASPECT
  const x = Math.min(BX + BW - w, Math.max(BX, f[0]))
  const y = Math.min(BY + BH - h, Math.max(BY, f[1]))
  return [x, y, w, h]
}

/** A frame around these spots, with room to spare. */
function frameAround(spots: [number, number][]): Frame {
  if (spots.length === 0) return [...BOARD_BOX]
  const xs = spots.map((p) => p[0])
  const ys = spots.map((p) => p[1])
  const pad = 70
  let x0 = Math.min(...xs) - pad
  let x1 = Math.max(...xs) + pad
  let y0 = Math.min(...ys) - pad
  let y1 = Math.max(...ys) + pad
  /* Grow the short side to the board's shape, around the middle. */
  const w = Math.max(x1 - x0, (y1 - y0) * ASPECT, BW * 0.5)
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  x0 = cx - w / 2
  x1 = cx + w / 2
  y0 = cy - w / ASPECT / 2
  y1 = cy + w / ASPECT / 2
  return clamp([x0, y0, x1 - x0, y1 - y0])
}

function clickSpots(c: Clickable): [number, number][] {
  return [
    ...(c.vertices ?? []).map((v) => spotXY('vertex', v)),
    ...(c.edges ?? []).map((e) => spotXY('edge', e)),
    ...(c.tiles ?? []).map((t) => spotXY('tile', t)),
  ]
}

export default function PhoneBoard({
  view,
  click,
  ghost,
  focusKey,
}: {
  view: BoardView
  click: Clickable
  ghost?: Ghost | null
  /** When this changes, the view re-frames around the clickable spots. */
  focusKey: string
}) {
  const [frame, setFrame] = useState<Frame>(() => frameAround(clickSpots(click)))
  const box = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ frame: Frame; dist: number; mid: { x: number; y: number }; moved: boolean } | null>(null)
  const swallow = useRef(false)

  /* Re-frame when what you're choosing changes, not on every board change. */
  const clickRef = useRef(click)
  clickRef.current = click
  useEffect(() => {
    setFrame(frameAround(clickSpots(clickRef.current)))
  }, [focusKey])

  const summary = () => {
    const ps = [...pointers.current.values()]
    const mid = { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length }
    const dist = ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0
    return { mid, dist }
  }
  const restart = () => {
    if (pointers.current.size === 0) return (gesture.current = null)
    const { mid, dist } = summary()
    gesture.current = { frame, dist, mid, moved: gesture.current?.moved ?? false }
  }

  const down = (e: RPointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) swallow.current = false
    restart()
  }
  const move = (e: RPointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current || !box.current) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    const { mid, dist } = summary()
    const dx = mid.x - g.mid.x
    const dy = mid.y - g.mid.y
    if (!g.moved && Math.hypot(dx, dy) < 8 && (g.dist === 0 || Math.abs(dist - g.dist) < 8)) return
    if (!g.moved) {
      g.moved = true
      swallow.current = true
      /* Keep the gesture even if the finger slides off a spot. */
      try {
        box.current.setPointerCapture(e.pointerId)
      } catch {
        /* fine */
      }
    }
    const rect = box.current.getBoundingClientRect()
    let [x, y, w] = g.frame
    if (g.dist > 0 && dist > 0) {
      /* Zoom around the point between the fingers. */
      const nw = Math.min(BW, Math.max(MIN_W, (w * g.dist) / dist))
      const fx = (g.mid.x - rect.left) / rect.width
      const fy = (g.mid.y - rect.top) / rect.height
      x += (w - nw) * fx
      y += ((w - nw) / ASPECT) * fy
      w = nw
    }
    setFrame(clamp([x - dx * (w / rect.width), y - dy * (w / rect.width), w, w / ASPECT]))
  }
  const up = (e: RPointerEvent) => {
    pointers.current.delete(e.pointerId)
    restart()
  }

  const zoom = (k: number) =>
    setFrame((f) => {
      const nw = f[2] * k
      return clamp([f[0] + (f[2] - nw) / 2, f[1] + (f[3] - nw / ASPECT) / 2, nw, nw / ASPECT])
    })

  return (
    <div className="pt-pboard">
      <div
        ref={box}
        className="pt-pboard-box"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={(e) => {
          if (swallow.current) {
            e.stopPropagation()
            swallow.current = false
          }
        }}
      >
        <BoardSvg view={view} click={click} ghost={ghost} touch frame={frame} />
      </div>
      <div className="pt-zoom">
        <button type="button" aria-label="Zoom in" onClick={() => zoom(0.7)}>
          +
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoom(1 / 0.7)}>
          −
        </button>
        <button type="button" aria-label="Show the whole board" onClick={() => setFrame([...BOARD_BOX])}>
          ⤢
        </button>
      </div>
    </div>
  )
}
