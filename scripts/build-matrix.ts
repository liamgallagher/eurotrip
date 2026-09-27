// Drive-time matrix between every overnight place and every highlight (OSRM /table), so the planner can
// suggest next stops, measure detours and test whether a must-see is still reachable without routing live.
// Usage: npm run data:matrix
import { writeFileSync } from 'node:fs'
import { PLACES } from '../src/data/places'
import { ALL_HIGHLIGHTS } from '../src/lib/scoring'

const OSRM = process.env.OSRM_URL || 'https://router.project-osrm.org'
const BLOCK = 50

const nodes: { id: string; lat: number; lon: number }[] = []
for (const p of Object.values(PLACES)) nodes.push({ id: `p:${p.id}`, lat: p.lat, lon: p.lon })
for (const h of Object.values(ALL_HIGHLIGHTS)) nodes.push({ id: `h:${h.id}`, lat: h.lat, lon: h.lon })

const n = nodes.length
const dur = new Array<number>(n * n).fill(-1)
const km = new Array<number>(n * n).fill(-1)
console.log(`${n} nodes → ${Math.ceil(n / BLOCK) ** 2} requests`)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

for (let a = 0; a < n; a += BLOCK) {
  for (let b = 0; b < n; b += BLOCK) {
    const src = nodes.slice(a, a + BLOCK)
    const dst = nodes.slice(b, b + BLOCK)
    const same = a === b
    const coords = same ? src : [...src, ...dst]
    const q = same ? '' : `&sources=${src.map((_, i) => i).join(';')}&destinations=${dst.map((_, i) => src.length + i).join(';')}`
    const url = `${OSRM}/table/v1/driving/${coords.map((c) => `${c.lon.toFixed(5)},${c.lat.toFixed(5)}`).join(';')}?annotations=duration,distance${q}`
    let json: { code: string; durations: (number | null)[][]; distances: (number | null)[][] } | null = null
    for (let attempt = 0; attempt < 5 && !json; attempt++) {
      const res = await fetch(url)
      if (res.ok) json = await res.json()
      else await sleep(2000 * 2 ** attempt)
    }
    if (!json || json.code !== 'Ok') throw new Error(`table failed at ${a},${b}`)
    json.durations.forEach((row, i) =>
      row.forEach((d, j) => {
        dur[(a + i) * n + (b + j)] = d == null ? -1 : Math.round(d / 60)
        const m = json!.distances[i][j]
        km[(a + i) * n + (b + j)] = m == null ? -1 : Math.round(m / 1000)
      }),
    )
    process.stdout.write('.')
    await sleep(1100)
  }
}
console.log()
writeFileSync(
  'public/data/matrix.json',
  JSON.stringify({ builtAt: new Date().toISOString(), source: OSRM, ids: nodes.map((x) => x.id), dur, km }),
)
console.log('wrote public/data/matrix.json')
