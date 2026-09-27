// Downloads a 500px copy of every resolved photo into public/photos/<id>.jpg so the app does not
// depend on hotlinking (Wikimedia rate-limits) and works offline. Attribution stays in photos.json.
// Usage: npm run data:photos:download   (slow on purpose — ~1 request/second)
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'

const j = JSON.parse(readFileSync('src/data/photos.json', 'utf8')) as { photos: Record<string, { src: string; local?: string }> }
mkdirSync('public/photos', { recursive: true })
const UA = { 'User-Agent': 'eurotrip-planner/1.0 (personal trip planner; https://github.com/liamgallagher/eurotrip)' }
let n = 0
for (const [id, p] of Object.entries(j.photos)) {
  const file = `public/photos/${id}.jpg`
  if (!existsSync(file)) {
    const url = p.src.replace('/960px-', '/500px-')
    for (let attempt = 0; attempt < 5; attempt++) {
      const r = await fetch(url, { headers: UA })
      if (r.status === 429) { await new Promise((res) => setTimeout(res, 5000 * (attempt + 1))); continue }
      if (!r.ok) { console.warn(id, r.status); break }
      writeFileSync(file, Buffer.from(await r.arrayBuffer()))
      n++
      break
    }
    await new Promise((res) => setTimeout(res, 1200))
  }
  if (existsSync(file)) p.local = `photos/${id}.jpg`
}
writeFileSync('src/data/photos.json', JSON.stringify(j, null, 1))
console.log(`downloaded ${n}; ${Object.values(j.photos).filter((p) => p.local).length}/${Object.keys(j.photos).length} local`)
