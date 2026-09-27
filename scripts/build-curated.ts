// Indexes every curated day (all stop options, both directions) with its OSRM distance/time, routing and
// caching any leg not already in the snapshot. Writes public/data/curated.json for the planner.
// Usage: npm run data:curated
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { allCuratedDays } from '../src/app/engine/curated'
import { buildLeg, hydrate, LEG_FORMAT, type LegData } from '../src/lib/legs'
import { nodeCountries, nodeDem } from './node-deps'

const days = allCuratedDays()
console.log(`${days.length} curated days`)
const dem = nodeDem()
const countries = nodeCountries()
const rows: unknown[] = []
let fetched = 0
for (const d of days) {
  const file = `public/data/legs/${d.key}.json`
  let leg: LegData | null = null
  if (existsSync(file)) {
    try {
      const j = JSON.parse(readFileSync(file, 'utf8')) as LegData
      if (j.v === LEG_FORMAT) leg = j
    } catch { /* refetch */ }
  }
  if (!leg) {
    try {
      leg = await buildLeg(d.waypoints, { dem, countries })
      writeFileSync(file, JSON.stringify(leg))
      fetched++
      process.stdout.write('+')
    } catch (e) {
      console.error(`\nFAILED ${d.route.id} day ${d.day} ${d.dir} ${d.from}>${d.to}: ${(e as Error).message}`)
      continue
    }
  }
  const h = hydrate(leg)
  rows.push({
    r: d.route.id,
    d: d.day,
    dir: d.dir,
    from: d.from,
    to: d.to,
    key: d.key,
    km: Math.round(leg.distance / 1000),
    min: Math.round(leg.duration / 60),
    maxEle: Math.round(h.maxEle),
    ascent: h.ascent,
  })
}
writeFileSync('public/data/curated.json', JSON.stringify({ builtAt: new Date().toISOString(), days: rows }))
console.log(`\nwrote ${rows.length} rows, fetched ${fetched} new legs`)
