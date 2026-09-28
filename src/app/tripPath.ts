import type { Leg } from '../lib/legs'
import { fastDist, haversine } from '../lib/geo'
import { ALL_HIGHLIGHTS } from '../lib/scoring'
import type { PathPoint } from './scene/Diorama'
import { arrivalMin, type Settings } from './engine/planner'
import type { Trip } from './engine/trip'

// One continuous path through the driving days of the trip, with a mark where each day starts, the legs
// under it (for country and road names) and the sights along it.

export interface DayMark {
  n: number
  km: number
  endKm: number
  title: string
  date: string
  dir: 'out' | 'ret' | 'base'
  from: string
  to: string
  /** clock minutes you set off and arrive (for the sun) */
  dep: number
  arr: number
  /** where you sleep that night */
  lon: number
  lat: number
}

export interface PathSeg {
  km: number
  leg: Leg | null
}

export interface Poi {
  id: string
  km: number
}

export interface TripPath {
  path: PathPoint[]
  marks: DayMark[]
  segs: PathSeg[]
  pois: Poi[]
  missing: number
}

export function tripPath(trip: Trip, legs: Record<string, Leg>, s: Settings, opts: { days?: number[]; step?: number } = {}): TripPath {
  const step = opts.step ?? 2
  const path: PathPoint[] = []
  const marks: DayMark[] = []
  const segs: PathSeg[] = []
  const poiIds = new Set<string>()
  let off = 0
  let missing = 0
  for (const d of trip.days) {
    if (d.kind !== 'drive' && d.kind !== 'ferry-arrival' && d.kind !== 'ferry-night') continue
    if (opts.days && !opts.days.includes(d.n)) continue
    const startKm = off
    for (const sg of d.segments) {
      if (sg.kind !== 'drive') continue
      const leg = legs[sg.key!]
      segs.push({ km: off, leg: leg ?? null })
      if (!leg) {
        // not routed yet: fly straight between its waypoints
        missing++
        const w = sg.waypoints ?? []
        for (let i = 0; i < w.length; i++) {
          if (i) off += (haversine([w[i - 1].lon, w[i - 1].lat], [w[i].lon, w[i].lat]) / 1000) * 1.25
          path.push({ lon: w[i].lon, lat: w[i].lat, ele: 0, km: off })
        }
        continue
      }
      for (let i = 0; i < leg.samples.length; i += step) {
        const p = leg.samples[i]
        path.push({ lon: p.lon, lat: p.lat, ele: p.ele, km: off + p.km })
      }
      const last = leg.samples[leg.samples.length - 1]
      path.push({ lon: last.lon, lat: last.lat, ele: last.ele, km: off + last.km })
      off += leg.distance / 1000
    }
    const end = path[path.length - 1]
    if (!end || off === startKm) continue
    for (const id of d.e?.covered ?? []) poiIds.add(id)
    const dep = s.departMin
    marks.push({ n: d.n, km: startKm, endKm: off, title: d.title, date: d.date, dir: d.dir, from: d.from, to: d.to, dep, arr: d.e ? arrivalMin(d.e, s) : dep + 180, lon: end.lon, lat: end.lat })
  }
  // where along the path each sight is (closest approach, if within ~12 km)
  const pois: Poi[] = []
  for (const id of poiIds) {
    const h = ALL_HIGHLIGHTS[id]
    if (!h) continue
    let best = Infinity, km = 0
    for (let i = 0; i < path.length; i += 2) {
      const d = fastDist([path[i].lon, path[i].lat], [h.lon, h.lat])
      if (d < best) {
        best = d
        km = path[i].km
      }
    }
    if (best < 12000) pois.push({ id, km })
  }
  pois.sort((a, b) => a.km - b.km)
  return { path, marks, segs, pois, missing }
}

export function markAt(marks: DayMark[], km: number): DayMark {
  let m = marks[0]
  for (const x of marks) if (x.km <= km) m = x
  return m
}

export interface Here {
  lon: number
  lat: number
  ele: number
  /** degrees, 0 = north */
  heading: number
  country: string | null
  road: string | null
}

/** Position, heading, country and road at a distance along the path. */
export function hereAt(t: TripPath, km: number): Here {
  const p = t.path
  let i = 0
  let lo = 0, hi = p.length - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (p[m].km <= km) lo = m
    else hi = m
  }
  i = lo
  const a = p[Math.max(0, i - 2)], b = p[Math.min(p.length - 1, i + 3)]
  const dx = (b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180), dy = b.lat - a.lat
  const heading = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
  const f = p[hi].km > p[lo].km ? (km - p[lo].km) / (p[hi].km - p[lo].km) : 0
  const pos = { lon: p[lo].lon + (p[hi].lon - p[lo].lon) * f, lat: p[lo].lat + (p[hi].lat - p[lo].lat) * f, ele: p[lo].ele + (p[hi].ele - p[lo].ele) * f }
  let seg = t.segs[0]
  for (const s of t.segs) if (s.km <= km) seg = s
  let country: string | null = null, road: string | null = null
  if (seg?.leg) {
    const local = km - seg.km
    for (const [cc, from, to] of seg.leg.countries) if (local >= from && local <= to && cc !== '??') country = cc
    for (const [name, ref, len, start] of seg.leg.roads) {
      if (local >= start && local <= start + len) {
        road = [ref.split(';')[0], name].filter(Boolean).join(' · ') || null
      }
    }
  }
  return { ...pos, heading, country, road }
}
