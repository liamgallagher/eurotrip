import { describe, expect, it } from 'vitest'
import { legEnergy, chargeMinutes } from './energy'
import { buildPlan, addDays } from './plan'
import { DEFAULT_STATE, defaultStops, type TripState } from './state'
import { gmapsUrl, splitChain, dayLinks, GMAPS_MAX_WAYPOINTS } from './export'
import { scoreRoutes, routeHighlights, ALL_HIGHLIGHTS } from './scoring'
import { ROUTES, ROUTE_BY_ID } from '../data/routes'
import { PLACES } from '../data/places'
import { EXCLUSIONS } from '../data/exclusions'
import { planDay, type Charger } from './charging'
import type { Sample } from './legs'
import { encodeState, decodeState } from '../store'

const flat = (kmh: number, km = 100): Sample[] => Array.from({ length: km * 2 + 1 }, (_, i) => ({ km: i * 0.5, lon: 5, lat: 48, ele: 200, spd: kmh, cc: 'FR' }))

describe('energy model', () => {
  it('matches published real-world consumption', () => {
    const e110 = legEnergy(flat(110), { cruiseKmh: 110 }).totalKWh
    const e130 = legEnergy(flat(130), { cruiseKmh: 130 }).totalKWh
    expect(e110).toBeGreaterThan(14)
    expect(e110).toBeLessThan(17.5)
    expect(e130).toBeGreaterThan(18)
    expect(e130).toBeLessThan(22)
  })
  it('recovers energy on descents but never more than it cost to climb', () => {
    const up = Array.from({ length: 61 }, (_, i) => ({ km: i * 0.5, lon: 12, lat: 47, ele: 800 + i * 25, spd: 45, cc: 'AT' }))
    const down = up.map((s, i) => ({ ...s, km: 30 + i * 0.5, ele: 2300 - i * 25 }))
    const climb = legEnergy(up, { cruiseKmh: 130 }).totalKWh
    const both = legEnergy([...up, ...down.slice(1)], { cruiseKmh: 130 })
    expect(both.regenKWh).toBeGreaterThan(1)
    expect(both.totalKWh).toBeLessThan(climb * 1.1)
    expect(both.totalKWh).toBeGreaterThan(climb * 0.5)
  })
  it('cruise cap sets motorway speed and changes consumption', () => {
    expect(legEnergy(flat(100), { cruiseKmh: 110 }).totalKWh).toBeLessThan(legEnergy(flat(100), { cruiseKmh: 130 }).totalKWh)
    // slow roads are unaffected by the cap
    expect(legEnergy(flat(60), { cruiseKmh: 110 }).totalKWh).toBeCloseTo(legEnergy(flat(60), { cruiseKmh: 130 }).totalKWh)
  })
  it('charging 10→80 % takes roughly 25–35 minutes', () => {
    const m = chargeMinutes(10, 80, 250)
    expect(m).toBeGreaterThan(20)
    expect(m).toBeLessThan(40)
  })
})

describe('charging planner', () => {
  const chargers: Charger[] = [100, 250, 400, 550].map((km, i) => ({ id: i, n: `SC${i}`, lat: 48, lon: 5 + km / 74.4, st: 12, kw: 250, s: 'OPEN', cc: 'FR', o: null }))
  it('plans stops on a 600 km motorway day and keeps a reserve', () => {
    const samples = Array.from({ length: 1201 }, (_, i) => ({ km: i * 0.5, lon: 5 + (i * 0.5) / 74.4, lat: 48, ele: 200, spd: 125, cc: 'FR' }))
    const d = planDay(samples, chargers, { cruiseKmh: 130, minArrivalPct: 15 })
    expect(d.feasible).toBe(true)
    expect(d.stops.length).toBeGreaterThanOrEqual(1)
    expect(d.arriveSoc).toBeGreaterThanOrEqual(14)
    for (const s of d.stops) expect(s.arriveSoc).toBeGreaterThanOrEqual(9.5)
  })
  it('needs no stop on a short day', () => {
    const d = planDay(flat(110, 150), chargers, { cruiseKmh: 130, minArrivalPct: 15 })
    expect(d.stops.length).toBe(0)
  })
})

