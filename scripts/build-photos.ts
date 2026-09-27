// Resolves a properly licensed photo for every highlight: the Wikipedia lead image (free licences only)
// or an explicit Commons file (`commons` field / OVERRIDES below), with author + licence for attribution.
// Usage: npm run data:photos
import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import { HIGHLIGHTS } from '../src/data/highlights'
import { EXCLUDED_HIGHLIGHTS } from '../src/data/exclusions'

/** Hand-picked replacements where the lead image is a map, logo or poor fit. */
export const OVERRIDES: Record<string, string> = JSON.parse(existsSync('scripts/photo-overrides.json') ? readFileSync('scripts/photo-overrides.json', 'utf8') : '{}')

const UA = { 'User-Agent': 'eurotrip-planner/1.0 (personal trip planner; https://github.com/liamgallagher/eurotrip)' }
const all = [...Object.values(HIGHLIGHTS), ...EXCLUDED_HIGHLIGHTS]
/** Wikimedia rate-limits shared IPs hard: back off and retry. */
async function getJson(u: string) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = await fetch(u, { headers: UA })
    const t = await r.text()
    if (t.startsWith('{')) {
      await new Promise((res) => setTimeout(res, 1500))
      return JSON.parse(t)
    }
    await new Promise((res) => setTimeout(res, 10000 * (attempt + 1)))
  }
  throw new Error('Wikimedia API kept rate-limiting; try again later')
}
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))

// 1. wiki title → lead image file
const titleToFile: Record<string, string> = {}
const titles = [...new Set(all.filter((h) => !OVERRIDES[h.id] && !h.commons && h.wiki).map((h) => h.wiki!))]
for (const batch of chunk(titles, 40)) {
  const u = `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&prop=pageimages&piprop=name&pilicense=free&titles=${encodeURIComponent(batch.join('|'))}`
  const j = await getJson(u)
  const norm: Record<string, string> = {}
  for (const n of j.query.normalized ?? []) norm[n.to] = n.from
  for (const r of j.query.redirects ?? []) norm[r.to] = norm[r.from] ?? r.from
  for (const p of j.query.pages) if (p.pageimage) titleToFile[norm[p.title] ?? p.title] = p.pageimage
}

// 2. file → url + attribution
const files = new Set<string>()
const hlFile: Record<string, string> = {}
for (const h of all) {
  const f = OVERRIDES[h.id] ?? h.commons ?? (h.wiki ? titleToFile[h.wiki] : undefined)
  if (f) { hlFile[h.id] = f.replace(/^File:/, ''); files.add(hlFile[h.id]) }
}
const strip = (s = '') => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
const info: Record<string, unknown> = {}
for (const batch of chunk([...files], 40)) {
  const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=960&titles=${encodeURIComponent(batch.map((f) => 'File:' + f).join('|'))}`
  const j = await getJson(u)
  const norm: Record<string, string> = {}
  for (const n of j.query.normalized ?? []) norm[n.to] = n.from
  for (const p of j.query.pages) {
    const ii = p.imageinfo?.[0]
    if (!ii) continue
    const m = ii.extmetadata ?? {}
    const name = (norm[p.title] ?? p.title).replace(/^File:/, '')
    info[name] = {
      src: String(ii.thumburl).split('?')[0],
      w: ii.thumbwidth, h: ii.thumbheight,
      page: ii.descriptionurl,
      author: strip(m.Artist?.value).slice(0, 80) || 'Unknown',
      license: strip(m.LicenseShortName?.value) || 'See file page',
      licenseUrl: m.LicenseUrl?.value ?? null,
    }
  }
}
const out: Record<string, unknown> = {}
const missing: string[] = []
for (const h of all) {
  const f = hlFile[h.id]
  if (f && info[f]) out[h.id] = { file: f, ...(info[f] as object) }
  else missing.push(h.id)
}
writeFileSync('src/data/photos.json', JSON.stringify({ fetchedAt: new Date().toISOString(), photos: out }, null, 1))
console.log(`photos: ${Object.keys(out).length}/${all.length}; missing: ${missing.join(', ') || 'none'}`)
