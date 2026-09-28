import type { Leg } from '../lib/legs'
import { haversine } from '../lib/geo'
import type { PathPoint } from './scene/Diorama'
import { arrivalMin, type Settings } from './engine/planner'
import type { Trip } from './engine/trip'

// One continuous path through every driving day of the trip, with a mark where each day starts.

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

export function tripPath(trip: Trip, legs: Record<string, Leg>, s: Settings, step = 2): { path: PathPoint[]; marks: DayMark[]; missing: number } {
  const path: PathPoint[] = []
  const marks: DayMark[] = []
  let off = 0
  let missing = 0
  for (const d of trip.days) {
    if (d.kind !== 'drive' && d.kind !== 'ferry-arrival' && d.kind !== 'ferry-night') continue
    const startKm = off
    for (const sg of d.segments) {
      if (sg.kind !== 'drive') continue
      const leg = legs[sg.key!]
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
    const dep = s.departMin
    marks.push({ n: d.n, km: startKm, endKm: off, title: d.title, date: d.date, dir: d.dir, from: d.from, to: d.to, dep, arr: d.e ? arrivalMin(d.e, s) : dep + 180, lon: end.lon, lat: end.lat })
  }
  return { path, marks, missing }
}

export function markAt(marks: DayMark[], km: number): DayMark {
  let m = marks[0]
  for (const x of marks) if (x.km <= km) m = x
  return m
}
