import { FIXED_TOLLS, PER_KM_TOLLS, VIGNETTES, CROSSINGS, GBP_TO_EUR, SC_PRICE, SC_PRICE_DEFAULT, HOTEL_CHARGE_EUR_PER_NIGHT, type FixedToll } from '../data/costs'
import { PEAKS } from '../data/calendar'
import { planDay, type Charger, type DayCharging } from './charging'
import { fastDist } from './geo'
import type { Leg, Sample } from './legs'
import type { Plan, PlanDay } from './plan'
import type { HolidayData } from './runtime'
import type { TripState } from './state'

export interface DayStats {
  day: PlanDay
  ready: boolean
  km: number
  driveH: number
  crossingH: number
  ascent: number
  maxEle: number
  samples: Sample[]
  charging: DayCharging | null
  countries: string[]
  kmByCountry: Record<string, number>
  motorwayKmByCountry: Record<string, number>
  /** km on roads OSRM flags as tolled */
  tollKmByCountry: Record<string, number>
  tolls: FixedToll[]
  holidays: { cc: string; name: string }[]
  peaks: string[]
  warnings: string[]
}

const isMotorway = (cc: string, ref: string, name: string) => {
  const r = ref.toUpperCase()
  if (cc === 'CZ') return /\bD ?\d/.test(r)
  if (cc === 'SI') return /\b[AH] ?\d/.test(r)
  if (cc === 'AT') return /\b[AS] ?\d/.test(r)
  if (cc === 'CH') return /\bA ?\d/.test(r) || /autobahn|autostrada/i.test(name)
  if (cc === 'FR' || cc === 'IT') return /\bA ?\d/.test(r)
  return /\b[AEM] ?\d/.test(r)
}

/** Toll-free French autoroutes that our routes use (A25 Dunkirk–Lille, A31 Metz–Nancy, A35 Alsace, A330/A33 Nancy). */
const FR_FREE = /\bA ?(25|31|33|35|330|34|36 ?\(Mulhouse\))\b/

function combineSamples(day: PlanDay, legs: Record<string, Leg | undefined>): Sample[] | null {
  const out: Sample[] = []
  let off = 0
  for (const s of day.segments) {
    if (s.kind !== 'drive') continue
    const leg = legs[s.key]
    if (!leg) return null
    for (const x of leg.samples) out.push({ ...x, km: x.km + off })
    off += leg.distance / 1000
  }
  return out
}

function matchTolls(leg: Leg): FixedToll[] {
  const found: FixedToll[] = []
  for (const t of FIXED_TOLLS) {
    const byName = t.names?.some((n) => leg.roads.some(([name]) => new RegExp(n, 'i').test(name)))
    let byNear = false
    if (!byName && t.near) {
      for (const s of leg.samples) {
        if (fastDist([s.lon, s.lat], [t.near.lon, t.near.lat]) < t.near.radiusM) { byNear = true; break }
      }
    }
    // tunnels must match by name (the pass road above is close by)
    if (byName || (byNear && !/tunnel/i.test(t.name))) found.push(t)
  }
  return found
}

function countryAt(leg: Leg, km: number): string {
  for (const [cc, a, b] of leg.countries) if (km >= a && km <= b) return cc
  return leg.countries[leg.countries.length - 1]?.[0] ?? '??'
}

