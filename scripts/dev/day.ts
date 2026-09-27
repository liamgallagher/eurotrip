import { readFileSync } from 'node:fs'
import { Graph } from '../../src/app/engine/graph'
import { Planner, dayLegKey } from '../../src/app/engine/planner'
import { buildTrip } from '../../src/app/engine/trip'
const g = new Graph(JSON.parse(readFileSync('public/data/matrix.json', 'utf8')))
const pl = new Planner(g, JSON.parse(readFileSync('public/data/curated.json', 'utf8')).days)
const st = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const trip = buildTrip(pl, st)
for (const d of trip.days) if (d.e) { const k = dayLegKey(d.e); console.log(d.n, d.e.from, d.e.to, d.e.way.id, d.e.min, d.e.way.min, d.e.detoursTaken, k.waypoints.map((w) => w.name).join(' > ')) }
