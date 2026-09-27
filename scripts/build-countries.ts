// Downloads Natural Earth 1:50m countries and writes a small simplified subset for route country lookups.
// Usage: npm run data:countries
import { writeFileSync, mkdirSync } from 'node:fs'
import { simplify, type LngLat } from '../src/lib/geo'

const URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson'
const WANT = ['GB', 'FR', 'BE', 'NL', 'LU', 'DE', 'CH', 'LI', 'AT', 'IT', 'SI', 'CZ', 'HR', 'SK', 'HU', 'PL', 'DK', 'ES', 'MC', 'SM', 'VA', 'AD']

const res = await fetch(URL)
const fc = (await res.json()) as { features: { properties: Record<string, string>; geometry: { type: string; coordinates: unknown } }[] }
const out = []
for (const f of fc.features) {
  const p = f.properties
  let cc = p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : p.ISO_A2
  if (p.ADMIN === 'France') cc = 'FR'
  if (!WANT.includes(cc)) continue
  const polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as LngLat[][][]
  // keep only European parts (drop French overseas territories etc.)
  const eu = polys
    .filter((poly) => poly[0].some(([x, y]) => x > -12 && x < 30 && y > 34 && y < 62))
    .map((poly) => poly.map((ring) => simplify(ring, 250).map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)] as LngLat)))
  let minX = 180, minY = 90, maxX = -180, maxY = -90
  for (const poly of eu) for (const [x, y] of poly[0]) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  out.push({ cc, name: p.ADMIN, bbox: [minX, minY, maxX, maxY], polys: eu })
}
mkdirSync('public/data', { recursive: true })
writeFileSync('public/data/countries.json', JSON.stringify(out))
console.log(`countries.json: ${out.length} countries`, out.map((c) => c.cc).join(' '))