export function computeDay(
  day: PlanDay,
  legs: Record<string, Leg | undefined>,
  chargers: Charger[] | null,
  state: TripState,
  holidays: HolidayData | null,
): DayStats {
  const crossingH = day.segments.reduce((a, s) => a + (s.kind === 'crossing' ? s.crossing.hours : 0), 0)
  const base: DayStats = {
    day, ready: false, km: 0, driveH: 0, crossingH, ascent: 0, maxEle: 0, samples: [], charging: null, countries: [],
    kmByCountry: {}, motorwayKmByCountry: {}, tollKmByCountry: {}, tolls: [], holidays: [], peaks: [], warnings: [],
  }
  const drives = day.segments.filter((s) => s.kind === 'drive')
  if (!drives.length) {
    base.ready = true
    base.countries = typeof day.sleep === 'object' ? [day.sleep.country] : []
    fillCalendar(base, holidays)
    return base
  }
  const samples = combineSamples(day, legs)
  if (!samples) return base
  const ls = drives.map((s) => legs[(s as { key: string }).key]!)
  base.ready = true
  base.samples = samples
  base.km = ls.reduce((a, l) => a + l.distance, 0) / 1000
  base.driveH = ls.reduce((a, l) => a + l.duration, 0) / 3600
  base.ascent = ls.reduce((a, l) => a + l.ascent, 0)
  base.maxEle = Math.max(...ls.map((l) => l.maxEle))
  for (const l of ls) {
    for (const [cc, a, b] of l.countries) if (cc !== '??') base.kmByCountry[cc] = (base.kmByCountry[cc] ?? 0) + (b - a)
    for (const [name, ref, km, start, cls = ''] of l.roads) {
      const cc = countryAt(l, start)
      if (cls.includes('m') || isMotorway(cc, ref, name)) base.motorwayKmByCountry[cc] = (base.motorwayKmByCountry[cc] ?? 0) + km
      // The public OSRM server does not expose toll flags, so estimate: A-roads in FR/IT minus known free French autoroutes.
      if (cls.includes('t') || ((cc === 'FR' || cc === 'IT') && isMotorway(cc, ref, name) && !(cc === 'FR' && FR_FREE.test(ref))))
        base.tollKmByCountry[cc] = (base.tollKmByCountry[cc] ?? 0) + km
    }
    for (const t of matchTolls(l)) if (!base.tolls.includes(t)) base.tolls.push(t)
  }
  base.countries = Object.entries(base.kmByCountry).filter(([, km]) => km >= 1).map(([cc]) => cc)
  if (chargers) {
    base.charging = planDay(samples, chargers, { cruiseKmh: state.cruiseKmh, minArrivalPct: state.minArrivalPct })
    if (!base.charging.feasible) base.warnings.push('Charging plan could not keep a safe reserve — add a stop or lower speed.')
    for (const g of base.charging.gaps) base.warnings.push(`${Math.round(g.km)} km without a Supercharger near the route (km ${Math.round(g.fromKm)}–${Math.round(g.toKm)}${g.maxEle > 1500 ? `, up to ${Math.round(g.maxEle)} m` : ''}).`)
  }
  const total = base.driveH + crossingH + (base.charging?.chargeMinutes ?? 0) / 60
  if (base.driveH > 7) base.warnings.push(`Long day: ${base.driveH.toFixed(1)} h of driving before stops.`)
  else if (total > 8) base.warnings.push(`Long day: ${total.toFixed(1)} h including crossing and charging.`)
  fillCalendar(base, holidays)
  return base
}

function fillCalendar(s: DayStats, holidays: HolidayData | null) {
  const date = s.day.date
  const ccs = new Set(s.countries)
  if (holidays) {
    for (const cc of ccs) {
      for (const h of holidays.public[cc] ?? []) {
        if (h.date === date && (h.global || (h.counties?.length ?? 0) >= 3)) s.holidays.push({ cc, name: h.name })
      }
    }
  }
  for (const p of PEAKS) {
    if (date >= p.from && date <= p.to && p.countries.some((c) => ccs.has(c))) s.peaks.push(p.label)
  }
}

export interface TripTotals {
  km: number
  driveH: number
  chargeMin: number
  chargeStops: number
  kwh: number
  longest: DayStats | null
  ascent: number
  nightsByCountry: Record<string, number>
  kmByCountry: Record<string, number>
  passThrough: string[]
  ready: boolean
}

export function totals(plan: Plan, days: DayStats[]): TripTotals {
  const drive = days.filter((d) => d.samples.length)
  const km = drive.reduce((a, d) => a + d.km, 0)
  const nightsByCountry: Record<string, number> = {}
  for (const n of plan.nights) if (n.kind !== 'ferry') nightsByCountry[n.cc] = (nightsByCountry[n.cc] ?? 0) + 1
  const kmByCountry: Record<string, number> = {}
  for (const d of drive) for (const [cc, k] of Object.entries(d.kmByCountry)) kmByCountry[cc] = (kmByCountry[cc] ?? 0) + k
  return {
    km,
    driveH: drive.reduce((a, d) => a + d.driveH, 0),
    chargeMin: drive.reduce((a, d) => a + (d.charging?.chargeMinutes ?? 0), 0),
    chargeStops: drive.reduce((a, d) => a + (d.charging?.stops.length ?? 0), 0),
    kwh: drive.reduce((a, d) => a + (d.charging?.kwh ?? 0), 0),
    longest: drive.reduce<DayStats | null>((a, d) => (!a || d.driveH > a.driveH ? d : a), null),
    ascent: drive.reduce((a, d) => a + d.ascent, 0),
    nightsByCountry,
    kmByCountry,
    passThrough: Object.keys(kmByCountry).filter((cc) => cc !== 'GB' && !nightsByCountry[cc] && kmByCountry[cc] >= 1),
    ready: days.every((d) => d.ready),
  }
}

