import type { Leg } from '../../lib/legs'
import type { DayStats } from '../../lib/tripStats'
import { haversine } from '../../lib/geo'
import type { TrackPoint } from './ribbons'

// Turning routed legs (and not-yet-routed waypoint chains) into ribbon track points.

const TUNNEL = /tunnel|traforo|galleria|predor|tunel/i

function tunnelRuns(leg: Leg): [number, number][] {
  const runs: [number, number][] = []
  for (const [name, ref, km, start, cls = ''] of leg.roads) {
    if (!(cls.includes('u') || TUNNEL.test(name) || /^T ?\d$/.test(ref)) || km < 0.4) continue
    runs.push([start, start + km])
  }
  return runs
}

/** Track points for a sequence of legs, with battery %, gradient, tunnels and driven flags. */
export function legPoints(legs: Leg[], stats?: DayStats | null, driven?: (lon: number, lat: number) => boolean): TrackPoint[] {
  const pts: TrackPoint[] = []
  let off = 0
  for (const leg of legs) {
    const runs = tunnelRuns(leg)
    for (const s of leg.samples) {
      const km = s.km + off
      pts.push({ lon: s.lon, lat: s.lat, ele: s.ele, km, tunnel: runs.some(([a, b]) => s.km >= a && s.km <= b) })
    }
    off += leg.distance / 1000
  }
  // gradient over ±1 km
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 2)], b = pts[Math.min(pts.length - 1, i + 2)]
    const dk = (b.km - a.km) * 1000
    pts[i].grade = dk > 0 ? (b.ele - a.ele) / dk : 0
  }
  const soc = stats?.charging?.soc
  if (soc?.length) {
    let j = 0
    for (const p of pts) {
      while (j < soc.length - 2 && soc[j + 1][0] < p.km) j++
      const [k0, s0] = soc[j], [k1, s1] = soc[Math.min(soc.length - 1, j + 1)]
      p.soc = k1 > k0 ? s0 + ((s1 - s0) * (p.km - k0)) / (k1 - k0) : s0
    }
  }
  if (driven) for (const p of pts) p.driven = driven(p.lon, p.lat)
  return pts
}

/** A provisional straight-ish track through waypoints (shown dashed until the real road is routed). */
export function straightPoints(wps: { lat: number; lon: number }[], heightAt: (lon: number, lat: number) => number): TrackPoint[] {
  const pts: TrackPoint[] = []
  let km = 0
  for (let i = 0; i < wps.length - 1; i++) {
    const a = wps[i], b = wps[i + 1]
    const d = haversine([a.lon, a.lat], [b.lon, b.lat]) / 1000
    const n = Math.max(2, Math.ceil(d / 4))
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const t = k / n
      const lon = a.lon + (b.lon - a.lon) * t, lat = a.lat + (b.lat - a.lat) * t
      pts.push({ lon, lat, ele: heightAt(lon, lat) + 30, km: km + d * t, tunnel: true })
    }
    km += d
  }
  return pts
}