describe('plan builder', () => {
  it('default plan is 14 nights with 5 + 4 + 5', () => {
    const p = buildPlan(DEFAULT_STATE)
    expect(p.totalNights).toBe(14)
    expect(p.outNights).toBe(5)
    expect(p.retNights).toBe(5)
    expect(p.days[0].date).toBe('2027-05-10')
    expect(p.endDate).toBe('2027-05-24')
    expect(p.warnings.filter((w) => w.level !== 'info')).toHaveLength(0)
  })
  it('warns when nights are not 14 and when routes repeat', () => {
    const s: TripState = { ...DEFAULT_STATE, sloveniaNights: 3, ret: { ...DEFAULT_STATE.ret, route: 'r1', stops: defaultStops('r1') } }
    const p = buildPlan(s)
    expect(p.totalNights).toBe(13)
    expect(p.warnings.some((w) => /not 14/.test(w.text))).toBe(true)
    expect(p.warnings.some((w) => /same route/.test(w.text))).toBe(true)
    expect(p.warnings.some((w) => /Repeated overnight/.test(w.text))).toBe(true)
  })
  it('a 0-night stop merges two driving days and becomes a via', () => {
    const s: TripState = { ...DEFAULT_STATE, out: { ...DEFAULT_STATE.out, nights: [1, 0, 1, 1, 1] } }
    const p = buildPlan(s)
    const out = p.days.filter((d) => d.dir === 'out')
    expect(out).toHaveLength(5)
    const merged = out.find((d) => d.defDays.length === 2)!
    const drive = merged.segments.find((x) => x.kind === 'drive')!
    expect(drive.kind === 'drive' && drive.waypoints.some((w) => w.name === 'Heidelberg')).toBe(true)
  })
  it('overnight ferry adds a night on board', () => {
    const p = buildPlan({ ...DEFAULT_STATE, out: { ...DEFAULT_STATE.out, crossing: 'ferry' } })
    expect(p.ferryNights).toBe(1)
    expect(p.totalNights).toBe(15)
    expect(p.days[0].kind).toBe('ferry-night')
  })
  it('return direction reverses stops and vias', () => {
    const p = buildPlan(DEFAULT_STATE)
    const ret = p.days.filter((d) => d.dir === 'ret' && d.kind === 'drive')
    expect(ret[0].from.id).toBe('ljubljana')
    expect(ret[ret.length - 1].sleep).toBe('home')
  })
  it('every route runs in both directions (except Route 6) without errors', () => {
    for (const r of ROUTES) {
      for (const dir of ['out', 'ret'] as const) {
        if (dir === 'out' && r.directions === 'return-only') continue
        const other = r.id === 'r2' ? 'r1' : 'r2'
        const s: TripState = { ...DEFAULT_STATE, [dir]: { route: r.id, stops: defaultStops(r.id), nights: [1, 1, 1, 1, 1], crossing: 'tunnel' }, [dir === 'out' ? 'ret' : 'out']: { route: other, stops: defaultStops(other), nights: [1, 1, 1, 1, 1], crossing: 'tunnel' } } as TripState
        const p = buildPlan(s)
        expect(p.totalNights).toBe(14)
        expect(p.warnings.filter((w) => w.level === 'error')).toHaveLength(0)
      }
    }
  })
  it('reinstated exclusions add their via to the right day', () => {
    const p = buildPlan({ ...DEFAULT_STATE, out: { ...DEFAULT_STATE.out, route: 'r7', stops: defaultStops('r7') }, reinstated: ['x-stelvio'] })
    const hasStelvio = p.days.some((d) => d.segments.some((s) => s.kind === 'drive' && s.waypoints.some((w) => w.name === 'Stelvio Pass')))
    expect(hasStelvio).toBe(true)
    expect(p.warnings.some((w) => /Stelvio/.test(w.text))).toBe(true)
  })
  it('addDays handles month ends', () => {
    expect(addDays('2027-05-31', 1)).toBe('2027-06-01')
  })
})

