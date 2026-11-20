/* A QR code as crisp SVG, for the TV lobby. Dark modules on a light
   card: phone cameras want contrast, whatever the theme around it. */

import qrcode from 'qrcode-generator'
import { useMemo } from 'react'

export default function Qr({ text, label }: { text: string; label: string }) {
  const { size, path } = useMemo(() => {
    const q = qrcode(0, 'M')
    q.addData(text)
    q.make()
    const n = q.getModuleCount()
    let d = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c},${r}h1v1h-1z`
    return { size: n, path: d }
  }, [text])
  const m = 2
  return (
    <svg className="pt-qr" viewBox={`${-m} ${-m} ${size + m * 2} ${size + m * 2}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect x={-m} y={-m} width={size + m * 2} height={size + m * 2} fill="#fff" rx={1.5} />
      <path d={path} fill="#14161f" />
    </svg>
  )
}
