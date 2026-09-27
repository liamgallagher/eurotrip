// Finds a large, professional-quality photo on Pexels for every highlight (free licence; credit shown in
// the app). Only accepts a result whose description mentions the place, otherwise the Wikimedia photo stays.
// Usage: PEXELS_API_KEY=… npm run data:pexels            (only fetches highlights not yet resolved)
//        PEXELS_API_KEY=… npm run data:pexels -- --all   (re-query everything)
// Curate with scripts/pexels-overrides.json: { "<highlight id>": <pexels photo id> | "wikimedia" | "<search query>" }
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { HIGHLIGHTS } from '../src/data/highlights'
import { EXCLUDED_HIGHLIGHTS } from '../src/data/exclusions'
import { COUNTRY_NAMES } from '../src/lib/countries'

const KEY = process.env.PEXELS_API_KEY
if (!KEY) {
  console.error('Set PEXELS_API_KEY (free key from https://www.pexels.com/api/).')
  process.exit(1)
}
const OUT = 'src/data/pexels.json'
const OVERRIDES: Record<string, string | number> = existsSync('scripts/pexels-overrides.json') ? JSON.parse(readFileSync('scripts/pexels-overrides.json', 'utf8')) : {}
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { photos: {}, rejected: {} }
const all = [...Object.values(HIGHLIGHTS), ...EXCLUDED_HIGHLIGHTS]
const redo = process.argv.includes('--all')

interface PexelsPhoto {
  id: number
  width: number
  height: number
  url: string
  alt: string
  avg_color: string
  photographer: string
  photographer_url: string
  src: { original: string; large2x: string; large: string }
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const STOP = new Set(['the', 'and', 'of', 'lake', 'pass', 'road', 'castle', 'valley', 'old', 'town', 'high', 'alpine', 'di', 'del', 'de', 'la', 'le', 'am', 'see', 'city'])
const keywords = (name: string) => norm(name).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w))

async function api(path: string): Promise<unknown> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(`https://api.pexels.com/v1/${path}`, { headers: { Authorization: KEY! } })
    if (r.status === 429) {
      const wait = Number(r.headers.get('retry-after') ?? 60)
      console.log(`rate limited — waiting ${wait}s`)
      await new Promise((res) => setTimeout(res, wait * 1000))
      continue
    }
    if (!r.ok) throw new Error(`Pexels ${r.status} for ${path}`)
    await new Promise((res) => setTimeout(res, 400))
    return r.json()
  }
  throw new Error('Pexels kept rate-limiting')
}

const slim = (p: PexelsPhoto) => ({
  pexelsId: p.id, w: p.width, h: p.height, page: p.url, alt: p.alt, color: p.avg_color,
  photographer: p.photographer, photographerUrl: p.photographer_url, src: p.src.original.split('?')[0],
})

const photos: Record<string, unknown> = { ...prev.photos }
const rejected: Record<string, string> = { ...prev.rejected }
let n = 0
for (const h of all) {
  const o = OVERRIDES[h.id]
  if (o === 'wikimedia') { delete photos[h.id]; rejected[h.id] = 'override: wikimedia'; continue }
  if (!redo && (photos[h.id] || rejected[h.id]) && o === undefined) continue
  try {
    if (typeof o === 'number') {
      photos[h.id] = slim((await api(`photos/${o}`)) as PexelsPhoto)
      delete rejected[h.id]
      continue
    }
    const query = typeof o === 'string' ? o : `${h.name.replace(/\(.*?\)/g, '')} ${COUNTRY_NAMES[h.country] ?? ''}`.trim()
    const res = (await api(`search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape&size=large`)) as { photos: PexelsPhoto[] }
    const keys = keywords(h.name)
    const wiki = h.wiki ? keywords(h.wiki) : []
    const relevant = res.photos.filter((p) => {
      const alt = norm(p.alt ?? '')
      return [...keys, ...wiki].some((k) => alt.includes(k))
    })
    const pick = (typeof o === 'string' ? res.photos : relevant).sort((a, b) => b.width - a.width).find((p) => p.width >= 2000)
    if (pick) {
      photos[h.id] = slim(pick)
      delete rejected[h.id]
      n++
      console.log(`✓ ${h.id}: "${pick.alt}" by ${pick.photographer}`)
    } else {
      delete photos[h.id]
      rejected[h.id] = `no relevant result for "${query}" (${res.photos.length} results)`
      console.log(`– ${h.id}: keeping Wikimedia (${rejected[h.id]})`)
    }
  } catch (e) {
    console.error(`! ${h.id}: ${(e as Error).message}`)
  }
}
writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), photos, rejected }, null, 1))
console.log(`Pexels photos: ${Object.keys(photos).length}/${all.length} (${n} new). Others use Wikimedia.`)

// Contact sheet for quick visual review
const rows = all.map((h) => {
  const p = photos[h.id] as { src: string; photographer: string; alt: string } | undefined
  return `<figure><img loading="lazy" src="${p ? `${p.src}?auto=compress&cs=tinysrgb&w=480` : ''}"><figcaption><b>${h.id}</b><br>${p ? `${p.alt} — ${p.photographer}` : '(Wikimedia)'}</figcaption></figure>`
})
writeFileSync('pexels-review.html', `<!doctype html><meta charset="utf-8"><title>Pexels review</title><style>body{font:12px sans-serif;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;margin:8px}img{width:100%;aspect-ratio:3/2;object-fit:cover;background:#eee}figure{margin:0}</style>${rows.join('')}`)
console.log('Review sheet: pexels-review.html (not committed)')
