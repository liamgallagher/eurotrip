import { useEffect, useRef } from 'react'
import { Diorama } from './scene/Diorama'
import { buildPlan } from '../lib/plan'
import { DEFAULT_STATE } from '../lib/state'
import { loadLeg } from '../lib/runtime'
import { localDate } from './scene/sun'

declare global {
  interface Window { __dio?: Diorama }
}

export default function App() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const d = new Diorama(ref.current!)
    window.__dio = d
    const q = new URLSearchParams(location.search)
    const v = q.get('view')?.split(',').map(Number)
    if (v) d.setView({ lon: v[0], lat: v[1], dist: v[2], tilt: v[3], heading: v[4] })
    else d.setView({ lon: 7.2, lat: 48.2, dist: 2300, tilt: 38, heading: 0 })
    const t = q.get('t')
    d.ready.then(async () => {
      d.setSun(localDate('2027-05-10', t ? Number(t) : 19 * 60 + 15), { lon: 10, lat: 47 })
      const plan = buildPlan(DEFAULT_STATE)
      const tracks = []
      let off = 0
      for (const day of plan.days) {
        const pts: { lon: number; lat: number; ele: number; km: number }[] = []
        for (const s of day.segments) {
          if (s.kind !== 'drive') continue
          const { leg } = await loadLeg(s.key, s.waypoints)
          const base = pts.length ? pts[pts.length - 1].km : 0
          for (const x of leg.samples) pts.push({ lon: x.lon, lat: x.lat, ele: x.ele, km: x.km + base })
        }
        if (pts.length < 2) continue
        tracks.push({ id: `d${day.n}`, points: pts, color: day.dir === 'out' ? '#ffb45e' : '#5ee0ff', kmOffset: off, width: 4 })
        off += pts[pts.length - 1].km
      }
      d.setTracks(tracks)
      ;(document.body.dataset as DOMStringMap).ready = '1'
    })
    return () => d.dispose()
  }, [])
  return <div className="diorama" ref={ref} />
}
