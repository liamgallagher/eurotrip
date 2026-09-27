import polyline from '@mapbox/polyline'
import { cumulative, hashString, pointAt, simplify, type LngLat } from './geo'
import type { DemSampler } from './dem'
import type { CountryIndex } from './countries'

// A "leg" is one routed drive between two points with ordered vias. Legs are the unit of caching:
// the snapshot script writes them to /public/data/legs/<key>.json, the browser reads those first,
// then IndexedDB, then asks OSRM live.

export const SAMPLE_KM = 0.5
export const LEG_FORMAT = 3

export interface Waypoint {
  name: string
  lat: number
  lon: number
}

export interface LegData {
  v: number
  key: string
  source: 'osrm'
  osrmUrl: string
  fetchedAt: string
  names: string[]
  distance: number // m
  duration: number // s
  /** polyline (precision 5) of the simplified geometry */
  geometry: string
  /** per SAMPLE_KM: elevation (m) and speed (km/h) */
  ele: number[]
  spd: number[]
  /** country runs: [cc, fromKm, toKm] */
  countries: [string, number, number][]
  /** road runs: [name, ref, km, startKm, classes] — classes from OSRM: m=motorway t=toll u=tunnel f=ferry */
  roads: [string, string, number, number, string][]
  /** snap distances (m) for each waypoint */
  snaps: number[]
}

export interface Sample {
  km: number
  lon: number
  lat: number
  ele: number
  spd: number
  cc: string
}

export interface Leg extends LegData {
  coords: LngLat[]
  cum: number[]
  samples: Sample[]
  ascent: number
  descent: number
  maxEle: number
}

export function legKey(wps: Waypoint[]): string {
  return 'L' + hashString(wps.map((w) => `${w.lon.toFixed(4)},${w.lat.toFixed(4)}`).join(';'))
}

export const DEFAULT_OSRM = 'https://router.project-osrm.org'

// Simple rate limiter: the public OSRM demo server asks for ≤ 1 request/second.
let chain: Promise<unknown> = Promise.resolve()
function throttled<T>(fn: () => Promise<T>, gapMs = 1100): Promise<T> {
  const p = chain.then(fn)
  chain = p.catch(() => undefined).then(() => new Promise((r) => setTimeout(r, gapMs)))
  return p
}

interface OsrmStep { name: string; ref?: string; distance: number; duration: number; intersections?: { classes?: string[] }[] }
interface OsrmRoute {
  distance: number
  duration: number
  geometry: string
  legs: { steps: OsrmStep[]; annotation: { distance: number[]; duration: number[] } }[]
}

export async function fetchOsrm(wps: Waypoint[], base = DEFAULT_OSRM, fetchImpl: typeof fetch = fetch) {
  const coords = wps.map((w) => `${w.lon.toFixed(5)},${w.lat.toFixed(5)}`).join(';')
  const url = `${base}/route/v1/driving/${coords}?overview=full&geometries=polyline6&steps=true&annotations=distance,duration&continue_straight=false`
  return throttled(async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetchImpl(url)
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt))
        continue
      }
      const json = await res.json()
      if (json.code !== 'Ok') throw new Error(`OSRM: ${json.code} ${json.message ?? ''}`)
      return json as { routes: OsrmRoute[]; waypoints: { distance: number; name: string }[] }
    }
    throw new Error('OSRM: too many retries')
  })
}