export interface CostLine {
  group: 'Crossings' | 'Vignettes' | 'Tolls' | 'Charging'
  label: string
  eur: number
  estimate: boolean
  detail?: string
  sources: { label: string; url: string }[]
}

export function costs(plan: Plan, days: DayStats[], state: TripState): CostLine[] {
  const lines: CostLine[] = []
  for (const dir of ['out', 'ret'] as const) {
    const x = CROSSINGS[state[dir].crossing]
    lines.push({ group: 'Crossings', label: `${x.name} (${dir === 'out' ? 'outbound' : 'return'})`, eur: x.gbpEach * GBP_TO_EUR, estimate: true, detail: `£${x.gbpEach} assumed · ${x.gbpRange}`, sources: x.sources })
  }
  // Vignettes: find dates with motorway use per vignette country
  for (const v of VIGNETTES) {
    const dates = days.filter((d) => (d.motorwayKmByCountry[v.country] ?? 0) > 0.5 || (v.country === 'SI' && d.countries.includes('SI'))).map((d) => d.day.date)
    // Slovenia: include base days (Ljubljana ring / day trips)
    if (v.country === 'SI') for (const d of days) if (d.day.kind === 'base') dates.push(d.day.date)
    if (!dates.length) continue
    const sorted = [...new Set(dates)].sort()
    const first = sorted[0], last = sorted[sorted.length - 1]
    const span = (Date.parse(last) - Date.parse(first)) / 86400000 + 1
    let best = { label: '', eur: Infinity }
    for (const o of v.options) {
      // number of passes needed: greedy windows of o.days
      let count = 0
      let until = ''
      for (const d of sorted) {
        if (!until || d > until) {
          count++
          until = new Date(Date.parse(d) + (o.days - 1) * 86400000).toISOString().slice(0, 10)
        }
      }
      const eur = count * o.eur
      if (eur < best.eur) best = { label: `${count > 1 ? `${count} × ` : ''}${o.label}`, eur }
    }
    lines.push({ group: 'Vignettes', label: `${v.name}: ${best.label}`, eur: best.eur, estimate: v.country === 'CH', detail: `${v.note} Motorway days: ${sorted.join(', ')} (span ${span} days).`, sources: v.sources })
  }
  // Fixed tolls
  const seen = new Map<string, { t: FixedToll; n: number }>()
  for (const d of days) for (const t of d.tolls) {
    const e = seen.get(t.id)
    if (e) e.n++
    else seen.set(t.id, { t, n: 1 })
  }
  for (const { t, n } of seen.values()) {
    lines.push({ group: 'Tolls', label: `${t.name}${n > 1 ? ` × ${n}` : ''}`, eur: t.eur * n, estimate: !!t.estimate, detail: t.note, sources: t.sources })
  }
  // Per-km tolls
  for (const p of PER_KM_TOLLS) {
    const km = days.reduce((a, d) => a + (d.tollKmByCountry[p.country] ?? 0), 0)
    if (km > 1) lines.push({ group: 'Tolls', label: `${p.country === 'FR' ? 'French' : 'Italian'} motorway tolls (~${Math.round(km)} km)`, eur: km * p.eurPerKm, estimate: true, detail: `${p.range} × km on tolled autoroute/autostrada (A-roads, excluding known free French sections). ${p.note}`, sources: p.sources })
  }
  // Charging
  let scEur = 0, scKWh = 0
  for (const d of days) for (const s of d.charging?.stops ?? []) {
    const price = SC_PRICE[s.charger.cc as keyof typeof SC_PRICE]?.eur ?? SC_PRICE_DEFAULT
    scEur += s.kwh * price
    scKWh += s.kwh
  }
  lines.push({ group: 'Charging', label: `Supercharging on the road (~${Math.round(scKWh)} kWh)`, eur: scEur, estimate: true, detail: 'Owner prices by country, mid-range of 2025/26 figures; prices vary by time of day.', sources: Object.values(SC_PRICE).map((p) => p!.source).filter((s, i, a) => a.findIndex((x) => x.url === s.url) === i && s.url.indexOf('findus') < 0) })
  const nights = plan.nights.filter((n) => n.kind !== 'ferry').length
  lines.push({ group: 'Charging', label: `Hotel destination charging (${nights} nights)`, eur: nights * HOTEL_CHARGE_EUR_PER_NIGHT, estimate: true, detail: `Allowance of €${HOTEL_CHARGE_EUR_PER_NIGHT}/night — many hotels include it free.`, sources: [] })
  return lines
}
