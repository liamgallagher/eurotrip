import { CAR, chargeMinutes, legEnergy } from './energy'
import { fastDist } from './geo'
import type { Sample } from './legs'

export interface Charger {
  id: number
  n: string
  lat: number
  lon: number
  st: number | null
  kw: number | null
  s: string
  cc: string
  o: string | null
}

export interface ChargerOnRoute extends Charger {
  km: number // position along the day
  offKm: number // distance from the route
}

export interface ChargeStop {
  charger: ChargerOnRoute
  arriveSoc: number
  departSoc: number
  minutes: number
  kwh: number
}

export interface Gap {
  fromKm: number
  toKm: number
  km: number
  maxEle: number
}

export interface DayCharging {
  kwh: number
  regenKWh: number
  perKm: number
  stops: ChargeStop[]
  /** [km, soc%] series including charge jumps */
  soc: [number, number][]
  arriveSoc: number
  chargeMinutes: number
  gaps: Gap[]
  near: ChargerOnRoute[]
  feasible: boolean
}

/** Superchargers within `maxOffKm` of the sampled route, with their along-route position. */
export function chargersAlong(samples: Sample[], chargers: Charger[], maxOffKm = 4): ChargerOnRoute[] {
  if (!samples.length) return []
  let minX = 180, minY = 90, maxX = -180, maxY = -90
  for (const s of samples) {
    minX = Math.min(minX, s.lon); maxX = Math.max(maxX, s.lon); minY = Math.min(minY, s.lat); maxY = Math.max(maxY, s.lat)
  }
  const pad = 0.08
  const out: ChargerOnRoute[] = []
  for (const c of chargers) {
    if (c.s !== 'OPEN' && c.s !== 'EXPANDING') continue
    if (c.lon < minX - pad || c.lon > maxX + pad || c.lat < minY - pad || c.lat > maxY + pad) continue
    let best = Infinity, bi = 0
    for (let i = 0; i < samples.length; i++) {
      const d = fastDist([samples[i].lon, samples[i].lat], [c.lon, c.lat])
      if (d < best) { best = d; bi = i }
    }
    if (best <= maxOffKm * 1000) out.push({ ...c, km: samples[bi].km, offKm: best / 1000 })
  }
  return out.sort((a, b) => a.km - b.km)
}

/**
 * Greedy charging planner: drive as far as possible, stopping at the last reachable Supercharger
 * that keeps ≥ minChargerPct on arrival; charge just enough (≤ 80 % unless unavoidable) to reach the
 * hotel with minArrivalPct or the next stop. Start every day at startPct (100 % — LFP, hotel charging).
 */
export function planDay(
  samples: Sample[],
  chargers: Charger[],
  opts: { cruiseKmh: number; startPct?: number; minArrivalPct: number; minChargerPct?: number },
): DayCharging {
  const start = opts.startPct ?? 100
  const minCh = opts.minChargerPct ?? 10
  const e = legEnergy(samples, { cruiseKmh: opts.cruiseKmh })
  const near = chargersAlong(samples, chargers)
  const pctPerKWh = 100 / CAR.usableKWh
  const eAt = (km: number) => {
    // cumulative kWh at km (samples are evenly spaced)
    const step = samples.length > 1 ? samples[1].km - samples[0].km : 0.5
    const i = Math.min(e.kwh.length - 1, Math.max(0, Math.round(km / step)))
    return e.kwh[i]
  }
  const endKm = samples.length ? samples[samples.length - 1].km : 0
  const stops: ChargeStop[] = []
  let soc = start
  let posKm = 0
  let feasible = true
  let guard = 0
  while (guard++ < 10) {
    const needToEnd = (eAt(endKm) - eAt(posKm)) * pctPerKWh
    if (soc - needToEnd >= opts.minArrivalPct) break
    // candidates reachable with ≥ minCh on arrival, beyond the current position
    const reachable = near.filter((c) => c.km > posKm + 5 && soc - ((eAt(c.km) - eAt(posKm)) + c.offKm * 2 * 0.18) * pctPerKWh >= minCh)
    if (!reachable.length) { feasible = false; break }
    // prefer the furthest; among those within 25 km of the furthest, prefer bigger sites
    const far = reachable[reachable.length - 1].km
    const pick = reachable.filter((c) => c.km >= far - 25).sort((a, b) => (b.st ?? 4) - (a.st ?? 4) || b.km - a.km)[0]
    const arrive = soc - (eAt(pick.km) - eAt(posKm) + pick.offKm * 0.18) * pctPerKWh
    const remaining = (eAt(endKm) - eAt(pick.km)) * pctPerKWh
    let target = Math.min(100, Math.ceil(remaining + opts.minArrivalPct + 5))
    if (target > 80) {
      // will we find another charger later? then only go to 80 %
      const later = near.some((c) => c.km > pick.km + 60)
      target = later ? 80 : Math.min(100, target)
    }
    target = Math.max(target, Math.ceil(arrive) + 5)
    const minutes = chargeMinutes(Math.max(0, arrive), target, pick.kw ?? 150) + 5
    stops.push({ charger: pick, arriveSoc: arrive, departSoc: target, minutes, kwh: ((target - arrive) / 100) * CAR.usableKWh })
    soc = target - pick.offKm * 0.18 * pctPerKWh
    posKm = pick.km
  }

  // SoC series (downsampled) with jumps at stops
  const series: [number, number][] = []
  let cur = start
  let si = 0
  let lastKWh = 0
  const every = Math.max(1, Math.floor(samples.length / 300))
  for (let i = 0; i < samples.length; i++) {
    cur -= (e.kwh[i] - lastKWh) * pctPerKWh
    lastKWh = e.kwh[i]
    if (i % every === 0 || i === samples.length - 1) series.push([samples[i].km, +cur.toFixed(1)])
    while (si < stops.length && samples[i].km >= stops[si].charger.km) {
      series.push([samples[i].km, +cur.toFixed(1)])
      cur = stops[si].departSoc
      series.push([samples[i].km, cur])
      si++
    }
  }

  // Gaps: stretches with no charger within reach of the route
  const gaps: Gap[] = []
  const pts = [0, ...near.map((c) => c.km), endKm]
  for (let i = 1; i < pts.length; i++) {
    const len = pts[i] - pts[i - 1]
    if (len >= 120) {
      const maxEle = Math.max(...samples.filter((s) => s.km >= pts[i - 1] && s.km <= pts[i]).map((s) => s.ele))
      // flag long gaps, and shorter ones that cross the mountains (where consumption and detours bite)
      if (len >= 200 || maxEle >= 1400) gaps.push({ fromKm: pts[i - 1], toKm: pts[i], km: len, maxEle })
    }
  }

  return {
    kwh: e.totalKWh,
    regenKWh: e.regenKWh,
    perKm: e.perKm,
    stops,
    soc: series,
    arriveSoc: cur,
    chargeMinutes: stops.reduce((a, s) => a + s.minutes, 0),
    gaps,
    near,
    feasible,
  }
}