/** Route + sample + elevation + countries → compact LegData. */
export async function buildLeg(
  wps: Waypoint[],
  deps: { dem: DemSampler; countries: CountryIndex; osrmUrl?: string; fetchImpl?: typeof fetch },
): Promise<LegData> {
  const base = deps.osrmUrl ?? DEFAULT_OSRM
  const json = await fetchOsrm(wps, base, deps.fetchImpl)
  const route = json.routes[0]
  const full = polyline.decode(route.geometry, 6).map(([lat, lon]) => [lon, lat] as LngLat)
  const cum = cumulative(full)
  const total = cum[cum.length - 1]

  // time along geometry from annotations (segments across all OSRM legs, in order)
  const segDur: number[] = []
  for (const l of route.legs) segDur.push(...l.annotation.duration)
  const tcum = new Array<number>(full.length).fill(0)
  // annotation segments map 1:1 onto consecutive geometry points (legs share endpoints)
  let gi = 0
  for (let i = 0; i < segDur.length && gi < full.length - 1; i++) {
    tcum[gi + 1] = tcum[gi] + segDur[i]
    gi++
  }
  for (let i = gi + 1; i < full.length; i++) tcum[i] = tcum[gi]
  const timeAt = (d: number) => {
    // linear interpolation on cum
    let lo = 0, hi = cum.length - 1
    if (d >= total) return tcum[hi]
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1
      if (cum[m] <= d) lo = m
      else hi = m
    }
    const t = (d - cum[lo]) / (cum[hi] - cum[lo] || 1)
    return tcum[lo] + (tcum[hi] - tcum[lo]) * t
  }

  const step = SAMPLE_KM * 1000
  const n = Math.max(2, Math.ceil(total / step) + 1)
  const pts: LngLat[] = []
  const spd: number[] = []
  for (let i = 0; i < n; i++) {
    const d = Math.min(total, i * step)
    pts.push(pointAt(full, cum, d))
    const a = Math.max(0, d - step / 2), b = Math.min(total, d + step / 2)
    const dt = timeAt(b) - timeAt(a)
    spd.push(dt > 0 ? Math.round(((b - a) / dt) * 3.6) : 50)
  }
  const ele = (await deps.dem.sample(pts)).map((e) => Math.round(e))

  const countries: [string, number, number][] = []
  let prev: string | null = null
  for (let i = 0; i < n; i++) {
    const cc: string = deps.countries.lookup(pts[i][0], pts[i][1], prev ?? undefined) ?? prev ?? '??'
    const km = +(Math.min(total, i * step) / 1000).toFixed(1)
    if (cc !== prev) {
      if (countries.length) countries[countries.length - 1][2] = km
      countries.push([cc, km, km])
      prev = cc
    }
  }
  if (countries.length) countries[countries.length - 1][2] = +(total / 1000).toFixed(1)

  const roads: [string, string, number, number, string][] = []
  let along = 0
  const code: Record<string, string> = { motorway: 'm', toll: 't', tunnel: 'u', ferry: 'f' }
  for (const l of route.legs) {
    for (const s of l.steps) {
      const name = s.name || ''
      const ref = s.ref || ''
      const cls = [...new Set((s.intersections?.[0]?.classes ?? []).map((c) => code[c] ?? '').join(''))].sort().join('')
      const last = roads[roads.length - 1]
      if (last && last[0] === name && last[1] === ref && last[4] === cls) last[2] = +(last[2] + s.distance / 1000).toFixed(2)
      else if (name || ref || cls) roads.push([name, ref, +(s.distance / 1000).toFixed(2), +(along / 1000).toFixed(1), cls])
      along += s.distance
    }
  }
  const simp = simplify(full, 12)
  return {
    v: LEG_FORMAT,
    key: legKey(wps),
    source: 'osrm',
    osrmUrl: base,
    fetchedAt: new Date().toISOString(),
    names: wps.map((w) => w.name),
    distance: Math.round(route.distance),
    duration: Math.round(route.duration),
    geometry: polyline.encode(simp.map(([lon, lat]) => [lat, lon]), 5),
    ele,
    spd,
    countries,
    roads: roads.filter((r) => r[2] >= 0.3 || r[4]),
    snaps: json.waypoints.map((w) => Math.round(w.distance)),
  }
}

/** Expand compact LegData into arrays convenient for drawing and modelling. */
/** The DEM gives the mountain surface, not the road: interpolate elevation straight through tunnels. */
function flattenTunnels(d: LegData): number[] {
  const ele = d.ele.slice()
  const runs: [number, number][] = []
  for (const [name, ref, km, start, cls = ''] of d.roads) {
    if (!(cls.includes('u') || /tunnel|traforo|galleria|predor|tunel/i.test(name) || /^T ?\d$/.test(ref)) || km < 0.4) continue
    const last = runs[runs.length - 1]
    if (last && start <= last[1] + 0.6) last[1] = Math.max(last[1], start + km)
    else runs.push([start, start + km])
  }
  for (const [a, b] of runs) {
    const i0 = Math.max(0, Math.floor(a / SAMPLE_KM))
    const i1 = Math.min(ele.length - 1, Math.ceil(b / SAMPLE_KM))
    for (let i = i0 + 1; i < i1; i++) ele[i] = Math.round(ele[i0] + ((ele[i1] - ele[i0]) * (i - i0)) / (i1 - i0))
  }
  return ele
}

export function hydrate(raw: LegData): Leg {
  const d = { ...raw, ele: flattenTunnels(raw) }
  const coords = polyline.decode(d.geometry, 5).map(([lat, lon]) => [lon, lat] as LngLat)
  const cum = cumulative(coords)
  const geomLen = cum[cum.length - 1] || 1
  const scale = geomLen / (d.distance || geomLen)
  let ci = 0
  const samples: Sample[] = d.ele.map((e, i) => {
    const km = Math.min(d.distance / 1000, i * SAMPLE_KM)
    const [lon, lat] = pointAt(coords, cum, km * 1000 * scale)
    while (ci < d.countries.length - 1 && km >= d.countries[ci][2]) ci++
    return { km, lon, lat, ele: e, spd: d.spd[i] ?? 50, cc: d.countries[ci]?.[0] ?? '??' }
  })
  let ascent = 0, descent = 0, maxEle = -Infinity
  // light smoothing to avoid DEM noise inflating ascent
  const sm = samples.map((_, i) => {
    let s = 0, c = 0
    for (let j = Math.max(0, i - 2); j <= Math.min(samples.length - 1, i + 2); j++) { s += samples[j].ele; c++ }
    return s / c
  })
  for (let i = 1; i < sm.length; i++) {
    const dh = sm[i] - sm[i - 1]
    if (dh > 0) ascent += dh
    else descent -= dh
  }
  for (const s of samples) maxEle = Math.max(maxEle, s.ele)
  return { ...d, coords, cum, samples, ascent: Math.round(ascent), descent: Math.round(descent), maxEle }
}
