// Snapshot of Tesla Superchargers from supercharge.info (public data), filtered to our corridor.
// Usage: npm run data:chargers
import { writeFileSync } from 'node:fs'

const CC: Record<string, string> = {
  'United Kingdom': 'GB', France: 'FR', Belgium: 'BE', Netherlands: 'NL', Luxembourg: 'LU', Germany: 'DE', Switzerland: 'CH',
  Liechtenstein: 'LI', Austria: 'AT', Italy: 'IT', Slovenia: 'SI', Czechia: 'CZ', 'Czech Republic': 'CZ', Croatia: 'HR',
  Slovakia: 'SK', Hungary: 'HU', Poland: 'PL', Denmark: 'DK', Spain: 'ES', Monaco: 'MC', 'San Marino': 'SM',
}
const KEEP = new Set(['OPEN', 'EXPANDING', 'CONSTRUCTION', 'CLOSED_TEMP'])

interface Site {
  id: number; name: string; status: string; stallCount?: number; powerKilowatt?: number; otherEVs?: boolean; dateOpened?: string
  gps: { latitude: number; longitude: number }; address: { city?: string; country?: string }
}
const res = await fetch('https://supercharge.info/service/supercharge/allSites')
const all = (await res.json()) as Site[]
const out = all
  .filter((s) => KEEP.has(s.status) && s.gps && s.gps.latitude > 42.5 && s.gps.latitude < 53.5 && s.gps.longitude > -3 && s.gps.longitude < 19)
  .map((s) => ({
    id: s.id,
    n: s.name.replace(/, (United Kingdom|France|Belgium|Netherlands|Germany|Switzerland|Austria|Italy|Slovenia|Czech Republic|Czechia|Luxembourg|Liechtenstein|Croatia)$/, ''),
    lat: +s.gps.latitude.toFixed(5),
    lon: +s.gps.longitude.toFixed(5),
    st: s.stallCount ?? null,
    kw: s.powerKilowatt ?? null,
    s: s.status,
    cc: CC[s.address?.country ?? ''] ?? '??',
    o: s.dateOpened ?? null,
  }))
writeFileSync('public/data/superchargers.json', JSON.stringify({ source: 'https://supercharge.info', fetchedAt: new Date().toISOString(), sites: out }))
const by: Record<string, number> = {}
out.forEach((s) => (by[s.s] = (by[s.s] ?? 0) + 1))
console.log(`superchargers.json: ${out.length} sites`, by)
