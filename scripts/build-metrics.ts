// Per-route summary metrics (default stops, Eurotunnel) used by the comparison board.
// Computed from the leg snapshot with the same code the app uses. Usage: npm run data:metrics
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { ROUTES } from '../src/data/routes'
import { buildPlan } from '../src/lib/plan'
import { DEFAULT_STATE, defaultStops, type TripState } from '../src/lib/state'
import { hydrate, type Leg } from '../src/lib/legs'
import { computeDay } from '../src/lib/tripStats'
import { fastDist } from '../src/lib/geo'
import { PLACES } from '../src/data/places'
import type { Charger } from '../src/lib/charging'
import type { RouteMetrics } from '../src/lib/scoring'

const chargers = (JSON.parse(readFileSync('public/data/superchargers.json', 'utf8')) as { sites: Charger[] }).sites
const legs: Record<string, Leg> = {}
const getLeg = (key: string) => {
  if (!legs[key]) {
    const f = `public/data/legs/${key}.json`
    if (existsSync(f)) legs[key] = hydrate(JSON.parse(readFileSync(f, 'utf8')))
  }
  return legs[key]
}
const out: Record<string, Record<string, RouteMetrics>> = {}
for (const r of ROUTES) {
  out[r.id] = {}
  for (const dir of r.directions === 'both' ? (['out', 'ret'] as const) : (['ret'] as const)) {
    const other = r.id === 'r1' ? 'r2' : 'r1'
    const st: TripState = {
      ...DEFAULT_STATE,
      out: dir === 'out' ? { route: r.id, stops: defaultStops(r.id), nights: [1, 1, 1, 1, 1], crossing: 'tunnel' } : { ...DEFAULT_STATE.out, route: other, stops: defaultStops(other) },
      ret: dir === 'ret' ? { route: r.id, stops: defaultStops(r.id), nights: [1, 1, 1, 1, 1], crossing: 'tunnel' } : DEFAULT_STATE.ret,
    }
    const plan = buildPlan(st)
    const days = plan.days.filter((d) => d.dir === dir && d.kind === 'drive')
    for (const d of days) for (const s of d.segments) if (s.kind === 'drive') getLeg(s.key)
    const stats = days.map((d) => computeDay(d, legs, chargers, st, null))
    if (stats.some((s) => !s.ready)) {
      console.warn(`${r.id} ${dir}: missing legs — skipped`)
      continue
    }
    const noSc = r.stops.filter((slot) => {
      const pl = PLACES[slot.default]
      return !chargers.some((c) => (c.s === 'OPEN' || c.s === 'EXPANDING') && fastDist([c.lon, c.lat], [pl.lon, pl.lat]) < 25000)
    }).length
    out[r.id][dir] = {
      km: Math.round(stats.reduce((a, s) => a + s.km, 0)),
      hours: +stats.reduce((a, s) => a + s.driveH, 0).toFixed(1),
      ascent: Math.round(stats.reduce((a, s) => a + s.ascent, 0)),
      maxEle: Math.round(Math.max(...stats.map((s) => s.maxEle))),
      longestDayKm: Math.round(Math.max(...stats.map((s) => s.km))),
      maxGapKm: Math.round(Math.max(0, ...stats.flatMap((s) => s.charging?.gaps.map((g) => g.km) ?? [0]), ...stats.map((s) => {
        const near = s.charging?.near ?? []
        const pts = [0, ...near.map((c) => c.km), s.km]
        let m = 0
        for (let i = 1; i < pts.length; i++) m = Math.max(m, pts[i] - pts[i - 1])
        return m
      }))),
      stopsWithoutSc: noSc,
      chargeStops: stats.reduce((a, s) => a + (s.charging?.stops.length ?? 0), 0),
    }
    console.log(r.id, dir, out[r.id][dir])
  }
}
writeFileSync('public/data/route-metrics.json', JSON.stringify({ builtAt: new Date().toISOString(), routes: out }))