describe('data integrity', () => {
  it('every referenced highlight and place exists', () => {
    for (const r of ROUTES) {
      expect(r.stops).toHaveLength(5)
      expect(r.days).toHaveLength(6)
      for (const s of r.stops) for (const id of [s.default, ...s.swaps]) expect(PLACES[id], `${r.id} place ${id}`).toBeTruthy()
      for (const d of r.days) {
        for (const h of d.highlights) expect(ALL_HIGHLIGHTS[h], `${r.id} highlight ${h}`).toBeTruthy()
        for (const o of d.options ?? []) for (const h of o.highlights) expect(ALL_HIGHLIGHTS[h], `${r.id} option highlight ${h}`).toBeTruthy()
        for (const v of d.vias) {
          if (v.opt) expect(d.options?.some((o) => o.id === v.opt), `${r.id} via ${v.name} option ${v.opt}`).toBe(true)
          if (v.unlessOpt) expect(d.options?.some((o) => o.id === v.unlessOpt), `${r.id} via ${v.name} unless ${v.unlessOpt}`).toBe(true)
        }
      }
    }
    for (const p of Object.values(PLACES)) for (const h of p.highlights) expect(ALL_HIGHLIGHTS[h], `place ${p.id} → ${h}`).toBeTruthy()
    for (const x of EXCLUSIONS) {
      if (x.reinstate) {
        expect(ROUTE_BY_ID[x.reinstate.routeId]).toBeTruthy()
        if (x.reinstate.highlight) expect(ALL_HIGHLIGHTS[x.reinstate.highlight]).toBeTruthy()
      }
    }
  })
  it('no overnight stop is in Paris or Luxembourg', () => {
    for (const r of ROUTES) for (const s of r.stops) for (const id of [s.default, ...s.swaps]) {
      expect(PLACES[id].country).not.toBe('LU')
      expect(PLACES[id].name).not.toMatch(/Paris/)
    }
  })
  it('the user-excluded passes are not on any default route', () => {
    for (const r of ROUTES) {
      const names = r.days.flatMap((d) => d.vias.map((v) => v.name)).join(' ')
      expect(names).not.toMatch(/Stelvio|Furka|Grimsel|Susten|Timmelsjoch|Great St Bernard/)
    }
  })
  it('Venice is on a route (never silently dropped)', () => {
    expect(ROUTES.some((r) => routeHighlights(r).some((h) => h.id === 'venice'))).toBe(true)
  })
  it('every highlight has a source and a check date', () => {
    for (const h of Object.values(ALL_HIGHLIGHTS)) {
      expect(h.sources.length).toBeGreaterThan(0)
      expect(h.lastChecked).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

describe('scoring', () => {
  it('re-ranks when weights change and when highlights are starred', () => {
    const a = scoreRoutes({ scenery: 10, evenings: 0, charging: 0, may: 0 }, [], {})
    const b = scoreRoutes({ scenery: 0, evenings: 10, charging: 0, may: 0 }, [], {})
    expect(a.map((x) => x.route.id).join()).not.toBe(b.map((x) => x.route.id).join())
    const last = a[a.length - 1].route
    const stars = routeHighlights(last).filter((h) => !h.optional).slice(0, 6).map((h) => h.id)
    const c = scoreRoutes({ scenery: 10, evenings: 0, charging: 0, may: 0 }, stars, {})
    expect(c.findIndex((x) => x.route.id === last.id)).toBeLessThan(a.length - 1)
  })
})

describe('Google Maps export', () => {
  it('builds documented Maps URLs', () => {
    const u = gmapsUrl([{ name: 'Southampton', lat: 50.9, lon: -1.4 }, { name: 'Hochtor', lat: 47.083, lon: 12.842 }, { name: 'Ljubljana', lat: 46.05, lon: 14.5 }])
    expect(u).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&/)
    expect(u).toContain('travelmode=driving')
    expect(u).toContain('waypoints=47.08300,12.84200')
  })
  it('uses the home address only when provided', () => {
    const u = gmapsUrl([{ name: 'Southampton', lat: 50.9097, lon: -1.4044 }, { name: 'Ljubljana', lat: 46.0511, lon: 14.5051 }], { home: '1 Test Road' })
    expect(u).toContain('origin=1+Test+Road')
  })
  it('splits chains so no link exceeds the waypoint limit and parts join up', () => {
    const pts = Array.from({ length: 25 }, (_, i) => ({ name: `P${i}`, lat: 46 + i * 0.01, lon: 10 }))
    const parts = splitChain(pts)
    for (const p of parts) expect(p.length - 2).toBeLessThanOrEqual(GMAPS_MAX_WAYPOINTS)
    for (let i = 1; i < parts.length; i++) expect(parts[i][0]).toEqual(parts[i - 1][parts[i - 1].length - 1])
    expect(parts[parts.length - 1].at(-1)).toEqual(pts.at(-1))
  })
  it('every planned day produces at least one link', () => {
    const p = buildPlan(DEFAULT_STATE)
    for (const d of p.days.filter((x) => x.kind === 'drive')) expect(dayLinks(d).length).toBeGreaterThan(0)
  })
})

describe('share URL state', () => {
  it('round-trips through the URL encoding', () => {
    const s: TripState = { ...DEFAULT_STATE, stars: ['grossglockner', 'venice'], sloveniaNights: 3, out: { ...DEFAULT_STATE.out, stops: ['aachen', 'heidelberg', 'rothenburg', 'munich', 'zell-am-see'] } }
    const back = decodeState(encodeState(s))!
    expect(back.stars).toEqual(['grossglockner', 'venice'])
    expect(back.out.stops[3]).toBe('munich')
    expect(back.sloveniaNights).toBe(3)
  })
  it('sanitises unknown ids from a tampered link', () => {
    const bad = encodeState({ ...DEFAULT_STATE, out: { ...DEFAULT_STATE.out, route: 'nope', stops: ['paris'] } } as TripState)
    const back = decodeState(bad)!
    expect(ROUTE_BY_ID[back.out.route]).toBeTruthy()
    expect(back.out.stops.every((id) => PLACES[id])).toBe(true)
  })
})
