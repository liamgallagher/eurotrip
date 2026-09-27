import { readFileSync } from 'node:fs'
import { Graph } from '../../src/app/engine/graph'
import { Planner } from '../../src/app/engine/planner'
import { tripOptions, emptyState, applyOption, suggest, buildTrip } from '../../src/app/engine/trip'
import { PLACES } from '../../src/data/places'
const g = new Graph(JSON.parse(readFileSync('public/data/matrix.json', 'utf8')))
const pl = new Planner(g, JSON.parse(readFileSync('public/data/curated.json', 'utf8')).days)
let st = emptyState()
const fmt = (p: string[]) => p.map((x) => PLACES[x].name.split(' ')[0]).join(' → ')
let t = Date.now()
const opts = tripOptions(pl, st)
console.log('options', Date.now() - t, 'ms')
for (const o of opts) console.log(o.name, '|', fmt(o.out.places), '||', fmt(o.ret.places), Math.round(o.driveMin / 60), 'h', o.km, 'km', o.score.toFixed(0), o.out.days.map((d) => (d.min/60).toFixed(1) + (d.way.kind==='curated'?'*':'')).join(','), '/', o.ret.days.map((d) => (d.min/60).toFixed(1)+(d.way.kind==='curated'?'*':'')).join(','))
st.hearts.liam = ['hallstatt', 'grossglockner']
st.hearts.tatiana = ['lake-como', 'hallstatt', 'bruges']
t = Date.now()
const o2 = tripOptions(pl, st)
console.log('with hearts', Date.now() - t, 'ms')
for (const o of o2) console.log(o.name, '|', fmt(o.out.places), '||', fmt(o.ret.places), 'missed', o.missed)
st = applyOption(st, o2[0])
t = Date.now()
const s = suggest(pl, st, 'out', 1)
console.log('suggest', Date.now() - t, 'ms', s.list.length)
for (const x of s.list.slice(0, 8)) console.log(' ', PLACES[x.place].name, x.score.toFixed(0), (x.day.min / 60).toFixed(1) + 'h', 'lost', x.lost, 'gained', x.gained, x.reenter ?? '', '→', fmt(x.completion.places))
const trip = buildTrip(pl, st)
for (const d of trip.days) console.log(d.n, d.date, d.dir, d.kind, d.title, d.sleep, d.e ? (d.e.min/60).toFixed(1) + 'h ' + d.e.km + 'km ' + d.e.covered.length + 'hl' : '')
