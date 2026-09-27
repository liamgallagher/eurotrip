// Routes every leg the app can show by default (all routes × directions × crossings × single stop swaps ×
// single option toggles) through OSRM, samples elevation and countries, and writes /public/data/legs/<key>.json.
// Usage: npm run data:legs   (add --force to refetch everything; --only=r3 to limit to one route)
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from 'node:fs'
import { ROUTES } from '../src/data/routes'
import { buildPlan } from '../src/lib/plan'
import { DEFAULT_STATE, defaultStops, optKey, type TripState, type CrossingId } from '../src/lib/state'
import { buildLeg, LEG_FORMAT, type Waypoint } from '../src/lib/legs'
import { nodeCountries, nodeDem } from './node-deps'

const force = process.argv.includes('--force')
const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]
const OUT = 'public/data/legs'
mkdirSync(OUT, { recursive: true })

const want = new Map<string, Waypoint[]>()
function collect(state: TripState, dir: 'out' | 'ret') {
  const plan = buildPlan(state)
  for (const d of plan.days) {
    if (d.dir !== dir && !(d.dir === 'ret' && dir === 'ret')) continue
    for (const s of d.segments) if (s.kind === 'drive') want.set(s.key, s.waypoints)
  }
}

for (const r of ROUTES) {
  if (only && r.id !== only) continue
  const dirs: ('out' | 'ret')[] = r.directions === 'both' ? ['out', 'ret'] : ['ret']
  for (const dir of dirs) {
    for (const crossing of ['tunnel', 'ferry'] as CrossingId[]) {
      const other = r.id === 'r1' ? 'r2' : 'r1'
      const mk = (stops: string[], options: Record<string, boolean> = {}): TripState => ({
        ...DEFAULT_STATE,
        options,
        out: dir === 'out' ? { route: r.id, stops, nights: [1, 1, 1, 1, 1], crossing } : { ...DEFAULT_STATE.out, route: other, stops: defaultStops(other) },
        ret: dir === 'ret' ? { route: r.id, stops, nights: [1, 1, 1, 1, 1], crossing } : { ...DEFAULT_STATE.ret, route: other === 'r2' ? 'r3' : 'r2', stops: defaultStops(other === 'r2' ? 'r3' : 'r2') },
      })
      const base = defaultStops(r.id)
      collect(mk(base), dir)
      if (crossing === 'ferry') continue // swaps/options only matter away from the port
      r.stops.forEach((slot, i) => {
        for (const alt of slot.swaps) {
          const s = [...base]
          s[i] = alt
          collect(mk(s), dir)
        }
      })
      r.days.forEach((d, di) => {
        for (const o of d.options ?? []) collect(mk(base, { [optKey(r.id, di, o.id)]: !o.defaultOn }), dir)
      })
    }
  }
}

console.log(`${want.size} unique legs wanted`)
if (process.argv.includes('--prune') && !only) {
  for (const f of readdirSync(OUT)) if (!want.has(f.replace('.json', ''))) { unlinkSync(`${OUT}/${f}`); console.log('pruned', f) }
}
const dem = nodeDem()
const countries = nodeCountries()
let done = 0, fetched = 0, failed = 0
for (const [key, wps] of want) {
  done++
  const file = `${OUT}/${key}.json`
  if (!force && existsSync(file)) {
    try {
      if (JSON.parse(readFileSync(file, 'utf8')).v === LEG_FORMAT) continue
    } catch { /* refetch */ }
  }
  try {
    const leg = await buildLeg(wps, { dem, countries })
    writeFileSync(file, JSON.stringify(leg))
    fetched++
    const bad = leg.snaps.map((s, i) => [wps[i].name, s] as const).filter(([, s]) => s > 500)
    console.log(`[${done}/${want.size}] ${wps[0].name} → ${wps[wps.length - 1].name}: ${(leg.distance / 1000).toFixed(0)} km, ${(leg.duration / 3600).toFixed(1)} h${bad.length ? `  ⚠ far snaps: ${bad.map(([n, s]) => `${n} ${s}m`).join(', ')}` : ''}`)
  } catch (e) {
    failed++
    console.error(`[${done}/${want.size}] FAILED ${wps.map((w) => w.name).join(' → ')}: ${(e as Error).message}`)
  }
}
writeFileSync('public/data/legs-index.json', JSON.stringify({ builtAt: new Date().toISOString(), count: want.size }))
console.log(`done: ${fetched} fetched, ${failed} failed, ${want.size - fetched - failed} cached`)
