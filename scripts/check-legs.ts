// Sanity-checks cached legs: prints distance, time, max elevation and suspicious waypoint snaps,
// and asserts that known pass days actually climb over the pass (catches the router "optimising" to a tunnel).
// Usage: npm run data:check
import { readdirSync, readFileSync } from 'node:fs'
import { hydrate, type LegData } from '../src/lib/legs'

const EXPECT: [RegExp, number][] = [
  [/Hochtor/, 2350], [/Vršič/, 1500], [/Julier/, 2200], [/Bernina/, 2200], [/Arlberg Pass/, 1700], [/Sella Pass/, 2150],
  [/Pordoi/, 2150], [/Predil/, 1100], [/Wurzen/, 1000], [/Loibl/, 1000], [/Col des Aravis/, 1450], [/Eisental/, 1900],
  [/Obertauern/, 1700], [/Passo del Tonale/, 1850], [/Mendel/, 1300], [/Rossfeld/, 1350], [/Semmering/, 950], [/Ofen/, 2100],
]
let problems = 0
for (const f of readdirSync('public/data/legs')) {
  const d = JSON.parse(readFileSync(`public/data/legs/${f}`, 'utf8')) as LegData
  const leg = hydrate(d)
  const names = d.names.join(' → ')
  const snaps = d.snaps.map((s, i) => [d.names[i], s] as const).filter(([, s]) => s > 400)
  const issues: string[] = []
  for (const [re, min] of EXPECT) if (d.names.some((n) => re.test(n)) && leg.maxEle < min) issues.push(`max ${leg.maxEle} m < expected ${min} m for ${re.source}`)
  if (snaps.length) issues.push(`snaps: ${snaps.map(([n, s]) => `${n} ${s} m`).join(', ')}`)
  if (issues.length || process.argv.includes('-v')) {
    console.log(`${issues.length ? '⚠' : '✓'} ${names}\n   ${(d.distance / 1000).toFixed(0)} km · ${(d.duration / 3600).toFixed(1)} h · max ${leg.maxEle} m · +${leg.ascent} m · ${d.countries.map((c) => c[0]).join('/')}${issues.length ? '\n   ' + issues.join('\n   ') : ''}`)
  }
  problems += issues.length
}
console.log(problems ? `${problems} issue(s)` : 'all legs OK')
