import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { Graph } from '../../src/app/engine/graph'
import { Planner } from '../../src/app/engine/planner'
import { buildTrip } from '../../src/app/engine/trip'
import { hydrate } from '../../src/lib/legs'
const g = new Graph(JSON.parse(readFileSync('public/data/matrix.json', 'utf8')))
const pl = new Planner(g, JSON.parse(readFileSync('public/data/curated.json', 'utf8')).days)
const st = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const trip = buildTrip(pl, st)
const pts: string[] = []
for (const d of trip.days.slice(0, 4)) for (const s of d.segments) if (s.kind === 'drive' && readdirSync('public/data/legs').includes(`${s.key}.json`)) {
  const leg = hydrate(JSON.parse(readFileSync(`public/data/legs/${s.key}.json`, 'utf8')))
  for (const c of leg.coords) pts.push(`<trkpt lat="${c[1]}" lon="${c[0]}"></trkpt>`)
}
writeFileSync(process.argv[3], `<?xml version="1.0"?><gpx version="1.1"><trk><trkseg>${pts.join('')}</trkseg></trk></gpx>`)
console.log(pts.length, 'points')
