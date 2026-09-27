// Dev helper: writes a plausible plan (option A with some hearts) as JSON for screenshot runs.
import { readFileSync, writeFileSync } from 'node:fs'
import { Graph } from '../../src/app/engine/graph'
import { Planner } from '../../src/app/engine/planner'
import { tripOptions, emptyState, applyOption } from '../../src/app/engine/trip'
const g = new Graph(JSON.parse(readFileSync('public/data/matrix.json', 'utf8')))
const pl = new Planner(g, JSON.parse(readFileSync('public/data/curated.json', 'utf8')).days)
let st = emptyState('2027-05-10')
st.hearts.liam = ['hallstatt', 'grossglockner', 'lake-como']
st.hearts.tatiana = ['hallstatt', 'bruges', 'lake-como', 'venice']
st = applyOption(st, tripOptions(pl, st)[0])
writeFileSync(process.argv[2] ?? 'plan.json', JSON.stringify(st))
console.log(st.out.stops.map((s) => s.place), st.ret.stops.map((s) => s.place))
