import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Diorama, type View } from '../scene/Diorama'

// The 3D stage: owns the Diorama and lets anything in the app (pins, panels) reach it.

let current: Diorama | null = null
const listeners = new Set<() => void>()
function setCurrent(d: Diorama | null) {
  current = d
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
/** The live 3D scene, or null in the 2D / list views. */
export const useDio = () => useSyncExternalStore(subscribe, () => current)

declare global {
  interface Window {
    __dio?: Diorama
  }
}

export function Stage({ children, onReady }: { children?: ReactNode; onReady?: (d: Diorama) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [dio, setDio] = useState<Diorama | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let d: Diorama
    try {
      d = new Diorama(ref.current!)
    } catch {
      setFailed(true)
      return
    }
    window.__dio = d
    setDio(d)
    setCurrent(d)
    d.ready.then(() => onReady?.(d)).catch(() => setFailed(true))
    return () => {
      setCurrent(null)
      d.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="stage">
      <div className="stage__gl" ref={ref} />
      {failed && <p className="stage__fail">3D isn’t available on this device — switch to the 2D map or the list.</p>}
      <div className="stage__pins">{dio && children}</div>
    </div>
  )
}

export function Anchor({ id, lon, lat, lift, maxDist, minDist, occlude, priority, className = '', children }: { id: string; lon: number; lat: number; lift?: number; maxDist?: number; minDist?: number; occlude?: boolean; priority?: number; className?: string; children: ReactNode }) {
  const dio = useDio()
  const el = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!dio || !el.current) return
    dio.setAnchor(id, { el: el.current, lon, lat, lift, maxDist, minDist, occlude, priority })
    return () => dio.removeAnchor(id)
  }, [dio, id, lon, lat, lift, maxDist, minDist, occlude, priority])
  return (
    <div ref={el} className={`anchor ${className}`} style={{ visibility: 'hidden' }}>
      {children}
    </div>
  )
}

const FOV = 38
/** A camera view that frames a set of points. */
export function viewFor(points: { lon: number; lat: number }[], aspect: number, opts: { tilt?: number; heading?: number; pad?: number; min?: number; /** fraction of the width covered on the left (a side panel) */ left?: number; /** fraction of the height covered at the bottom (a sheet) */ bottom?: number } = {}): View {
  let minX = 180, maxX = -180, minY = 90, maxY = -90
  for (const p of points) {
    minX = Math.min(minX, p.lon)
    maxX = Math.max(maxX, p.lon)
    minY = Math.min(minY, p.lat)
    maxY = Math.max(maxY, p.lat)
  }
  const lat = (minY + maxY) / 2
  const wKm = (maxX - minX) * 111.32 * Math.cos((lat * Math.PI) / 180)
  const hKm = (maxY - minY) * 110.57
  const tilt = opts.tilt ?? 48
  const left = opts.left ?? 0
  const bottom = opts.bottom ?? 0
  const need = Math.max(hKm / Math.cos((tilt * Math.PI) / 180) ** 0.6 / (1 - bottom), wKm / (aspect * (1 - left)))
  const dist = Math.max(opts.min ?? 25, (need * (opts.pad ?? 1.25)) / (2 * Math.tan(((FOV / 2) * Math.PI) / 180)))
  // shift the target west so the route sits in the part of the screen the panel doesn't cover
  const visKm = dist * 2 * Math.tan(((FOV / 2) * Math.PI) / 180) * aspect
  const shiftDeg = (visKm * left * 0.5) / (111.32 * Math.cos((lat * Math.PI) / 180))
  // …and south so it sits above a bottom sheet (screen-up is north)
  const visH = dist * 2 * Math.tan(((FOV / 2) * Math.PI) / 180) / Math.cos((tilt * Math.PI) / 180) ** 0.5
  const shiftLat = (visH * bottom * 0.5) / 110.57
  // the tilted camera looks a little beyond the centre: nudge the target south
  return { lon: (minX + maxX) / 2 - shiftDeg, lat: lat - (maxY - minY) * 0.06 - shiftLat, dist, tilt, heading: opts.heading ?? 0 }
}
